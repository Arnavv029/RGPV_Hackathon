"""
Payment Views — Razorpay Integration
======================================
Endpoints:
  POST /api/payments/razorpay/create-order/  → Create Razorpay order, return key+order to frontend
  POST /api/payments/razorpay/verify/        → Verify signature, create Booking, return booking data
  POST /api/payments/razorpay/webhook/       → Handle Razorpay webhooks (no JWT, CSRF-exempt)
"""

import json
import time
import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from core.models import PaymentAttempt, TimeSlot, Booking
from core.serializers import BookingDetailSerializer
from core.utils.razorpay_client import (
    create_order, verify_payment_signature,
    verify_webhook_signature, refund_payment
)
from core.utils.qr_generator import generate_qr_code
from core.utils.booking_email import queue_booking_email
from core.utils.booking_rules import (
    contact_errors, slot_price, slot_unbookable_reason,
    validate_slot_duration, lock_or_split_slot
)

logger = logging.getLogger(__name__)

MINIMUM_AMOUNT_PAISE = 500   # ₹5 minimum (Razorpay requires min ₹1)


# ─────────────────────────────────────────────────────────────────────────────
# 1. CREATE ORDER
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def razorpay_create_order_view(request):
    """
    POST /api/payments/razorpay/create-order/

    Body (same fields as booking form):
      slot, full_name, phone, email, vehicle_number, vehicle_type, amount_paid

    Returns:
      { key_id, order_id, amount, currency, attempt_id, prefill }
    """
    data = request.data
    slot_id = data.get('slot')

    # 1. Validate slot
    try:
        slot = TimeSlot.objects.select_related('station').get(pk=slot_id)
    except TimeSlot.DoesNotExist:
        return Response({'error': 'Slot not found.'}, status=status.HTTP_404_NOT_FOUND)

    reason = slot_unbookable_reason(slot)
    if reason:
        return Response({'error': reason}, status=status.HTTP_400_BAD_REQUEST)

    errors = contact_errors(data)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)

    duration_hours = float(data.get('duration_hours') or 1.0)
    valid_dur, dur_err = validate_slot_duration(slot, duration_hours)
    if not valid_dur:
        return Response({'error': dur_err}, status=status.HTTP_400_BAD_REQUEST)

    # 2. Price is always computed here, never taken from the client
    dynamic_price, hrs, amount, explanation = slot_price(slot, duration_hours=duration_hours)
    amount_paise = max(int(amount * 100), MINIMUM_AMOUNT_PAISE)
    amount_rupees = float(Decimal(amount_paise) / 100)
    pricing_info = {'explanation': explanation}


    # 3. Create Razorpay order
    receipt = f"hev-{request.user.id}-{int(time.time())}"
    try:
        rz_order = create_order(
            amount_paise=amount_paise,
            receipt=receipt,
            notes={'slot_id': str(slot_id), 'user_id': str(request.user.id)},
        )
    except Exception as e:
        logger.error("Razorpay create_order failed: %s", e)
        return Response(
            {'error': 'Payment gateway error. Please try again.'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    # 4. Save PaymentAttempt with draft booking payload
    attempt = PaymentAttempt.objects.create(
        user=request.user,
        razorpay_order_id=rz_order['id'],
        amount_paise=amount_paise,
        status='created',
        payload_json={
            'slot':           slot_id,
            'duration_hours': duration_hours,
            'full_name':      data.get('full_name', '').strip(),
            'phone':          data.get('phone', '').strip(),
            'email':          data.get('email', '').strip(),
            'vehicle_number': data.get('vehicle_number', ''),
            'vehicle_type':   data.get('vehicle_type', ''),
            'amount_paid':    amount_rupees,
            'dynamic_price_explanation': pricing_info.get('explanation', ''),
        },
    )

    return Response({
        'key_id':     settings.RAZORPAY_KEY_ID,
        'order_id':   rz_order['id'],
        'amount':     amount_paise,
        'currency':   'INR',
        'attempt_id': attempt.id,
        'dynamic_pricing': {
            'hourly_rate': dynamic_price,
            'duration_hours': hrs,
            'total_amount': amount_rupees,
            'explanation': pricing_info.get('explanation', ''),
        },
        'prefill': {
            'name':    data.get('full_name', ''),
            'email':   data.get('email', ''),
            'contact': data.get('phone', ''),
        },
    }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# 2. VERIFY PAYMENT & CREATE BOOKING
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def razorpay_verify_view(request):
    """
    POST /api/payments/razorpay/verify/

    Body:
      razorpay_order_id, razorpay_payment_id, razorpay_signature, attempt_id

    On success: creates Booking, marks attempt paid, returns booking data.
    """
    order_id   = request.data.get('razorpay_order_id')
    payment_id = request.data.get('razorpay_payment_id')
    signature  = request.data.get('razorpay_signature')
    attempt_id = request.data.get('attempt_id')

    if not all([order_id, payment_id, signature]):
        return Response({'error': 'Missing payment verification fields.'}, status=status.HTTP_400_BAD_REQUEST)

    # 1. Load attempt
    try:
        attempt = PaymentAttempt.objects.get(
            razorpay_order_id=order_id,
            user=request.user,
        )
    except PaymentAttempt.DoesNotExist:
        return Response({'error': 'Payment attempt not found.'}, status=status.HTTP_404_NOT_FOUND)

    if attempt.status != 'created':
        return Response(
            {'error': f'Payment already {attempt.status}. Duplicate verification rejected.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 2. Verify Razorpay signature (CRITICAL security check)
    try:
        verify_payment_signature(order_id, payment_id, signature)
    except Exception:
        attempt.status = 'failed'
        attempt.save(update_fields=['status', 'updated_at'])
        return Response({'error': 'Payment signature verification failed.'}, status=status.HTTP_400_BAD_REQUEST)

    # 3. Create Booking atomically
    payload = attempt.payload_json
    try:
        with transaction.atomic():
            slot = TimeSlot.objects.select_for_update().select_related('station').get(pk=payload['slot'])

            if slot.booked_count >= slot.capacity or not slot.is_available:
                # Money was captured for a slot we can no longer honour: give it straight back.
                attempt.status = 'failed'
                attempt.razorpay_payment_id = payment_id
                attempt.save(update_fields=['status', 'razorpay_payment_id', 'updated_at'])
                try:
                    refund_payment(payment_id, attempt.amount_paise)
                    msg = 'Sorry, this slot was just taken. Your payment has been refunded in full.'
                except Exception:
                    logger.exception('Auto-refund failed for order %s', order_id)
                    msg = 'Sorry, this slot was just taken. Contact support with your payment ID for a refund.'
                return Response({'error': msg, 'payment_id': payment_id}, status=status.HTTP_409_CONFLICT)

            duration_hours = float(payload.get('duration_hours') or 1.0)
            slot = lock_or_split_slot(slot, duration_hours)

            booking = Booking.objects.create(
                user=request.user,
                station=slot.station,
                slot=slot,
                full_name=payload.get('full_name', ''),
                phone=payload.get('phone', ''),
                email=payload.get('email', ''),
                vehicle_number=payload.get('vehicle_number', ''),
                vehicle_type=payload.get('vehicle_type', ''),
                payment_method='razorpay',
                amount_paid=payload.get('amount_paid', 0),
                payment_status='paid',
                transaction_id=payment_id,
                status='pending',
            )

            # Generate QR code and save it to the booking
            try:
                booking.qr_code = generate_qr_code(booking)
                booking.save(update_fields=['qr_code'])
            except Exception as e:
                logger.warning("QR generation failed for booking %s: %s", booking.booking_id, e)

            # Apply station owner's membership quota & 5% commission if free tier
            from core.utils.membership_rules import apply_owner_membership_to_booking
            apply_owner_membership_to_booking(booking)

            attempt.status = 'paid'
            attempt.razorpay_payment_id = payment_id
            attempt.booking = booking
            attempt.save(update_fields=['status', 'razorpay_payment_id', 'booking', 'updated_at'])
            queue_booking_email(booking, 'created')

    except TimeSlot.DoesNotExist:
        return Response({'error': 'Slot not found.'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        logger.error("Booking creation failed after payment verify: %s", e)
        return Response({'error': 'Booking creation failed. Contact support.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    serializer = BookingDetailSerializer(booking, context={'request': request})
    return Response({'message': 'Payment verified. Booking confirmed!', 'booking': serializer.data}, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────────────────────
# 3. WEBHOOK  (no JWT, CSRF-exempt)
# ─────────────────────────────────────────────────────────────────────────────
@csrf_exempt
@require_POST
def razorpay_webhook_view(request):
    """
    POST /api/payments/razorpay/webhook/

    Razorpay sends events here. We handle:
      - payment.captured  → idempotent booking confirmation
      - payment.failed    → mark attempt failed
    """
    sig = request.headers.get('X-Razorpay-Signature', '')

    # Without a secret anyone could POST "payment.captured" and get a free booking.
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        logger.warning("Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set; ignoring")
        return _webhook_resp('webhook_not_configured', 503)
    try:
        verify_webhook_signature(request.body, sig)
    except Exception:
        logger.warning("Invalid Razorpay webhook signature")
        return _webhook_resp('invalid_signature', 400)

    try:
        event = json.loads(request.body)
    except json.JSONDecodeError:
        return _webhook_resp('bad_json', 400)

    event_type = event.get('event')
    payload    = event.get('payload', {})
    payment    = payload.get('payment', {}).get('entity', {})

    order_id   = payment.get('order_id')
    payment_id = payment.get('id')

    if not order_id:
        return _webhook_resp('ignored', 200)

    try:
        attempt = PaymentAttempt.objects.get(razorpay_order_id=order_id)
    except PaymentAttempt.DoesNotExist:
        return _webhook_resp('attempt_not_found', 200)

    if event_type == 'payment.captured' and attempt.status == 'created':
        # Idempotent confirm — in case verify/ was never called (tab closed)
        try:
            with transaction.atomic():
                slot = TimeSlot.objects.select_for_update().get(pk=attempt.payload_json['slot'])
                if slot.booked_count < slot.capacity:
                    p = attempt.payload_json
                    booking = Booking.objects.create(
                        user=attempt.user, station=slot.station, slot=slot,
                        full_name=p.get('full_name',''), phone=p.get('phone',''),
                        email=p.get('email',''), vehicle_number=p.get('vehicle_number',''),
                        vehicle_type=p.get('vehicle_type',''), payment_method='razorpay',
                        amount_paid=p.get('amount_paid',0), payment_status='paid',
                        transaction_id=payment_id, status='pending',
                    )
                    try:
                        booking.qr_code = generate_qr_code(booking)
                        booking.save(update_fields=['qr_code'])
                    except Exception: pass
                    slot.booked_count += 1
                    slot.save(update_fields=['booked_count'])

                    # Apply station owner's membership quota & 5% commission if free tier
                    from core.utils.membership_rules import apply_owner_membership_to_booking
                    apply_owner_membership_to_booking(booking)

                    attempt.status = 'paid'
                    attempt.razorpay_payment_id = payment_id
                    attempt.booking = booking
                    attempt.save(update_fields=['status','razorpay_payment_id','booking','updated_at'])
                    queue_booking_email(booking, 'created')
                else:
                    attempt.status = 'failed'
                    attempt.razorpay_payment_id = payment_id
                    attempt.save(update_fields=['status', 'razorpay_payment_id', 'updated_at'])
                    try:
                        refund_payment(payment_id, attempt.amount_paise)
                    except Exception:
                        logger.exception('Webhook auto-refund failed for order %s', order_id)
        except Exception as e:
            logger.error("Webhook booking creation failed: %s", e)

    elif event_type == 'payment.failed' and attempt.status == 'created':
        attempt.status = 'failed'
        attempt.save(update_fields=['status', 'updated_at'])

    return _webhook_resp('ok', 200)


def _webhook_resp(msg, code):
    from django.http import JsonResponse
    return JsonResponse({'status': msg}, status=code)
