"""
Smart Route Intelligence Views
==============================
Provides endpoints for EV Route Intelligence:
  - POST /api/routes/smart-plan/   → Plan route, compute mathematical EV battery consumption,
                                      find candidate stations with arrival SoC %, safety margin,
                                      and charging simulations.
  - POST /api/routes/recalculate/  → Recalculates journey with a chosen charging stop.
"""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.utils.route_intelligence import plan_smart_route


def _process_smart_route(data):
    """Internal helper to parse input data and run route intelligence."""
    start_input = data.get('start') or data.get('start_location')
    dest_input = data.get('destination') or data.get('dest_location') or data.get('end')

    if not start_input:
        return None, Response(
            {'error': 'Starting location is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if not dest_input:
        return None, Response(
            {'error': 'Destination location is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        battery_capacity = float(data.get('battery_capacity_kwh', 40.5))
        max_range = float(data.get('max_range_km', 400.0))
        current_battery = float(data.get('current_battery_pct', 70.0))
    except (ValueError, TypeError):
        return None, Response(
            {'error': 'Battery capacity, max range, and current percentage must be valid numbers.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    target_charge = data.get('target_charge_pct')
    try:
        target_charge = float(target_charge) if target_charge is not None else None
    except (ValueError, TypeError):
        target_charge = None

    vehicle_efficiency = data.get('vehicle_efficiency_wh_km')
    try:
        vehicle_efficiency = float(vehicle_efficiency) if vehicle_efficiency else None
    except (ValueError, TypeError):
        vehicle_efficiency = None

    vehicle_max_charging = data.get('vehicle_max_charging_kw', 60.0)
    try:
        vehicle_max_charging = float(vehicle_max_charging)
    except (ValueError, TypeError):
        vehicle_max_charging = 60.0

    selected_station_id = data.get('selected_station_id') or data.get('station_id')

    try:
        result = plan_smart_route(
            start_input=start_input,
            dest_input=dest_input,
            battery_capacity_kwh=battery_capacity,
            max_range_km=max_range,
            current_battery_pct=current_battery,
            vehicle_efficiency_wh_km=vehicle_efficiency,
            vehicle_max_charging_kw=vehicle_max_charging,
            selected_station_id=selected_station_id,
            custom_target_charge_pct=target_charge,
        )
        return result, None
        return result, None
    except Exception as exc:
        return None, Response(
            {'error': f'Failed to calculate smart route: {str(exc)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def smart_route_plan_view(request):
    """
    Calculates EV driving route, mathematical battery consumption, along-route
    charging stations, expected arrival battery percentages, and charging simulations.
    """
    data = dict(request.data or {})
    result, err_resp = _process_smart_route(data)
    if err_resp:
        return err_resp
    return Response(result, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def smart_route_recalculate_view(request):
    """
    Recalculates trip plan by pinning a chosen charging stop.
    Updates battery arrival %, charge required, and destination arrival %.
    """
    data = dict(request.data or {})
    station_id = data.get('station_id') or data.get('selected_station_id')

    if not station_id:
        return Response(
            {'error': 'station_id is required to recalculate the journey.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    data['selected_station_id'] = station_id
    result, err_resp = _process_smart_route(data)
    if err_resp:
        return err_resp
    return Response(result, status=status.HTTP_200_OK)
