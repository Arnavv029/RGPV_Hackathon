"""
Station Views — For EV Users (not owners)
==========================================
Endpoints:
  GET /api/stations/              → List all active stations (sorted by distance)
  GET /api/stations/{id}/         → Station detail page
  GET /api/stations/{id}/slots/   → Available time slots for a date

These are READ-ONLY for regular users.
Owners use /api/owner/stations/ for creating/managing stations.
"""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from django.db.models import Avg, Count, Value, FloatField
from django.db.models.functions import Coalesce

from core.models import Station, TimeSlot
from core.serializers import StationSerializer, TimeSlotSerializer
from core.utils.distance import sort_stations_by_distance


# ─────────────────────────────────────────────────────────────────────────────
# LIST ALL STATIONS (with optional distance sorting)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def station_list_view(request):
    """
    Returns a list of all active EV charging stations.
    Optionally sorts them by distance if user sends their GPS location.

    Query parameters (optional):
      ?lat=12.9716&lng=77.5946   ← User's GPS coordinates from browser

    Response: List of station objects, each looking like:
    [
      {
        "id": 1,
        "name": "Green Power Station",
        "location_text": "MG Road, Bangalore",
        "total_slots": 5,
        "charger_type": "Fast Charger - 50kW",
        "distance": 2.3,        ← km (only if lat/lng were sent)
        "image_url": "http://localhost:8000/media/stations/green.jpg",
        ...
      }
    ]

    FRONTEND HOW-TO:
      When the user opens Home page:
        1. Call navigator.geolocation.getCurrentPosition() in React
        2. Call GET /api/stations/?lat=<lat>&lng=<lng>
        3. Display each station as a card with its distance
    """

    # Base queryset with rating aggregates for cards, filters, and sorting
    stations = (
        Station.objects.filter(is_active=True)
        .select_related('owner', 'owner__membership')
        .annotate(
            avg_rating=Coalesce(Avg('reviews__rating'), Value(0.0), output_field=FloatField()),
            review_count=Count('reviews', distinct=True),
        )
    )

    min_rating = request.query_params.get('min_rating')
    if min_rating:
        try:
            mr = float(min_rating)
            stations = stations.filter(avg_rating__gte=mr)
        except ValueError:
            pass

    sort_mode = (request.query_params.get('sort') or '').lower()

    # Check if user provided their GPS location
    user_lat = request.query_params.get('lat')
    user_lng = request.query_params.get('lng')
    radius = request.query_params.get('radius') or request.query_params.get('radar')

    stations_list = None

    if user_lat and user_lng:
        try:
            user_lat = float(user_lat)
            user_lng = float(user_lng)
        except ValueError:
            user_lat = None
            user_lng = None
    elif radius:
        # Default to Bhopal coordinates if radius requested without GPS
        user_lat = 23.2599
        user_lng = 77.4126

    if user_lat is not None and user_lng is not None:
        stations_list = sort_stations_by_distance(stations, user_lat, user_lng)

        # 30 km radar / distance radius filtering
        if radius:
            try:
                max_r = float(radius)
                stations_list = [s for s in stations_list if getattr(s, 'distance', 9999) <= max_r]
            except ValueError:
                pass

        # Prioritize paid membership stations (is_priority=True) at the top
        if sort_mode == 'rating':
            stations_list.sort(key=lambda s: (0 if s.is_priority else 1, -float(getattr(s, 'avg_rating', 0) or 0), s.distance))
        else:
            stations_list.sort(key=lambda s: (0 if s.is_priority else 1, s.distance))

    if stations_list is None:
        if sort_mode == 'rating':
            stations_list = sorted(stations, key=lambda s: (0 if s.is_priority else 1, -float(getattr(s, 'avg_rating', 0) or 0), s.name))
        else:
            stations_list = sorted(stations, key=lambda s: (0 if s.is_priority else 1, s.name))

    serializer = StationSerializer(
        stations_list,
        many=True,
        context={'request': request},
    )
    return Response(serializer.data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# STATION DETAIL
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def station_detail_view(request, pk):
    """
    Returns full details of a single station.
    Used when a user clicks on a station card to see the Station Detail Page.

    URL: GET /api/stations/1/

    Response includes:
    - Station info (name, location, charger type, phone, total_slots)
    - Owner name
    - Image URL
    """

    station = (
        Station.objects.filter(pk=pk, is_active=True)
        .select_related('owner')
        .annotate(
            avg_rating=Coalesce(Avg('reviews__rating'), Value(0.0), output_field=FloatField()),
            review_count=Count('reviews', distinct=True),
        )
        .first()
    )

    if not station:
        return Response(
            {'error': 'Station not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    serializer = StationSerializer(station, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# STATION SLOTS (for a specific date)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def station_slots_view(request, pk):
    """
    Returns all time slots for a station on a specific date.
    Shows which slots are available (green) and which are full (red).

    URL: GET /api/stations/1/slots/?date=2026-05-06

    If no date is provided, defaults to TODAY.

    Response:
    [
      {
        "id": 1,
        "start_time": "09:00:00",
        "end_time": "10:00:00",
        "capacity": 3,
        "booked_count": 1,
        "available_spots": 2,
        "is_full": false          ← GREEN on frontend
      },
      {
        "id": 2,
        "start_time": "10:00:00",
        "end_time": "11:00:00",
        "capacity": 2,
        "booked_count": 2,
        "available_spots": 0,
        "is_full": true           ← RED on frontend
      }
    ]

    FRONTEND HOW-TO:
      When user clicks a slot symbol on the Station Detail page:
        → Check if is_full is false → show as GREEN, allow click
        → Check if is_full is true  → show as RED, disable click
    """

    # Make sure the station exists
    try:
        station = Station.objects.get(pk=pk, is_active=True)
    except Station.DoesNotExist:
        return Response(
            {'error': 'Station not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    from datetime import datetime
    from django.utils import timezone

    now = timezone.localtime()
    slot_date = request.query_params.get('date', str(now.date()))

    try:
        parsed_date = datetime.strptime(slot_date, '%Y-%m-%d').date()
    except ValueError:
        return Response(
            {'error': 'Invalid date format. Use YYYY-MM-DD (e.g., 2026-05-06).'},
            status=status.HTTP_400_BAD_REQUEST
        )

    slots = TimeSlot.objects.filter(
        station=station,
        date=parsed_date,
        is_available=True
    ).order_by('start_time')

    if parsed_date < now.date():
        slots = slots.none()
    elif parsed_date == now.date():
        slots = slots.filter(start_time__gt=now.time())

    # Share one station instance so pricing looks up its rating only once
    slots = list(slots)
    for s in slots:
        s.station = station

    from core.utils.charging_estimator import (
        get_station_booked_intervals,
        compute_available_gaps,
        check_slot_interval_availability
    )

    booked_intervals = get_station_booked_intervals(station, parsed_date)
    available_gaps = compute_available_gaps(booked_intervals, station.total_slots, parsed_date)

    serializer = TimeSlotSerializer(slots, many=True)
    return Response({
        'station': station.name,
        'station_id': station.id,
        'date': slot_date,
        'total_slots': station.total_slots,
        'power_kw': station.power_kw or 30,
        'tariff_per_kwh': station.effective_tariff_per_kwh,
        'slots': serializer.data,
        'booked_intervals': [
            {
                'booking_id': x.get('booking_id'),
                'start_time': x['start_time'],
                'end_time': x['end_time'],
                'label': x['label'],
            } for x in booked_intervals
        ],
        'available_gaps': available_gaps,
    }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# STATION SCHEDULE TIMELINE (Booked intervals & open gaps)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def station_schedule_view(request, pk):
    """
    Returns visual schedule of booked intervals and available gaps for a station.
    URL: GET /api/stations/{id}/schedule/?date=YYYY-MM-DD
    """
    try:
        station = Station.objects.get(pk=pk, is_active=True)
    except Station.DoesNotExist:
        return Response({'error': 'Station not found.'}, status=status.HTTP_404_NOT_FOUND)

    from datetime import datetime
    from django.utils import timezone
    from core.utils.charging_estimator import get_station_booked_intervals, compute_available_gaps

    now = timezone.localtime()
    date_str = request.query_params.get('date', str(now.date()))
    try:
        parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

    booked_intervals = get_station_booked_intervals(station, parsed_date)
    available_gaps = compute_available_gaps(booked_intervals, station.total_slots, parsed_date)

    return Response({
        'station_id': station.id,
        'station_name': station.name,
        'total_slots': station.total_slots,
        'power_kw': station.power_kw or 30,
        'tariff_per_kwh': station.effective_tariff_per_kwh,
        'date': str(parsed_date),
        'booked_intervals': [
            {
                'booking_id': x.get('booking_id'),
                'start_time': x['start_time'],
                'end_time': x['end_time'],
                'label': x['label'],
            } for x in booked_intervals
        ],
        'available_gaps': available_gaps,
    }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# CHARGING TIME & COST ESTIMATION (Backend calculation & conflict engine)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def station_estimate_charging_view(request, pk):
    """
    Calculates estimated energy, charging duration, cost, 50% split advance/due,
    and checks time interval conflict on the station.
    
    URL: POST /api/stations/{id}/estimate-charging/
    Body:
      {
        "battery_capacity_kwh": 60.0,
        "current_soc": 20.0,
        "target_soc": 80.0,
        "charger_power_kw": 30.0,         # optional, defaults to station rated power
        "custom_duration_minutes": 72,    # optional, if user adjusts time interval
        "booking_date": "2026-11-26",
        "start_time": "10:00"
      }
    """
    try:
        station = Station.objects.get(pk=pk, is_active=True)
    except Station.DoesNotExist:
        return Response({'error': 'Station not found.'}, status=status.HTTP_404_NOT_FOUND)

    data = request.data
    from core.utils.charging_estimator import calculate_charging_estimate

    battery_capacity = data.get('battery_capacity_kwh') or data.get('battery_capacity')
    current_soc = data.get('current_soc') if data.get('current_soc') is not None else data.get('current_battery')
    target_soc = data.get('target_soc') if data.get('target_soc') is not None else data.get('target_battery')

    if battery_capacity is None or current_soc is None or target_soc is None:
        return Response(
            {'error': 'Please provide battery_capacity_kwh, current_soc, and target_soc.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        estimate = calculate_charging_estimate(
            station=station,
            battery_capacity_kwh=battery_capacity,
            current_soc=current_soc,
            target_soc=target_soc,
            charger_power_kw=data.get('charger_power_kw'),
            vehicle_max_power_kw=data.get('vehicle_max_power_kw'),
            custom_duration_minutes=data.get('custom_duration_minutes'),
            start_time=data.get('start_time'),
            booking_date=data.get('booking_date'),
        )
    except ValueError as err:
        return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as err:
        return Response({'error': f'Calculation error: {str(err)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response(estimate, status=status.HTTP_200_OK)
