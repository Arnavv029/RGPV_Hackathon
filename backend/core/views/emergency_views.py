"""
Emergency Views
================
Endpoints:
  GET /api/emergency/mechanics/  → Nearby mechanics sorted by distance
  GET /api/emergency/stations/   → All stations (reused for Battery & Charger emergencies)

These are read-only, authenticated endpoints used by the Emergency section
on the user's home page.
"""

import math

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import Mechanic, Station
from core.serializers import MechanicSerializer, StationSerializer
from core.utils.distance import haversine_distance, sort_stations_by_distance

from django.db.models import Avg, Count, Value, FloatField
from django.db.models.functions import Coalesce


def _fuzzy_scores(mechanics):
    if not mechanics:
        return []

    ratings = [float(m.rating) if m.rating is not None else 0.0 for m in mechanics]
    distances = [getattr(m, 'distance', None) for m in mechanics]
    costs = [m.service_cost for m in mechanics]
    experiences = [m.experience_years for m in mechanics]

    max_distance = max([d for d in distances if d is not None] or [1.0])
    max_distance = max(max_distance, 20.0)
    min_cost = min(costs) if costs else 0.0
    max_cost = max(costs) if costs else 1.0
    cost_range = max_cost - min_cost or 1.0
    max_experience = max(experiences) if experiences else 1.0
    max_experience = max(max_experience, 8.0)

    scores = []
    for rating, distance, cost, experience in zip(ratings, distances, costs, experiences):
        rating_score = max(0.0, min((rating - 1.0) / 4.0, 1.0))
        distance_score = 0.5 if distance is None else 1.0 - min(distance, max_distance) / max_distance
        cost_score = 1.0 - min(max(cost - min_cost, 0.0) / cost_range, 1.0)
        experience_score = min(experience / max_experience, 1.0)
        scores.append({
            'rating': rating_score,
            'distance': distance_score,
            'cost': cost_score,
            'experience': experience_score,
        })

    return scores


def _compute_topsis_scores(mechanics, specialization_preference=None):
    if not mechanics:
        return mechanics

    weights = {'rating': 0.4, 'distance': 0.3, 'cost': 0.2, 'experience': 0.1}
    fuzzy_scores = _fuzzy_scores(mechanics)
    normalizers = {
        key: math.sqrt(sum(score[key] ** 2 for score in fuzzy_scores)) or 1.0
        for key in weights
    }

    weighted_scores = []
    for score in fuzzy_scores:
        weighted_scores.append({
            key: (score[key] / normalizers[key]) * weights[key]
            for key in weights
        })

    ideal_best = {key: max(score[key] for score in weighted_scores) for key in weights}
    ideal_worst = {key: min(score[key] for score in weighted_scores) for key in weights}

    for mechanic, weighted in zip(mechanics, weighted_scores):
        d_positive = math.sqrt(sum((weighted[key] - ideal_best[key]) ** 2 for key in weights))
        d_negative = math.sqrt(sum((weighted[key] - ideal_worst[key]) ** 2 for key in weights))
        topsis = d_negative / (d_positive + d_negative) if (d_positive + d_negative) else 0.0

        if specialization_preference:
            specialization_match = 1.0 if mechanic.specialization == specialization_preference else 0.0
            topsis = topsis * 0.9 + specialization_match * 0.1

        if not mechanic.is_available:
            topsis *= 0.82

        mechanic.topsis_score = round(topsis, 4)

    return mechanics


def _build_recommendation_reason(best_mechanic, average_cost, specialization_preference=None):
    reasons = []
    if best_mechanic.is_available:
        reasons.append('Available now')

    rating_value = float(best_mechanic.rating)
    if rating_value >= 4.5:
        reasons.append('High rating')
    elif rating_value >= 4.0:
        reasons.append('Good rating')

    if getattr(best_mechanic, 'distance', None) is not None:
        if best_mechanic.distance <= 5:
            reasons.append('Close to user')
        elif best_mechanic.distance <= 12:
            reasons.append('Reasonable distance')

    if best_mechanic.service_cost <= average_cost * 0.95:
        reasons.append('Reasonable cost')
    elif best_mechanic.service_cost <= average_cost * 1.1:
        reasons.append('Competitive price')
    else:
        reasons.append('Trusted service charge')

    if best_mechanic.experience_years >= 8:
        reasons.append('Experienced mechanic')
    elif best_mechanic.experience_years >= 4:
        reasons.append('Skilled technician')

    if specialization_preference and best_mechanic.specialization == specialization_preference:
        reasons.append('Matches requested specialization')

    return reasons[:4] or ['Best available mechanic based on your request']


