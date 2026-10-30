"""
Owner Views — Station Management & QR Verification
====================================================
Endpoints:
  POST  /api/owner/stations/              → Add a new station
  GET   /api/owner/stations/              → List owner's own stations
  POST  /api/owner/slots/                 → Create time slots for a station
  GET   /api/owner/bookings/              → View all bookings for owner's stations
  GET   /api/owner/bookings/{id}/         → Single booking detail
  PATCH /api/owner/bookings/{id}/status/  → Approve or reject a booking
  POST  /api/owner/verify-qr/             → Scan QR → get booking info

All these endpoints require:
  1. User must be logged in (IsAuthenticated)
  2. User must have role='owner' (checked by is_owner_or_403 helper)
"""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from datetime import datetime

from django.db import transaction
from django.db.models import Exists, F, OuterRef
from django.utils import timezone

from core.utils.booking_email import queue_booking_email
from core.utils.booking_rules import start_refund

from core.models import Station, TimeSlot, Booking, Review
from core.serializers import (
    StationSerializer,
    TimeSlotSerializer,
    BookingDetailSerializer,
    BookingStatusUpdateSerializer,
    QRVerifySerializer
)


# ─────────────────────────────────────────────────────────────────────────────
# HELPER: Check if the request user is an owner
# ─────────────────────────────────────────────────────────────────────────────
def is_owner_or_403(request):
    """
    Returns None if the user is an owner.
    Returns a 403 Response if the user is NOT an owner.

    Usage in views:
        error = is_owner_or_403(request)
        if error: return error
    """
    if request.user.role != 'owner':
        return Response(
            {'error': 'Access denied. Only station owners can access this endpoint.'},
            status=status.HTTP_403_FORBIDDEN
        )
    return None


