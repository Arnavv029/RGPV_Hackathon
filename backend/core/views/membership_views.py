"""
Station Owner Membership & Autopay Views
=========================================
Endpoints:
  GET  /api/owner/membership/                       → Current plan, quota, stats, orders
  POST /api/owner/membership/autopay/               → Toggle autopay / change renewal plan
  POST /api/owner/membership/razorpay/create-order/ → Create Razorpay order for membership
  POST /api/owner/membership/razorpay/verify/       → Verify payment & activate plan
  POST /api/owner/membership/simulate-purchase/     → Demo/test purchase without live gateway
"""

import time
import uuid
import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import OwnerMembership, MembershipOrder, Booking, Station
from core.serializers import OwnerMembershipSerializer, MembershipOrderSerializer
from core.utils.membership_rules import (
    MEMBERSHIP_PLANS,
    FREE_TIER_CONFIG,
    get_or_create_owner_membership,
)
from core.utils.razorpay_client import create_order, verify_payment_signature

logger = logging.getLogger(__name__)


def is_owner_or_403(request):
    """Ensure the user has role='owner'."""
    if request.user.role != 'owner':
        return Response(
            {'error': 'Access denied. Only station owners can access membership features.'},
            status=status.HTTP_403_FORBIDDEN
        )
    return None


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def owner_membership_detail_view(request):
    """
    Returns the station owner's membership status, booking quota, autopay preferences,
    available plans, and transaction history.
    """
    err = is_owner_or_403(request)
    if err:
        return err

    membership = get_or_create_owner_membership(request.user)
    membership.refresh_priority()
    membership.save()

    orders = MembershipOrder.objects.filter(owner=request.user).order_by('-created_at')[:20]

    # Calculate stats
    stations_count = Station.objects.filter(owner=request.user).count()
    owner_bookings = Booking.objects.filter(station__owner=request.user)
    total_bookings = owner_bookings.count()
    completed_bookings = owner_bookings.filter(status__in=['confirmed', 'completed']).count()
    
    # Calculate total commission deducted (when on free tier) vs estimated commission saved
    total_commission_paid = owner_bookings.aggregate(c=Sum('commission_amount'))['c'] or Decimal('0.00')
    gross_revenue = owner_bookings.aggregate(a=Sum('amount_paid'))['a'] or Decimal('0.00')

    serializer = OwnerMembershipSerializer(membership)
    orders_serializer = MembershipOrderSerializer(orders, many=True)

    return Response({
        'membership': serializer.data,
        'plans': MEMBERSHIP_PLANS,
        'free_tier': FREE_TIER_CONFIG,
        'orders': orders_serializer.data,
        'stats': {
            'stations_count': stations_count,
            'total_bookings': total_bookings,
            'completed_bookings': completed_bookings,
            'bookings_remaining': membership.bookings_remaining,
            'bookings_used': membership.bookings_used,
            'total_credited': membership.total_bookings_credited,
            'gross_revenue': float(gross_revenue),
            'total_commission_paid': float(total_commission_paid),
            'is_priority': membership.is_priority,
            'free_plan_active': membership.bookings_remaining == 0,
        }
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def owner_membership_toggle_autopay_view(request):
    """
    Enables or disables Autopay, and optionally updates the default renewal plan.
    Body:
      {
        "is_autopay_enabled": true,
        "autopay_plan": "plan_999" | "plan_1299" | "plan_1499"
      }
    """
    err = is_owner_or_403(request)
    if err:
        return err

    membership = get_or_create_owner_membership(request.user)
    data = request.data

    if 'is_autopay_enabled' in data:
        membership.is_autopay_enabled = bool(data.get('is_autopay_enabled'))

    if 'autopay_plan' in data:
        plan_key = data.get('autopay_plan')
        if plan_key in MEMBERSHIP_PLANS:
            membership.autopay_plan = plan_key
        else:
            return Response(
                {'error': f'Invalid plan: {plan_key}. Valid plans: {list(MEMBERSHIP_PLANS.keys())}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    membership.save()

    return Response({
        'message': f"Autopay {'enabled' if membership.is_autopay_enabled else 'disabled'} successfully.",
        'membership': OwnerMembershipSerializer(membership).data
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def owner_membership_create_order_view(request):
    """
    Creates a Razorpay order for purchasing a membership plan (₹999, ₹1299, ₹1499).
    Body:
      { "plan": "plan_999" | "plan_1299" | "plan_1499" }
    """
    err = is_owner_or_403(request)
    if err:
        return err

    plan_key = request.data.get('plan')
    if plan_key not in MEMBERSHIP_PLANS:
        return Response(
            {'error': f'Invalid plan. Choose from: {", ".join(MEMBERSHIP_PLANS.keys())}'},
            status=status.HTTP_400_BAD_REQUEST
        )

    plan_info = MEMBERSHIP_PLANS[plan_key]
    amount_paise = plan_info['price_paise']
    receipt = f"mem-{request.user.id}-{int(time.time())}"

    try:
        rz_order = create_order(
            amount_paise=amount_paise,
            receipt=receipt,
            notes={
                'owner_id': str(request.user.id),
                'plan': plan_key,
                'plan_name': plan_info['name'],
                'bookings': str(plan_info['bookings']),
            }
        )
    except Exception as e:
        logger.error("Razorpay create_order failed for membership: %s", e)
        return Response(
            {'error': 'Payment gateway error. Please try again.'},
            status=status.HTTP_502_BAD_GATEWAY
        )

    # Save MembershipOrder record
    order = MembershipOrder.objects.create(
        owner=request.user,
        plan=plan_key,
        plan_name=plan_info['name'],
        amount=Decimal(str(plan_info['price'])),
        bookings_credited=plan_info['bookings'],
        razorpay_order_id=rz_order['id'],
        status='created'
    )

    return Response({
        'key_id': settings.RAZORPAY_KEY_ID,
        'order_id': rz_order['id'],
        'amount': amount_paise,
        'currency': 'INR',
        'plan': plan_key,
        'plan_name': plan_info['name'],
        'bookings_credited': plan_info['bookings'],
        'prefill': {
            'name': request.user.get_full_name() or request.user.username,
            'email': request.user.email or '',
            'contact': getattr(request.user, 'phone', '') or '',
        }
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def owner_membership_verify_view(request):
    """
    Verifies Razorpay signature and credits the membership bookings quota.
    Body:
      {
        "razorpay_order_id": "order_...",
        "razorpay_payment_id": "pay_...",
        "razorpay_signature": "...",
        "plan": "plan_999",
        "is_autopay": true (optional)
      }
    """
    err = is_owner_or_403(request)
    if err:
        return err

    order_id = request.data.get('razorpay_order_id')
    payment_id = request.data.get('razorpay_payment_id')
    signature = request.data.get('razorpay_signature')
    plan_key = request.data.get('plan')
    enable_autopay = request.data.get('is_autopay', None)

    if not all([order_id, payment_id, signature, plan_key]):
        return Response(
            {'error': 'Missing required payment verification parameters.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        order = MembershipOrder.objects.get(razorpay_order_id=order_id, owner=request.user)
    except MembershipOrder.DoesNotExist:
        return Response({'error': 'Membership order not found.'}, status=status.HTTP_404_NOT_FOUND)

    if order.status == 'paid':
        return Response({'error': 'This order has already been activated.'}, status=status.HTTP_400_BAD_REQUEST)

    # Verify signature
    try:
        verify_payment_signature(order_id, payment_id, signature)
    except Exception:
        order.status = 'failed'
        order.save(update_fields=['status'])
        return Response({'error': 'Payment signature verification failed.'}, status=status.HTTP_400_BAD_REQUEST)

    plan_info = MEMBERSHIP_PLANS.get(plan_key, MEMBERSHIP_PLANS['plan_999'])

    # Activate membership atomically
    with transaction.atomic():
        order.status = 'paid'
        order.razorpay_payment_id = payment_id
        order.save(update_fields=['status', 'razorpay_payment_id'])

        membership = get_or_create_owner_membership(request.user)
        membership.plan = plan_key
        membership.bookings_remaining += plan_info['bookings']
        membership.total_bookings_credited += plan_info['bookings']
        membership.is_priority = True
        membership.last_renewed_at = timezone.now()

        if enable_autopay is not None:
            membership.is_autopay_enabled = bool(enable_autopay)
            membership.autopay_plan = plan_key

        membership.save()

    return Response({
        'message': f"Congratulations! {plan_info['name']} activated with {plan_info['bookings']} bookings credited.",
        'membership': OwnerMembershipSerializer(membership).data,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def owner_membership_simulate_purchase_view(request):
    """
    Demo/fallback endpoint for test environments to simulate a membership purchase.
    Body:
      { "plan": "plan_999" | "plan_1299" | "plan_1499", "is_autopay": true/false }
    """
    err = is_owner_or_403(request)
    if err:
        return err

    plan_key = request.data.get('plan')
    if plan_key not in MEMBERSHIP_PLANS:
        return Response({'error': 'Invalid plan.'}, status=status.HTTP_400_BAD_REQUEST)

    plan_info = MEMBERSHIP_PLANS[plan_key]
    enable_autopay = request.data.get('is_autopay', False)

    fake_order_id = f"demo_order_{request.user.id}_{int(time.time())}"
    fake_payment_id = f"demo_pay_{uuid.uuid4().hex[:10]}"

    with transaction.atomic():
        order = MembershipOrder.objects.create(
            owner=request.user,
            plan=plan_key,
            plan_name=plan_info['name'],
            amount=Decimal(str(plan_info['price'])),
            bookings_credited=plan_info['bookings'],
            razorpay_order_id=fake_order_id,
            razorpay_payment_id=fake_payment_id,
            is_autopay=bool(enable_autopay),
            status='paid',
        )

        membership = get_or_create_owner_membership(request.user)
        membership.plan = plan_key
        membership.bookings_remaining += plan_info['bookings']
        membership.total_bookings_credited += plan_info['bookings']
        membership.is_priority = True
        membership.last_renewed_at = timezone.now()
        if enable_autopay is not None:
            membership.is_autopay_enabled = bool(enable_autopay)
            membership.autopay_plan = plan_key
        membership.save()

    return Response({
        'message': f"{plan_info['name']} activated successfully with {plan_info['bookings']} bookings credited!",
        'membership': OwnerMembershipSerializer(membership).data,
    }, status=status.HTTP_200_OK)
