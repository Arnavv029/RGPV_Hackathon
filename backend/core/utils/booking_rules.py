"""
Server-side booking rules shared by every endpoint that creates a booking.
The client never decides the price or whether a slot can be booked.
"""

import logging
import re
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.utils import timezone

logger = logging.getLogger(__name__)

PHONE_RE = re.compile(r'^\+?\d{10,13}$')


def slot_unbookable_reason(slot):
    """None when the slot can take one more booking, otherwise a user-facing reason."""
    if not slot.is_available or not slot.station.is_active:
        return 'This slot is no longer available.'
    if slot.booked_count >= slot.capacity:
        return 'This slot is fully booked. Please choose another one.'
    start = timezone.make_aware(datetime.combine(slot.date, slot.start_time), timezone.get_current_timezone())
    if start <= timezone.now():
        return 'This slot has already started. Please choose a later one.'
    return None


def slot_price(slot):
    """(hourly_rate, hours, total_rupees: Decimal, explanation) for one booking of `slot`."""
    from utils.llm_enhanced_pricing import get_slot_dynamic_price
    info = get_slot_dynamic_price(slot)
    rate = Decimal(str(info['price']))
    minutes = (slot.end_time.hour * 60 + slot.end_time.minute) - (slot.start_time.hour * 60 + slot.start_time.minute)
    if minutes <= 0:
        minutes = 60
    hours = Decimal(minutes) / Decimal(60)
    total = (rate * hours).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return float(rate), float(round(hours, 2)), total, info.get('explanation', '')


def contact_errors(data):
    """Validate the driver's contact details; returns {field: message} (empty when fine)."""
    errors = {}
    if not (data.get('full_name') or '').strip():
        errors['full_name'] = 'Enter your full name.'
    phone = re.sub(r'[\s-]', '', data.get('phone') or '')
    if not PHONE_RE.match(phone):
        errors['phone'] = 'Enter a valid 10-digit phone number.'
    try:
        validate_email((data.get('email') or '').strip())
    except ValidationError:
        errors['email'] = 'Enter a valid email address — your ticket is sent there.'
    return errors


def start_refund(booking, percentage):
    """
    Record a refund of `percentage`% on the booking and, for Razorpay payments,
    ask Razorpay to send the money back. Does not save the booking.
    """
    paid = Decimal(booking.amount_paid or 0)
    amount = (paid * Decimal(percentage) / Decimal(100)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    booking.refund_percentage = percentage
    booking.refund_amount = amount

    if paid == 0 or amount == 0:
        booking.payment_status = 'refunded' if paid == 0 else 'paid'
        return amount

    booking.payment_status = 'refunded' if percentage == 100 else 'partially_refunded'
    if booking.payment_method == 'razorpay' and booking.transaction_id:
        from core.utils.razorpay_client import refund_payment
        try:
            refund_payment(booking.transaction_id, int(amount * 100))
        except Exception:
            # Keep the booking state consistent; the refund can be retried from the Razorpay dashboard.
            logger.exception('Razorpay refund failed for booking %s', booking.booking_id)
            booking.payment_status = 'refund_initiated'
    return amount
