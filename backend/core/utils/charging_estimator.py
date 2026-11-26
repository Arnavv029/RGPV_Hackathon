"""
Charging Time, Energy, and Cost Estimator
===========================================
Production-level calculation and concurrency conflict engine for HapticEV.

Formulas:
  1. Energy Required (kWh) = Battery Capacity (kWh) × (Target SOC − Current SOC) / 100
  2. Effective Power (kW)  = min(Charger Power, Station Power, Vehicle Max Input)
  3. Estimated Time (hrs)  = Energy Required (kWh) / Effective Power (kW)
  4. Estimated Total Cost  = Energy Required (kWh) × Station Tariff (₹/kWh)
  5. 100% Online Payment   = Total Cost
"""

from datetime import datetime, date, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
import logging

from django.utils import timezone
from django.db.models import Q
from core.models import Booking, Station, TimeSlot

logger = logging.getLogger(__name__)

STATION_OPEN_TIME = time(8, 0)    # 08:00 AM
STATION_CLOSE_TIME = time(22, 0)  # 10:00 PM

DISCLAIMER_TEXT = (
    "Values shown are estimates based on standard battery charging algorithms. "
    "Actual charging speed and duration may vary depending on vehicle battery thermal management, "
    "BMS curve, ambient temperature, and station load. Actual billed energy at station meter may include minor conversion losses."
)


def parse_time_str(val):
    """Safely converts string ('10:00' or '10:00:00') or time object into datetime.time."""
    if isinstance(val, time):
        return val
    if not val:
        return None
    val = str(val).strip()
    for fmt in ('%H:%M:%S', '%H:%M'):
        try:
            return datetime.strptime(val, fmt).time()
        except ValueError:
            pass
    raise ValueError(f"Invalid time format '{val}'. Expected HH:MM or HH:MM:SS.")


def parse_date_str(val):
    """Safely converts string ('YYYY-MM-DD') or date object into datetime.date."""
    if isinstance(val, date):
        return val
    if not val:
        return date.today()
    val = str(val).strip()
    return datetime.strptime(val, '%Y-%m-%d').date()


def add_minutes_to_time(base_time, minutes):
    """Adds integer minutes to a datetime.time object."""
    dt = datetime.combine(date.today(), base_time) + timedelta(minutes=int(minutes))
    return dt.time(), dt.date() > date.today()  # returns (time, passed_midnight_boolean)


