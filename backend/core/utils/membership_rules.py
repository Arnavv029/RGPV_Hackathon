"""
Station Owner Membership & Autopay Rules
========================================
Business Rules:
1. Plans:
   - Starter:    ₹999  → 50 bookings  (0% commission, Priority listing)
   - Growth:     ₹1299 → 75 bookings  (0% commission, Priority listing + Featured)
   - Enterprise: ₹1499 → 100 bookings (0% commission, Premier priority listing)
2. Free Plan / Registration:
   - New stations/owners get 20 bookings free.
   - Once quota finishes, owner is on Free Tier:
     - 5% commission is charged on every booking.
     - Station is NOT prioritized in discovery/search.
3. Autopay:
   - When enabled, when bookings_remaining hits 0, the system automatically
     auto-renews the selected plan with zero downtime for the owner.
"""

import time
import uuid
import logging
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

MEMBERSHIP_PLANS = {
    'plan_999': {
        'id': 'plan_999',
        'name': 'Starter Plan',
        'price': 999,
        'price_paise': 99900,
        'bookings': 50,
        'per_booking_cost': 19.98,
        'commission_rate': 0.0,
        'priority': True,
        'badge': 'Starter',
        'description': 'Ideal for emerging stations. 50 bookings quota with 0% platform commission and priority ranking.',
    },
    'plan_1299': {
        'id': 'plan_1299',
        'name': 'Growth Plan',
        'price': 1299,
        'price_paise': 129900,
        'bookings': 75,
        'per_booking_cost': 17.32,
        'commission_rate': 0.0,
        'priority': True,
        'badge': 'Most Popular',
        'popular': True,
        'description': 'Best value for active EV hubs. 75 bookings with 0% commission, priority boost, and fast verification.',
    },
    'plan_1499': {
        'id': 'plan_1499',
        'name': 'Enterprise Plan',
        'price': 1499,
        'price_paise': 149900,
        'bookings': 100,
        'per_booking_cost': 14.99,
        'commission_rate': 0.0,
        'priority': True,
        'badge': 'Best Volume',
        'description': 'Maximum volume for high-traffic hubs. 100 bookings with 0% commission and premier priority placement.',
    },
}

FREE_TIER_CONFIG = {
    'id': 'free',
    'name': 'Free Tier',
    'initial_free_bookings': 20,
    'commission_rate': 5.0,  # 5%
    'priority': False,
    'description': '20 free trial bookings on registration. After 20 bookings, 5% commission applies with standard ranking.',
}


def get_or_create_owner_membership(owner):
    """
    Retrieves or initializes the OwnerMembership for a given station owner.
    Provides 20 free bookings on initial creation.
    """
    from core.models import OwnerMembership

    membership, created = OwnerMembership.objects.get_or_create(
        user=owner,
        defaults={
            'plan': 'free',
            'total_bookings_credited': 20,
            'bookings_remaining': 20,
            'bookings_used': 0,
            'is_autopay_enabled': False,
            'autopay_plan': 'plan_999',
            'is_priority': False,
        }
    )
    return membership


def process_autopay_renewal(membership):
    """
    Automatically renews an owner's membership plan when their quota reaches 0
    if autopay is enabled.
    """
    from core.models import MembershipOrder

    plan_key = membership.autopay_plan or 'plan_999'
    plan_info = MEMBERSHIP_PLANS.get(plan_key, MEMBERSHIP_PLANS['plan_999'])

    try:
        with transaction.atomic():
            order_id = f"auto_{membership.user_id}_{int(time.time())}"
            payment_id = f"pay_auto_{uuid.uuid4().hex[:12]}"

            MembershipOrder.objects.create(
                owner=membership.user,
                plan=plan_key,
                plan_name=plan_info['name'],
                amount=Decimal(str(plan_info['price'])),
                bookings_credited=plan_info['bookings'],
                razorpay_order_id=order_id,
                razorpay_payment_id=payment_id,
                is_autopay=True,
                status='paid',
            )

            membership.plan = plan_key
            membership.bookings_remaining += plan_info['bookings']
            membership.total_bookings_credited += plan_info['bookings']
            membership.is_priority = True
            membership.last_renewed_at = timezone.now()
            membership.save()

            logger.info(
                "Autopay successful for owner %s: added %d bookings (%s)",
                membership.user.username, plan_info['bookings'], plan_info['name']
            )
            return True
    except Exception as e:
        logger.error("Autopay renewal failed for owner %s: %s", membership.user.username, e)
        return False


def apply_owner_membership_to_booking(booking):
    """
    Applies membership quota and commission rules to a confirmed booking:
    1. If owner has remaining bookings (from 20 free trial or active paid plan):
       - Uses 1 booking from quota.
       - Commission rate = 0%.
       - If quota reaches 0 and autopay is enabled, automatically renews plan.
    2. If owner has 0 quota remaining (Free Tier):
       - Charges 5% platform commission on booking amount.
       - Owner earnings = amount_paid - 5% commission.
       - Station is not prioritized.
    """
    owner = booking.station.owner
    membership = get_or_create_owner_membership(owner)
    amount_paid = Decimal(str(booking.amount_paid or 0))

    if membership.bookings_remaining > 0:
        # Covered by membership quota
        membership.bookings_remaining -= 1
        membership.bookings_used += 1

        booking.commission_rate = Decimal('0.00')
        booking.commission_amount = Decimal('0.00')
        booking.owner_earnings = amount_paid

        # If quota has now reached 0
        if membership.bookings_remaining == 0:
            if membership.is_autopay_enabled:
                process_autopay_renewal(membership)
            else:
                membership.plan = 'free'
                membership.is_priority = False

        membership.save()
    else:
        # Free plan with exhausted quota: Charge 5% platform commission
        commission_rate = Decimal('5.00')
        commission_amount = (amount_paid * Decimal('0.05')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        owner_earnings = max(Decimal('0.00'), amount_paid - commission_amount)

        booking.commission_rate = commission_rate
        booking.commission_amount = commission_amount
        booking.owner_earnings = owner_earnings

        membership.bookings_used += 1
        membership.plan = 'free'
        membership.is_priority = False
        membership.save()

    booking.save(update_fields=['commission_rate', 'commission_amount', 'owner_earnings'])
    return booking
