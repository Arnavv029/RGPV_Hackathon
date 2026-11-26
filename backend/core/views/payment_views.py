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
import uuid
import logging
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from core.models import PaymentAttempt, TimeSlot, Booking, Station
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
from core.utils.charging_estimator import (
    calculate_charging_estimate,
    check_slot_interval_availability,
    parse_date_str,
    parse_time_str
)

logger = logging.getLogger(__name__)

MINIMUM_AMOUNT_PAISE = 500   # ₹5 minimum (Razorpay requires min ₹1)


# ─────────────────────────────────────────────────────────────────────────────
# 1. CREATE ORDER (50% Advance Online Payment)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def razorpay_create_order_view(request):
    """
    POST /api/payments/razorpay/create-order/

    Body:
      slot, station_id, full_name, phone, email, vehicle_number, vehicle_type,
      battery_capacity_kwh, current_soc, target_soc, charger_power_kw,
      custom_duration_minutes, booking_date, start_time

    Returns:
      { key_id, order_id, amount (50% paise), currency, attempt_id, split_payment, prefill }
    """
    data = request.data
    slot_id = data.get('slot')
    station_id = data.get('station_id') or data.get('station')

    slot = None
    station = None

    if slot_id:
        try:
            slot = TimeSlot.objects.select_related('station').get(pk=slot_id)
            station = slot.station
        except TimeSlot.DoesNotExist:
            return Response({'error': 'Slot not found.'}, status=status.HTTP_404_NOT_FOUND)
    elif station_id:
        try:
            station = Station.objects.get(pk=station_id, is_active=True)
        except Station.DoesNotExist:
            return Response({'error': 'Station not found.'}, status=status.HTTP_404_NOT_FOUND)
    else:
        return Response({'error': 'Either slot or station_id must be provided.'}, status=status.HTTP_400_BAD_REQUEST)

    errors = contact_errors(data)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)

    # 1. Check if smart estimation params are present
    battery_capacity = data.get('battery_capacity_kwh') or data.get('battery_capacity')
    current_soc = data.get('current_soc') if data.get('current_soc') is not None else data.get('current_battery')
    target_soc = data.get('target_soc') if data.get('target_soc') is not None else data.get('target_battery')

    estimate_dict = None
    if battery_capacity is not None and current_soc is not None and target_soc is not None:
        # ── Smart Estimation Flow ────────────────────────────────────────────
        b_date = data.get('booking_date') or (str(slot.date) if slot else None)
        s_time = data.get('start_time') or (slot.start_time.strftime('%H:%M') if slot else None)
        c_mins = data.get('custom_duration_minutes')

        try:
            estimate_dict = calculate_charging_estimate(
                station=station,
                battery_capacity_kwh=battery_capacity,
                current_soc=current_soc,
                target_soc=target_soc,
                charger_power_kw=data.get('charger_power_kw'),
                vehicle_max_power_kw=data.get('vehicle_max_power_kw'),
                custom_duration_minutes=c_mins,
                start_time=s_time,
                booking_date=b_date,
            )
        except ValueError as err:
            return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)

        # Strict conflict check: cannot book if conflicting
        if not estimate_dict['is_available']:
            return Response({'error': estimate_dict['conflict_reason']}, status=status.HTTP_409_CONFLICT)

        total_cost = Decimal(str(estimate_dict['total_estimated_cost']))
        advance_payment = Decimal(str(estimate_dict['advance_payment']))
        remaining_payment = Decimal(str(estimate_dict['remaining_payment']))
        duration_hours = estimate_dict['duration_hours']
        duration_minutes = estimate_dict['duration_minutes']
        booking_date_val = estimate_dict['booking_date']
        start_time_val = estimate_dict['start_time']
        end_time_val = estimate_dict['end_time']
        pricing_explanation = (
            f"Estimated energy {estimate_dict['energy_required_kwh']} kWh @ ₹{estimate_dict['tariff_per_kwh']}/kWh = ₹{total_cost}. "
            f"100% complete payment: ₹{total_cost}."
        )

    else:
        # ── Fallback Flow (e.g. direct slot-based booking) ────────────────────
        if not slot:
            return Response({'error': 'Please provide battery capacity and SOC details or select a slot.'}, status=status.HTTP_400_BAD_REQUEST)

        reason = slot_unbookable_reason(slot)
        if reason:
            return Response({'error': reason}, status=status.HTTP_400_BAD_REQUEST)

        duration_hours = float(data.get('duration_hours') or 1.0)
        valid_dur, dur_err = validate_slot_duration(slot, duration_hours)
        if not valid_dur:
            return Response({'error': dur_err}, status=status.HTTP_400_BAD_REQUEST)

        dynamic_price, hrs, amount, explanation = slot_price(slot, duration_hours=duration_hours)
        total_cost = amount
        advance_payment = total_cost
        remaining_payment = Decimal('0.00')
        duration_minutes = int(hrs * 60)
        booking_date_val = str(slot.date)
        start_time_val = slot.start_time.strftime('%H:%M')
        # Compute end time
        from core.utils.charging_estimator import add_minutes_to_time
        calc_end, _ = add_minutes_to_time(slot.start_time, duration_minutes)
        end_time_val = calc_end.strftime('%H:%M')
        pricing_explanation = explanation

    # User pays 100% COMPLETE PAYMENT ONLINE
    amount_paise = max(int(total_cost * 100), MINIMUM_AMOUNT_PAISE)
    amount_rupees = float(Decimal(amount_paise) / 100)

    # 3. Create Razorpay order
    receipt = f"hev-{request.user.id}-{int(time.time())}"
    rz_order = None
    is_simulated = False
    try:
        rz_order = create_order(
            amount_paise=amount_paise,
            receipt=receipt,
            notes={
                'station_id': str(station.id),
                'slot_id': str(slot.id) if slot else '',
                'user_id': str(request.user.id),
                'total_cost': str(total_cost),
                'advance_paid': str(amount_rupees),
            },
        )
    except Exception as e:
        logger.error("Razorpay create_order failed: %s", e)
        if settings.ALLOW_SIMULATED_PAYMENTS:
            logger.info("Falling back to simulated order because ALLOW_SIMULATED_PAYMENTS is True")
            is_simulated = True
            rz_order = {
                'id': f"order_sim_{uuid.uuid4().hex[:14]}",
                'amount': amount_paise,
                'currency': 'INR',
                'status': 'created',
            }
        else:
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
            'station_id':                 station.id,
            'slot':                       slot.id if slot else None,
            'duration_hours':             duration_hours,
            'duration_minutes':           duration_minutes,
            'booking_date':               booking_date_val,
            'start_time':                 start_time_val,
            'end_time':                   end_time_val,
            'battery_capacity_kwh':       float(battery_capacity) if battery_capacity is not None else None,
            'current_soc':                float(current_soc) if current_soc is not None else None,
            'target_soc':                 float(target_soc) if target_soc is not None else None,
            'energy_required_kwh':        estimate_dict['energy_required_kwh'] if estimate_dict else None,
            'charging_power_kw':          estimate_dict['effective_charging_power_kw'] if estimate_dict else (station.power_kw or 30.0),
            'estimated_duration_minutes': duration_minutes,
            'total_estimated_cost':       float(total_cost),
            'advance_amount':             amount_rupees,
            'remaining_amount':           float(remaining_payment),
            'full_name':                  data.get('full_name', '').strip(),
            'phone':                      data.get('phone', '').strip(),
            'email':                      data.get('email', '').strip(),
            'vehicle_number':             data.get('vehicle_number', ''),
            'vehicle_type':               data.get('vehicle_type', ''),
            'amount_paid':                amount_rupees,
            'dynamic_price_explanation':  pricing_explanation,
        },
    )

    return Response({
        'key_id':     settings.RAZORPAY_KEY_ID if not is_simulated else 'simulated',
        'order_id':   rz_order['id'],
        'amount':     amount_paise,
        'currency':   'INR',
        'attempt_id': attempt.id,
        'simulated':  is_simulated,
        'split_payment': {
            'total_estimated_cost': float(total_cost),
            'advance_amount': amount_rupees,
            'remaining_amount': float(remaining_payment),
            'explanation': pricing_explanation,
        },
        'estimate': estimate_dict,
        'prefill': {
            'name':    data.get('full_name', ''),
            'email':   data.get('email', ''),
            'contact': data.get('phone', ''),
        },
    }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# 2. VERIFY PAYMENT & CREATE BOOKING (Atomic Concurrency Control)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def razorpay_verify_view(request):
    """
    POST /api/payments/razorpay/verify/

    Body:
      razorpay_order_id, razorpay_payment_id, razorpay_signature, attempt_id

    On success: verifies signature, locks station, verifies no dual booking,
    creates Booking with 50% advance recorded and remaining due, generates QR.
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
    if attempt.razorpay_order_id.startswith('order_sim_') and settings.ALLOW_SIMULATED_PAYMENTS:
        pass
    else:
        try:
            verify_payment_signature(order_id, payment_id, signature)
        except Exception:
            attempt.status = 'failed'
            attempt.save(update_fields=['status', 'updated_at'])
            return Response({'error': 'Payment signature verification failed.'}, status=status.HTTP_400_BAD_REQUEST)

    # 3. Create Booking atomically with Concurrency Lock
    payload = attempt.payload_json
    station_id = payload.get('station_id')

    try:
        with transaction.atomic():
            # Lock station row to serialize concurrent booking attempts at this station
            if station_id:
                station = Station.objects.select_for_update().get(pk=station_id)
            elif payload.get('slot'):
                slot_obj = TimeSlot.objects.select_for_update().select_related('station').get(pk=payload['slot'])
                station = slot_obj.station
            else:
                raise ValueError("No station associated with payment attempt.")

            parsed_date = parse_date_str(payload.get('booking_date'))
            parsed_start = parse_time_str(payload.get('start_time'))
            parsed_end = parse_time_str(payload.get('end_time'))

            # Link or create TimeSlot for backward compatibility and tracking
            slot = None
            if payload.get('slot'):
                try:
                    slot = TimeSlot.objects.select_for_update().get(pk=payload['slot'])
                except TimeSlot.DoesNotExist:
                    slot = None

            effective_capacity = max(station.total_slots, slot.capacity if slot else 1)

            overlapping_count = Booking.objects.select_for_update().filter(
                station=station,
                booking_date=parsed_date,
                status__in=['pending', 'confirmed'],
                cancelled_at__isnull=True,
                start_time__lt=parsed_end,
                end_time__gt=parsed_start,
            ).count()

            # Strict Concurrency Check: prevent dual booking at the same time
            slot_full = slot and (slot.booked_count >= slot.capacity or not slot.is_available)
            overlap_full = overlapping_count >= effective_capacity

            if slot_full or overlap_full:
                # Capacity exceeded concurrently! Refund immediately
                attempt.status = 'failed'
                attempt.razorpay_payment_id = payment_id
                attempt.save(update_fields=['status', 'razorpay_payment_id', 'updated_at'])
                try:
                    refund_payment(payment_id, attempt.amount_paise)
                    msg = 'Sorry, this slot interval was just booked by another driver. Your payment has been refunded in full.'
                except Exception:
                    logger.exception('Auto-refund failed for order %s', order_id)
                    msg = 'Sorry, this slot was just taken. Contact support with your payment ID for a refund.'
                return Response({'error': msg, 'payment_id': payment_id}, status=status.HTTP_409_CONFLICT)

            if slot:
                duration_hours = float(payload.get('duration_hours') or 1.0)
                slot = lock_or_split_slot(slot, duration_hours)
            else:
                slot, _ = TimeSlot.objects.get_or_create(
                    station=station,
                    date=parsed_date,
                    start_time=parsed_start,
                    end_time=parsed_end,
                    defaults={'capacity': station.total_slots, 'booked_count': 0, 'is_available': True}
                )
                slot.booked_count += 1
                slot.save()

            booking = Booking.objects.create(
                user=request.user,
                station=station,
                slot=slot,
                full_name=payload.get('full_name', ''),
                phone=payload.get('phone', ''),
                email=payload.get('email', ''),
                vehicle_number=payload.get('vehicle_number', ''),
                vehicle_type=payload.get('vehicle_type', ''),
                payment_method='razorpay',
                amount_paid=payload.get('amount_paid', 0),
                total_estimated_cost=payload.get('total_estimated_cost'),
                advance_amount=payload.get('advance_amount'),
                remaining_amount=0.0,
                advance_paid=True,
                remaining_paid=True,
                battery_capacity_kwh=payload.get('battery_capacity_kwh'),
                current_soc=payload.get('current_soc'),
                target_soc=payload.get('target_soc'),
                energy_required_kwh=payload.get('energy_required_kwh'),
                charging_power_kw=payload.get('charging_power_kw'),
                estimated_duration_minutes=payload.get('estimated_duration_minutes'),
                booking_date=parsed_date,
                start_time=parsed_start,
                end_time=parsed_end,
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

    except Exception as e:
        logger.error("Booking creation failed after payment verify: %s", e)
        return Response({'error': f'Booking creation failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    serializer = BookingDetailSerializer(booking, context={'request': request})
    return Response({
        'message': 'Payment verified. 100% complete payment received! Booking confirmed.',
        'booking': serializer.data
    }, status=status.HTTP_201_CREATED)


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