def calculate_charging_estimate(
    station,
    battery_capacity_kwh,
    current_soc,
    target_soc,
    charger_power_kw=None,
    vehicle_max_power_kw=None,
    custom_duration_minutes=None,
    start_time=None,
    booking_date=None,
):
    """
    Computes exact energy, estimated charging time, cost, split payment (50/50),
    and validates time interval conflicts against active bookings.
    """
    # ── 1. Input Validation ──────────────────────────────────────────────────
    try:
        battery_capacity = float(battery_capacity_kwh)
        c_soc = float(current_soc)
        t_soc = float(target_soc)
    except (TypeError, ValueError) as err:
        raise ValueError("Battery capacity, current SOC, and target SOC must be valid numbers.")

    if battery_capacity <= 0:
        raise ValueError("Battery capacity must be greater than 0 kWh.")
    if battery_capacity > 300:
        raise ValueError("Battery capacity exceeds realistic EV limit (max 300 kWh).")
    if not (0 <= c_soc < 100):
        raise ValueError("Current battery percentage (SOC) must be between 0% and 99%.")
    if not (c_soc < t_soc <= 100):
        raise ValueError(f"Target battery percentage ({t_soc}%) must be greater than current battery ({c_soc}%).")

    # ── 2. Energy Required (kWh) ─────────────────────────────────────────────
    # Formula: Energy Required = Battery Capacity × (Target SOC − Current SOC) / 100
    energy_required_kwh = round(battery_capacity * (t_soc - c_soc) / 100.0, 2)

    # ── 3. Effective Charging Power (kW) ─────────────────────────────────────
    station_rated_power = float(station.power_kw or 30.0)
    effective_power_kw = station_rated_power

    if charger_power_kw is not None:
        try:
            req_power = float(charger_power_kw)
            if req_power > 0:
                effective_power_kw = min(req_power, station_rated_power)
        except (ValueError, TypeError):
            pass

    if vehicle_max_power_kw is not None:
        try:
            veh_limit = float(vehicle_max_power_kw)
            if veh_limit > 0:
                effective_power_kw = min(effective_power_kw, veh_limit)
        except (ValueError, TypeError):
            pass

    effective_power_kw = max(1.0, min(effective_power_kw, 350.0))

    # ── 4. Estimated Charging Time ───────────────────────────────────────────
    # Formula: Charging Time (hours) = Energy Required (kWh) / Effective Charging Power (kW)
    estimated_hours = energy_required_kwh / effective_power_kw
    calculated_minutes = max(10, int(round(estimated_hours * 60.0)))

    if custom_duration_minutes is not None:
        try:
            user_mins = int(custom_duration_minutes)
            if user_mins >= 15:
                duration_minutes = user_mins
            else:
                duration_minutes = calculated_minutes
        except (ValueError, TypeError):
            duration_minutes = calculated_minutes
    else:
        duration_minutes = calculated_minutes

    duration_hours = round(duration_minutes / 60.0, 2)

    # ── 5. Estimated Cost & 100% Online Payment ──────────────────────────────
    # Formula: Estimated Cost = Estimated Energy (kWh) × Station Tariff (₹/kWh)
    tariff_per_kwh = Decimal(str(station.effective_tariff_per_kwh)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    energy_dec = Decimal(str(energy_required_kwh))
    
    total_cost = (energy_dec * tariff_per_kwh).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    # 100% Complete Online Payment
    advance_payment = total_cost
    remaining_payment = Decimal('0.00')

    # ── 6. Scheduling & Time Slot Conflict Check ─────────────────────────────
    parsed_date = parse_date_str(booking_date) if booking_date else date.today()
    parsed_start = parse_time_str(start_time) if start_time else time(10, 0)
    parsed_end, crosses_midnight = add_minutes_to_time(parsed_start, duration_minutes)

    availability_info = check_slot_interval_availability(
        station=station,
        booking_date=parsed_date,
        start_time=parsed_start,
        end_time=parsed_end,
    )

    # Human readable hours & minutes string (e.g. "1 hr 12 min")
    hours_part = duration_minutes // 60
    mins_part = duration_minutes % 60
    duration_label = f"{hours_part}h {mins_part}m" if hours_part > 0 else f"{mins_part}m"

    return {
        'station_id': station.id,
        'station_name': station.name,
        'battery_capacity_kwh': battery_capacity,
        'current_soc': c_soc,
        'target_soc': t_soc,
        'energy_required_kwh': float(energy_required_kwh),
        'effective_charging_power_kw': round(effective_power_kw, 1),
        'calculated_charging_minutes': calculated_minutes,
        'duration_minutes': duration_minutes,
        'duration_hours': duration_hours,
        'duration_label': duration_label,
        'tariff_per_kwh': float(tariff_per_kwh),
        'total_estimated_cost': float(total_cost),
        'advance_payment': float(advance_payment),
        'remaining_payment': float(remaining_payment),
        'booking_date': str(parsed_date),
        'start_time': parsed_start.strftime('%H:%M'),
        'end_time': parsed_end.strftime('%H:%M'),
        'crosses_midnight': crosses_midnight,
        'is_available': availability_info['is_available'],
        'conflict_reason': availability_info['conflict_reason'],
        'overlapping_count': availability_info['overlapping_count'],
        'total_slots': station.total_slots,
        'booked_intervals': availability_info['booked_intervals'],
        'available_gaps': availability_info['available_gaps'],
        'disclaimer': DISCLAIMER_TEXT,
    }


def get_station_booked_intervals(station, booking_date):
    """
    Returns list of active booked intervals on `booking_date` for `station`.
    Each item: { start_time, end_time, start_str, end_str, label, status }
    """
    parsed_date = parse_date_str(booking_date)
    
    # 1. Fetch active bookings (confirmed, pending, or actively charging)
    bookings = Booking.objects.filter(
        station=station,
        status__in=['pending', 'confirmed', 'charging'],
        cancelled_at__isnull=True,
    ).filter(
        Q(booking_date=parsed_date) | Q(slot__date=parsed_date)
    ).select_related('slot').order_by('start_time', 'created_at')

    intervals = []
    for b in bookings:
        b_start = b.start_time or (b.slot.start_time if b.slot else None)
        b_end = b.end_time or (b.slot.end_time if b.slot else None)
        if b_start and b_end:
            intervals.append({
                'booking_id': str(b.booking_id)[:8],
                'vehicle_number': b.vehicle_number or 'EV Vehicle',
                'start_time': b_start.strftime('%H:%M'),
                'end_time': b_end.strftime('%H:%M'),
                'start_time_raw': b_start,
                'end_time_raw': b_end,
                'status': b.status,
                'label': f"{b_start.strftime('%I:%M %p')} – {b_end.strftime('%I:%M %p')} ({'Charging' if b.status == 'charging' else 'Booked'})",
            })

    # Sort by start time
    intervals.sort(key=lambda x: x['start_time_raw'])
    return intervals


def check_slot_interval_availability(station, booking_date, start_time, end_time, exclude_booking_id=None):
    """
    Checks whether a station has capacity for interval [start_time, end_time] on booking_date.
    Validates operating hours (8:00 AM – 10:00 PM), past times, and concurrent capacity.
    """
    parsed_date = parse_date_str(booking_date)
    req_start = parse_time_str(start_time)
    req_end = parse_time_str(end_time)

    # 1. Station Operating Hours Check (8:00 AM – 10:00 PM)
    if req_start < STATION_OPEN_TIME or req_start >= STATION_CLOSE_TIME:
        return {
            'is_available': False,
            'conflict_reason': f"Station operating hours are 08:00 AM to 10:00 PM. Cannot book start time at {req_start.strftime('%I:%M %p')}.",
            'overlapping_count': 0,
            'booked_intervals': [],
            'available_gaps': [],
        }

    if req_end > STATION_CLOSE_TIME or req_end <= req_start:
        return {
            'is_available': False,
            'conflict_reason': f"Charging session ends at {req_end.strftime('%I:%M %p')}, which exceeds station closing time (10:00 PM). Please select an earlier start time or shorter duration.",
            'overlapping_count': 0,
            'booked_intervals': [],
            'available_gaps': [],
        }

    # 2. Past time check for today
    now = timezone.localtime()
    if parsed_date < now.date():
        return {
            'is_available': False,
            'conflict_reason': 'Cannot book for a past date.',
            'overlapping_count': 0,
            'booked_intervals': [],
            'available_gaps': [],
        }

    if parsed_date == now.date():
        if now.time() >= STATION_CLOSE_TIME:
            return {
                'is_available': False,
                'conflict_reason': 'Station is closed for today (closes at 10:00 PM). Please select tomorrow or an upcoming date.',
                'overlapping_count': 0,
                'booked_intervals': [],
                'available_gaps': [],
            }

        # If it's early morning before 8 AM (e.g. 2:00 AM), earliest bookable start time today is 08:00 AM
        earliest_allowed = max(STATION_OPEN_TIME, (now + timedelta(minutes=5)).time())
        if req_start < earliest_allowed:
            if now.time() < STATION_OPEN_TIME:
                reason = f"Station opens at 8:00 AM. Earliest reservation start time today is 08:00 AM."
            else:
                reason = f"Selected start time ({req_start.strftime('%I:%M %p')}) has already passed today."
            return {
                'is_available': False,
                'conflict_reason': reason,
                'overlapping_count': 0,
                'booked_intervals': [],
                'available_gaps': [],
            }

    # 2. Get existing booked intervals
    all_booked = get_station_booked_intervals(station, parsed_date)
    if exclude_booking_id:
        all_booked = [i for i in all_booked if i.get('booking_id') != str(exclude_booking_id)[:8]]

    # 3. Count concurrent overlaps during [req_start, req_end]
    # An overlap exists when: booked_start < req_end and booked_end > req_start
    overlapping = []
    for item in all_booked:
        b_start = item['start_time_raw']
        b_end = item['end_time_raw']
        if b_start < req_end and b_end > req_start:
            overlapping.append(item)

    overlapping_count = len(overlapping)
    capacity = max(1, station.total_slots)

    is_available = overlapping_count < capacity
    conflict_reason = None
    if not is_available:
        conflicting_times = ", ".join([f"{x['start_time']}–{x['end_time']}" for x in overlapping[:2]])
        conflict_reason = (
            f"This station is fully booked ({overlapping_count}/{capacity} chargers in use) "
            f"during {req_start.strftime('%I:%M %p')} – {req_end.strftime('%I:%M %p')}. "
            f"Conflict with: {conflicting_times}. Please select an open gap."
        )

    # 4. Compute available gaps for visual schedule display (operating window 06:00 to 23:00)
    available_gaps = compute_available_gaps(all_booked, capacity, parsed_date)

    return {
        'is_available': is_available,
        'conflict_reason': conflict_reason,
        'overlapping_count': overlapping_count,
        'booked_intervals': [
            {
                'booking_id': x.get('booking_id'),
                'start_time': x['start_time'],
                'end_time': x['end_time'],
                'label': x['label'],
            } for x in all_booked
        ],
        'available_gaps': available_gaps,
    }


def compute_available_gaps(booked_intervals, capacity, booking_date):
    """
    Computes major open windows between 06:00 and 23:00 for the schedule timeline.
    """
    day_start = time(6, 0)
    day_end = time(23, 0)

    if not booked_intervals:
        return [{
            'start_time': '06:00',
            'end_time': '23:00',
            'label': '06:00 AM – 11:00 PM (All Chargers Available)',
            'is_fully_open': True,
        }]

    # For simplicity of display, sort intervals and return open slots
    gaps = []
    curr = day_start
    for b in booked_intervals:
        b_start = b['start_time_raw']
        b_end = b['end_time_raw']
        if b_start > curr:
            gaps.append({
                'start_time': curr.strftime('%H:%M'),
                'end_time': b_start.strftime('%H:%M'),
                'label': f"{curr.strftime('%I:%M %p')} – {b_start.strftime('%I:%M %p')} (Available)",
                'is_fully_open': True,
            })
        if b_end > curr:
            curr = b_end

    if curr < day_end:
        gaps.append({
            'start_time': curr.strftime('%H:%M'),
            'end_time': day_end.strftime('%H:%M'),
            'label': f"{curr.strftime('%I:%M %p')} – {day_end.strftime('%I:%M %p')} (Available)",
            'is_fully_open': True,
        })

    return gaps
