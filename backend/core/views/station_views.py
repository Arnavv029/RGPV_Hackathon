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

    stations_list = None

    if user_lat and user_lng:
        try:
            user_lat = float(user_lat)
            user_lng = float(user_lng)
            stations_list = sort_stations_by_distance(stations, user_lat, user_lng)
            # Prioritize paid membership stations (is_priority=True) at the top
            if sort_mode == 'rating':
                stations_list.sort(key=lambda s: (0 if s.is_priority else 1, -float(getattr(s, 'avg_rating', 0) or 0), s.distance))
            else:
                stations_list.sort(key=lambda s: (0 if s.is_priority else 1, s.distance))
        except ValueError:
            stations_list = None

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

    serializer = TimeSlotSerializer(slots, many=True)
    return Response({
        'station': station.name,
        'date': slot_date,
        'slots': serializer.data
    }, status=status.HTTP_200_OK)
