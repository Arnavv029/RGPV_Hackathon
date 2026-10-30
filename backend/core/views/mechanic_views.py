from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

import re

from django.db import transaction

from core.models import Mechanic, EmergencyRequest
from core.serializers import MechanicProfileSerializer, EmergencyRequestSerializer

MAX_OPEN_SOS = 3
PHONE_RE = re.compile(r'^\+?\d{10,13}$')


def _float_or_none(value):
    if value in (None, ''):
        return None
    return float(value)


@api_view(['GET', 'POST', 'PUT'])
@permission_classes([IsAuthenticated])
def mechanic_profile_view(request):
    """GET: return current mechanic profile
       POST/PUT: create or update mechanic profile for current user
    """
    user = request.user
    if user.role != 'mechanic':
        return Response({'detail': 'Not a mechanic account'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        try:
            mech = user.mechanic_profile
        except Mechanic.DoesNotExist:
            return Response({}, status=status.HTTP_200_OK)
        serializer = MechanicProfileSerializer(mech, context={'request': request})
        return Response(serializer.data)

    data = request.data.copy()
    try:
        lat = _float_or_none(data.get('latitude'))
        lng = _float_or_none(data.get('longitude'))
        experience = int(data.get('experience_years', 1) or 0)
        cost = float(data.get('service_cost', 500) or 0)
    except (TypeError, ValueError):
        return Response({'detail': 'Location, experience and visit fee must be numbers.'}, status=status.HTTP_400_BAD_REQUEST)
    if (lat is not None and not -90 <= lat <= 90) or (lng is not None and not -180 <= lng <= 180):
        return Response({'detail': 'Pick a valid location on the map.'}, status=status.HTTP_400_BAD_REQUEST)
    if experience < 0 or cost < 0:
        return Response({'detail': 'Experience and visit fee cannot be negative.'}, status=status.HTTP_400_BAD_REQUEST)
    if not str(data.get('name') or user.username).strip():
        return Response({'detail': 'Workshop name is required.'}, status=status.HTTP_400_BAD_REQUEST)
    existing = Mechanic.objects.filter(user=user).first()
    phone = re.sub(r'[\s-]', '', str(data.get('phone') or (existing.phone if existing else '') or user.phone or ''))
    if not PHONE_RE.match(phone):
        return Response({'detail': 'Enter a valid phone number so drivers can call you.'}, status=status.HTTP_400_BAD_REQUEST)

    obj, created = Mechanic.objects.update_or_create(
        user=user,
        defaults={
            'name': data.get('name', user.username),
            'phone': phone,
            'specialization': data.get('specialization', 'general'),
            'location_text': data.get('location_text', ''),
            'latitude': lat,
            'longitude': lng,
            'experience_years': experience,
            'service_cost': cost,
            'is_available': str(data.get('is_available', True)).lower() not in ('false', '0'),
        }
    )
    serializer = MechanicProfileSerializer(obj, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mechanic_requests_view(request):
    """Return pending emergency requests for mechanics to act on.
       Simple implementation: return all pending requests.
    """
    user = request.user
    if user.role != 'mechanic':
        return Response({'detail': 'Not a mechanic account'}, status=status.HTTP_403_FORBIDDEN)

    try:
        mech = user.mechanic_profile
    except Mechanic.DoesNotExist:
        return Response([])
    qs = EmergencyRequest.objects.filter(mechanic=mech, status__in=('pending', 'accepted')).select_related('user', 'mechanic')
    serializer = EmergencyRequestSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mechanic_request_action_view(request, pk):
    """Mechanic accepts/rejects a request. Body: {"action": "accept"|"reject"}
    """
    user = request.user
    if user.role != 'mechanic':
        return Response({'detail': 'Not a mechanic account'}, status=status.HTTP_403_FORBIDDEN)

    try:
        mech = user.mechanic_profile
    except Mechanic.DoesNotExist:
        return Response({'detail': 'No mechanic profile'}, status=status.HTTP_400_BAD_REQUEST)

    action = request.data.get('action')
    if action not in ('accept', 'reject', 'complete'):
        return Response({'detail': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        try:
            req = EmergencyRequest.objects.select_for_update().get(pk=pk, mechanic=mech)
        except EmergencyRequest.DoesNotExist:
            return Response({'detail': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

        allowed_from = {'accept': 'pending', 'reject': 'pending', 'complete': 'accepted'}[action]
        if req.status != allowed_from:
            return Response({'detail': f'This request is already {req.status}.'}, status=status.HTTP_409_CONFLICT)
        req.status = {'accept': 'accepted', 'reject': 'rejected', 'complete': 'completed'}[action]
        req.save(update_fields=['status'])

    serializer = EmergencyRequestSerializer(req, context={'request': request})
    return Response(serializer.data)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def emergency_requests_view(request):
    """
    Driver side of SOS.
      GET  /api/emergency/requests/  -> the driver's recent requests and their status
      POST /api/emergency/requests/  { mechanic, phone, vehicle_number?, message?, latitude?, longitude? }
    """
    user = request.user
    if request.method == 'GET':
        qs = EmergencyRequest.objects.filter(user=user).select_related('mechanic')[:10]
        return Response(EmergencyRequestSerializer(qs, many=True, context={'request': request}).data)

    data = request.data
    try:
        mech = Mechanic.objects.get(pk=data.get('mechanic'))
    except (Mechanic.DoesNotExist, ValueError, TypeError):
        return Response({'detail': 'Choose a mechanic to send your request to.'}, status=status.HTTP_400_BAD_REQUEST)
    if not mech.is_available:
        return Response({'detail': f'{mech.name} is busy right now. Try another mechanic.'}, status=status.HTTP_409_CONFLICT)
    if mech.user_id == user.id:
        return Response({'detail': 'You cannot send a request to yourself.'}, status=status.HTTP_400_BAD_REQUEST)

    phone = re.sub(r'[\s-]', '', data.get('phone') or user.phone or '')
    if not PHONE_RE.match(phone):
        return Response({'detail': 'Enter a valid phone number so the mechanic can call you.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        lat = _float_or_none(data.get('latitude'))
        lng = _float_or_none(data.get('longitude'))
    except (TypeError, ValueError):
        return Response({'detail': 'Invalid location.'}, status=status.HTTP_400_BAD_REQUEST)

    if EmergencyRequest.objects.filter(user=user, status='pending').count() >= MAX_OPEN_SOS:
        return Response({'detail': 'You already have several open requests. Wait for a reply or call 112.'},
                        status=status.HTTP_429_TOO_MANY_REQUESTS)
    if EmergencyRequest.objects.filter(user=user, mechanic=mech, status__in=('pending', 'accepted')).exists():
        return Response({'detail': f'You already have an open request with {mech.name}.'}, status=status.HTTP_409_CONFLICT)

    req = EmergencyRequest.objects.create(
        user=user, mechanic=mech, phone=phone,
        vehicle_number=(data.get('vehicle_number') or '').strip()[:30],
        message=(data.get('message') or '').strip()[:500],
        latitude=lat, longitude=lng,
    )
    return Response(EmergencyRequestSerializer(req, context={'request': request}).data, status=status.HTTP_201_CREATED)
