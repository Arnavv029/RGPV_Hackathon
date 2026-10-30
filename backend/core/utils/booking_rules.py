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


def slot_price(slot, duration_hours=None):
    """(hourly_rate, hours, total_rupees: Decimal, explanation) for one booking of `slot`."""
    from utils.llm_enhanced_pricing import get_slot_dynamic_price
    info = get_slot_dynamic_price(slot)
    rate = Decimal(str(info['price']))
    if duration_hours is not None:
        hours = Decimal(str(duration_hours))
    else:
        minutes = (slot.end_time.hour * 60 + slot.end_time.minute) - (slot.start_time.hour * 60 + slot.start_time.minute)
        if minutes <= 0:
            minutes = 60
        hours = Decimal(minutes) / Decimal(60)
    total = (rate * hours).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return float(rate), float(round(hours, 2)), total, info.get('explanation', '')


def validate_slot_duration(slot, duration_hours):
    """
    Validates if a given duration (in hours, e.g. 0.5, 1.0, 1.5, 2.0) can be booked
    starting at `slot`.
    Returns (True, None) or (False, error_message).
    """
    from datetime import timedelta
    from core.models import TimeSlot

    if duration_hours is None or duration_hours <= 0:
        return False, 'Duration must be greater than 0.'

    if duration_hours > 8:
        return False, 'Maximum booking duration is 8 hours.'

    start_dt = datetime.combine(slot.date, slot.start_time)
    end_dt = start_dt + timedelta(minutes=int(round(duration_hours * 60)))
    if end_dt.date() > slot.date:
        return False, 'Booking duration cannot extend past midnight.'

    target_end_time = end_dt.time()

    # If duration extends beyond this slot's end time, check overlapping slots
    if target_end_time > slot.end_time:
        overlapping_slots = TimeSlot.objects.filter(
            station=slot.station,
            date=slot.date,
            start_time__gte=slot.end_time,
            start_time__lt=target_end_time
        ).exclude(pk=slot.pk)

        for next_slot in overlapping_slots:
            if next_slot.booked_count >= next_slot.capacity or not next_slot.is_available:
                return False, f'Cannot book for {duration_hours}h: subsequent time slot {next_slot.start_time.strftime("%H:%M")} is already booked.'

    return True, None


def lock_or_split_slot(slot, duration_hours):
    """
    Locks the interval [slot.start_time, slot.start_time + duration_hours] for this slot.
    Adjusts or splits subsequent or current slots:
      - If duration < slot interval (e.g. 0.5h on 1h slot 10:00-11:00):
        slot.end_time becomes 10:30.
        A new slot 10:30-11:00 is created (available, booked_count=0).
      - If duration > slot interval (e.g. 1.5h on 1h slot 10:00-11:00):
        target_end_time = 11:30.
        Overlapping slot 11:00-12:00 is updated to start at 11:30 (remains available 11:30-12:00).
        slot.end_time becomes 11:30.
      - If duration covers next slot completely (e.g. 2h on 10:00-11:00, target_end = 12:00):
        next slot 11:00-12:00 is removed.
        slot.end_time becomes 12:00.
    Increments slot.booked_count and saves slot.
    Returns the updated slot.
    """
    from datetime import timedelta
    from core.models import TimeSlot

    if duration_hours is None:
        duration_hours = 1.0

    start_dt = datetime.combine(slot.date, slot.start_time)
    end_dt = start_dt + timedelta(minutes=int(round(duration_hours * 60)))
    target_end_time = end_dt.time()
    original_end_time = slot.end_time

    if target_end_time == original_end_time:
        slot.booked_count += 1
        slot.save()
        return slot

    if target_end_time < original_end_time:
        # Shorter booking (e.g. 0.5h on 1h slot: 10:00 - 10:30)
        slot.end_time = target_end_time
        slot.booked_count += 1
        slot.save()

        # Remainder slot (10:30 - 11:00) so other users can book the remaining time
        if not TimeSlot.objects.filter(
            station=slot.station,
            date=slot.date,
            start_time=target_end_time,
            end_time=original_end_time
        ).exists():
            TimeSlot.objects.create(
                station=slot.station,
                date=slot.date,
                start_time=target_end_time,
                end_time=original_end_time,
                capacity=slot.capacity,
                booked_count=0,
                is_available=True
            )
        return slot

    # target_end_time > original_end_time (e.g. 1.5h: 10:00 - 11:30)
    overlapping_slots = list(TimeSlot.objects.filter(
        station=slot.station,
        date=slot.date,
        start_time__gte=original_end_time,
        start_time__lt=target_end_time
    ).exclude(pk=slot.pk).order_by('start_time'))

    for overlap in overlapping_slots:
        if overlap.end_time <= target_end_time:
            # Fully covered slot
            overlap.delete()
        else:
            # Partially covered slot (e.g. 11:00 - 12:00 becomes 11:30 - 12:00)
            overlap.start_time = target_end_time
            overlap.save()

    slot.end_time = target_end_time
    slot.booked_count += 1
    slot.save()
    return slot


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