# ─────────────────────────────────────────────────────────────────────────────
# NEARBY MECHANICS  (Emergency → Mechanics tab)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def emergency_mechanics_view(request):
    """
    Returns a list of available mechanics ranked by AHP-TOPSIS suitability.

    Query parameters (optional):
      ?lat=12.9716&lng=77.5946   ← user's GPS from browser
      ?specialization=battery    ← filter by type (battery/charger/general/tyre/motor)

    Response:
    [
      {
        "id": 1,
        "name": "Raju EV Mechanic",
        "phone": "+91 98765 43210",
        "specialization": "battery",
        "specialization_display": "Battery Specialist",
        "location_text": "Bhopal, MP Nagar",
        "distance": 1.3,
        "experience_years": 5,
        "is_available": true,
        "rating": "4.5",
        "review_count": 12
      }
    ]
    """
    mechanics = Mechanic.objects.all()

    # Optional filter by specialization
    spec = request.query_params.get('specialization')
    if spec:
        mechanics = mechanics.filter(specialization=spec)

    mechanics = list(mechanics)

    # Query args for ranking and location-aware scores
    user_lat = request.query_params.get('lat')
    user_lng = request.query_params.get('lng')

    if user_lat and user_lng:
        try:
            lat = float(user_lat)
            lng = float(user_lng)
            for m in mechanics:
                if m.latitude is not None and m.longitude is not None:
                    m.distance = haversine_distance(lat, lng, m.latitude, m.longitude)
                else:
                    m.distance = 9999.0
        except ValueError:
            for m in mechanics:
                m.distance = None
    else:
        for m in mechanics:
            m.distance = None

    mechanics = _compute_topsis_scores(mechanics, specialization_preference=spec)
    mechanics.sort(key=lambda m: (not m.is_available, -getattr(m, 'topsis_score', 0.0), getattr(m, 'distance', 9999.0)))

    if mechanics:
        average_cost = sum(m.service_cost for m in mechanics) / len(mechanics)
        mechanics[0].recommendation_reason = _build_recommendation_reason(
            mechanics[0], average_cost, specialization_preference=spec
        )

    serializer = MechanicSerializer(mechanics, many=True, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# EMERGENCY STATIONS  (Emergency → Battery & Charger tab)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def emergency_stations_view(request):
    """
    Returns nearby EV stations for emergency charging/battery help.
    Reuses the Station model — just adds emergency-specific distance sorting.

    Query parameters (optional):
      ?lat=&lng=           ← user GPS
      ?min_rating=4        ← minimum average stars (same as /api/stations/)
      ?sort=rating         ← highest rated first (with distance when lat/lng set)
    """
    stations = (
        Station.objects.filter(is_active=True)
        .select_related('owner')
        .annotate(
            avg_rating=Coalesce(Avg('reviews__rating'), Value(0.0), output_field=FloatField()),
            review_count=Count('reviews', distinct=True),
        )
    )

    min_rating = request.query_params.get('min_rating')
    if min_rating:
        try:
            stations = stations.filter(avg_rating__gte=float(min_rating))
        except ValueError:
            pass

    sort_mode = (request.query_params.get('sort') or '').lower()
    user_lat = request.query_params.get('lat')
    user_lng = request.query_params.get('lng')
    stations_list = None

    if user_lat and user_lng:
        try:
            lat = float(user_lat)
            lng = float(user_lng)
            stations_list = sort_stations_by_distance(stations, lat, lng)
            if sort_mode == 'rating':
                stations_list.sort(
                    key=lambda s: (-float(getattr(s, 'avg_rating', 0) or 0), s.distance)
                )
        except ValueError:
            stations_list = None

    if stations_list is None:
        if sort_mode == 'rating':
            stations_list = list(stations.order_by('-avg_rating', 'name'))
        else:
            stations_list = list(stations.order_by('name'))

    serializer = StationSerializer(stations_list, many=True, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)