# ─────────────────────────────────────────────────────────────────────────────
# ADD / LIST STATIONS
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def owner_station_view(request):
    """
    GET  → List all stations belonging to this owner
    POST → Create a new station

    POST Request body:
    {
        "name": "Green Power Hub",
        "location_text": "MG Road, Bangalore, Karnataka",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "phone": "9876543210",
        "total_slots": 5,
        "charger_type": "Fast Charger - 50kW",
        "description": "Open 24/7. Near Metro station."
    }
    """

    error = is_owner_or_403(request)
    if error:
        return error

    if request.method == 'GET':
        stations = Station.objects.filter(owner=request.user)
        serializer = StationSerializer(stations, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        serializer = StationSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            # Set owner automatically; always activate the station on creation
            station = serializer.save(owner=request.user, is_active=True)

            # Credit 20 free bookings for new station registration
            from core.models import OwnerMembership
            membership, created = OwnerMembership.objects.get_or_create(
                user=request.user,
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
            if not created:
                membership.total_bookings_credited += 20
                membership.bookings_remaining += 20
                membership.save()

            return Response({
                'message': 'Station added successfully! 20 free bookings credited to your account.',
                'station': serializer.data,
                'bookings_remaining': membership.bookings_remaining,
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────────────────────────────────────
# UPDATE STATION (price_per_hour, description, etc.)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def owner_station_detail_view(request, pk):
    """
    GET   → Return single station belonging to this owner
    PATCH → Partially update station fields (e.g. price_per_hour, description)

    URL: PATCH /api/owner/stations/1/
    Body: { "price_per_hour": 120.00 }
    """
    error = is_owner_or_403(request)
    if error:
        return error

    try:
        station = Station.objects.get(pk=pk, owner=request.user)
    except Station.DoesNotExist:
        return Response(
            {'error': 'Station not found or you do not own this station.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if request.method == 'GET':
        serializer = StationSerializer(station, context={'request': request})
        return Response(serializer.data)

    elif request.method == 'PATCH':
        serializer = StationSerializer(station, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response({
                'message': 'Station updated successfully!',
                'station': serializer.data
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────────────────────────────────────
# CREATE TIME SLOTS
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def owner_create_slots_view(request):
    """
    GET  /api/owner/slots/?station=1&date=2026-05-06
         → All slots (open AND closed) for one of the owner's stations on a date.

    POST → Owner defines time slots for their station.

    The owner can create multiple slots at once using 'bulk' mode,
    or create one slot at a time.

    Single slot request:
    {
        "station": 1,
        "date": "2026-05-06",
        "start_time": "09:00",
        "end_time": "10:00",
        "capacity": 3
    }

    Bulk slot request (multiple times on same date):
    {
        "station": 1,
        "date": "2026-05-06",
        "capacity": 3,
        "time_ranges": [
            {"start_time": "09:00", "end_time": "10:00"},
            {"start_time": "10:00", "end_time": "11:00"},
            {"start_time": "11:00", "end_time": "12:00"},
            {"start_time": "14:00", "end_time": "15:00"},
            {"start_time": "15:00", "end_time": "16:00"}
        ]
    }
    """

    error = is_owner_or_403(request)
    if error:
        return error

    if request.method == 'GET':
        try:
            station = Station.objects.get(pk=request.query_params.get('station'), owner=request.user)
        except (Station.DoesNotExist, ValueError, TypeError):
            return Response(
                {'error': 'Station not found or you do not own this station.'},
                status=status.HTTP_404_NOT_FOUND
            )
        slot_date = request.query_params.get('date') or str(timezone.localdate())
        try:
            datetime.strptime(slot_date, '%Y-%m-%d')
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        slots = list(TimeSlot.objects.filter(station=station, date=slot_date).order_by('start_time'))
        for s in slots:
            s.station = station
        return Response({
            'station': station.name,
            'date': slot_date,
            'slots': TimeSlotSerializer(slots, many=True).data,
        }, status=status.HTTP_200_OK)

    station_id = request.data.get('station')
    date = request.data.get('date')
    capacity = request.data.get('capacity', 1)
    time_ranges = request.data.get('time_ranges')  # Optional: for bulk creation

    # Validate station ownership
    try:
        station = Station.objects.get(pk=station_id, owner=request.user)
    except Station.DoesNotExist:
        return Response(
            {'error': 'Station not found or you do not own this station.'},
            status=status.HTTP_404_NOT_FOUND
        )

    # ── BULK CREATION ─────────────────────────────────────────────────────────
    if time_ranges:
        created_slots = []
        errors = []

        for tr in time_ranges:
            slot_data = {
                'station': station.id,
                'date': date,
                'start_time': tr.get('start_time'),
                'end_time': tr.get('end_time'),
                'capacity': capacity,
            }
            serializer = TimeSlotSerializer(data=slot_data)
            if serializer.is_valid():
                slot = serializer.save()
                created_slots.append(serializer.data)
            else:
                errors.append(serializer.errors)

        return Response({
            'message': f'{len(created_slots)} slot(s) created.',
            'created': created_slots,
            'errors': errors
        }, status=status.HTTP_201_CREATED)

    # ── SINGLE SLOT CREATION ──────────────────────────────────────────────────
    else:
        slot_data = {
            'station': station.id,
            'date': date,
            'start_time': request.data.get('start_time'),
            'end_time': request.data.get('end_time'),
            'capacity': capacity,
        }
        serializer = TimeSlotSerializer(data=slot_data)
        if serializer.is_valid():
            serializer.save()
            return Response({
                'message': 'Time slot created!',
                'slot': serializer.data
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────────────────────────────────────
# UPDATE / DELETE A SINGLE SLOT
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def owner_slot_detail_view(request, pk):
    """
    PATCH  /api/owner/slots/{id}/  Body: { "is_available": false } or { "capacity": 4 }
           → Close/reopen a slot or change how many cars it takes.
    DELETE /api/owner/slots/{id}/
           → Remove a slot. Refused if anyone has ever booked it (bookings would
             be deleted with it) — close it instead.
    """
    error = is_owner_or_403(request)
    if error:
        return error

    try:
        slot = TimeSlot.objects.select_related('station').get(pk=pk, station__owner=request.user)
    except TimeSlot.DoesNotExist:
        return Response({'error': 'Slot not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        if slot.bookings.exists():
            return Response(
                {'error': 'This slot has bookings, so it cannot be deleted. Close it instead to stop new bookings.'},
                status=status.HTTP_409_CONFLICT
            )
        slot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    allowed = {k: request.data[k] for k in ('is_available', 'capacity') if k in request.data}
    if not allowed:
        return Response({'error': 'Send is_available and/or capacity.'}, status=status.HTTP_400_BAD_REQUEST)

    serializer = TimeSlotSerializer(slot, data=allowed, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response({'message': 'Slot updated.', 'slot': serializer.data}, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────────────────────────────────────
# VIEW ALL BOOKINGS (for owner's stations)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def owner_bookings_view(request):
    """
    Returns all bookings made for this owner's stations.
    Shown in the Owner Dashboard.

    Optional filter: ?status=pending  (show only pending bookings)

    Response: All bookings with user name, slot time, station name, status.
    """

    error = is_owner_or_403(request)
    if error:
        return error

    # Get all bookings where the station belongs to this owner
    rev_exists = Review.objects.filter(booking_id=OuterRef('pk'))
    bookings = (
        Booking.objects.filter(station__owner=request.user)
        .select_related('user', 'station', 'slot')
        .annotate(has_review=Exists(rev_exists))
        .order_by('-created_at')
    )

    # Optional status filter
    filter_status = request.query_params.get('status')
    if filter_status:
        bookings = bookings.filter(status=filter_status)

    serializer = BookingDetailSerializer(bookings, many=True, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# SINGLE BOOKING DETAIL (owner view)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def owner_booking_detail_view(request, pk):
    """
    Returns full details of a single booking.
    Owner uses this to see who booked, when, and what their status is.

    URL: GET /api/owner/bookings/1/
    """

    error = is_owner_or_403(request)
    if error:
        return error

    try:
        rev_exists = Review.objects.filter(booking_id=OuterRef('pk'))
        booking = (
            Booking.objects.filter(pk=pk, station__owner=request.user)
            .select_related('user', 'station', 'slot')
            .annotate(has_review=Exists(rev_exists))
            .get()
        )
    except Booking.DoesNotExist:
        return Response(
            {'error': 'Booking not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    serializer = BookingDetailSerializer(booking, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# APPROVE / REJECT / COMPLETE BOOKING
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def owner_update_booking_status_view(request, pk):
    """
    Owner updates booking status.

    URL: PATCH /api/owner/bookings/{id}/status/

    Body:
      { "status": "confirmed" }  — from pending
      { "status": "rejected" }   — from pending
      { "status": "completed" }  — from confirmed (charging session finished)
    """

    error = is_owner_or_403(request)
    if error:
        return error

    with transaction.atomic():
        try:
            booking = Booking.objects.select_for_update().get(pk=pk, station__owner=request.user)
        except Booking.DoesNotExist:
            return Response(
                {'error': 'Booking not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = BookingStatusUpdateSerializer(
            booking,
            data=request.data,
            partial=True  # partial=True enables PATCH behavior
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = serializer.validated_data['status']
        if new_status == 'rejected':
            # Driver already paid: refund in full and free the slot.
            start_refund(booking, 100)
            booking.cancelled_at = timezone.now()
            TimeSlot.objects.filter(pk=booking.slot_id, booked_count__gt=0).update(
                booked_count=F('booked_count') - 1
            )
        serializer.save()
        if new_status in ('confirmed', 'rejected'):
            queue_booking_email(booking, new_status)

    return Response({
        'message': f'Booking {new_status} successfully!',
        'booking_id': str(booking.booking_id),
        'status': new_status
    }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# VERIFY QR CODE
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def owner_verify_qr_view(request):
    """
    Owner scans a user's QR code → backend returns booking details.

    This is the QR verification endpoint.

    HOW IT WORKS:
      1. Owner opens QR Scanner page on their device
      2. Camera reads the QR code
      3. QR code contains JSON: { "booking_id": "550e8400-..." }
      4. Frontend extracts the booking_id and sends it here
      5. Backend looks up the booking and returns details
      6. Owner sees: user name, slot time, station — then approves/rejects

    Request body:
    {
        "booking_id": "550e8400-e29b-41d4-a716-446655440000"
    }

    Response (success):
    {
        "valid": true,
        "booking": {
            "id": 1,
            "booking_id": "550e8400-...",
            "full_name": "Ramesh Kumar",
            "phone": "9876543210",
            "email": "ramesh@gmail.com",
            "station": { ... },
            "slot": { ... },
            "status": "pending"
        }
    }
    """

    error = is_owner_or_403(request)
    if error:
        return error

    serializer = QRVerifySerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    booking_id = serializer.validated_data['booking_id']

    try:
        # Find the booking using the UUID from the QR code
        booking = Booking.objects.get(
            booking_id=booking_id,
            station__owner=request.user  # Security: only owner's own stations
        )
    except Booking.DoesNotExist:
        return Response({
            'valid': False,
            'error': 'Invalid QR code. Booking not found or does not belong to your station.'
        }, status=status.HTTP_404_NOT_FOUND)

    return Response({
        'valid': True,
        'booking': BookingDetailSerializer(booking, context={'request': request}).data
    }, status=status.HTTP_200_OK)
