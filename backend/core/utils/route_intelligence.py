"""
Smart Route Intelligence & Mathematical Battery Estimation Engine
==================================================================
Optimized mathematical EV energy consumption and route intelligence algorithm.

Models:
  - Base energy consumption (kWh/km) from battery capacity & rated range.
  - Automatic optimal speed profile & aerodynamic drag (quadratic air resistance).
  - Elevation changes (ascent potential energy & regenerative descent recoup).
  - Standard optimal traffic density multiplier and auxiliary HVAC power draw.
  - Route corridor station discovery prioritizing highway chargers over city interiors.
  - Segment battery consumption and expected arrival SoC (%) at every highway station.
  - Automatic calculation of optimal target charge level & energy needed to reach destination safely.
  - Nonlinear CC-CV battery charging curve modeling charging duration & cost.
  - Recalculated remaining journey after charging stop to destination.
  - Safety reserve threshold (15%) preventing stranding.
"""

import math
import logging
import requests
from decimal import Decimal
from django.db.models import F
from django.utils import timezone
from core.models import Station, TimeSlot
from core.utils.distance import haversine_distance

logger = logging.getLogger(__name__)

# Standard vehicle physical constants
EARTH_RADIUS_KM = 6371.0
GRAVITY_ACCEL = 9.81           # m/s^2
DEFAULT_EV_MASS_KG = 1600.0     # Average EV curb weight
PROPULSION_EFFICIENCY = 0.88   # Battery-to-wheels mechanical efficiency
REGEN_EFFICIENCY = 0.65        # Wheels-to-battery regenerative braking efficiency
BASE_AUXILIARY_KW = 1.2        # Electronics, cooling, battery thermal management
SAFETY_RESERVE_PCT = 15.0      # Safety reserve threshold (%)
CRITICAL_RESERVE_PCT = 5.0     # Minimum functional threshold (%)

# Known coordinates lookup dictionary for instant robust geocoding
KNOWN_LOCATIONS = {
    'bhopal': (23.2599, 77.4126),
    'bhopal junction': (23.2687, 77.4103),
    'mp nagar': (23.2318, 77.4353),
    'mp nagar zone 1': (23.2325, 77.4340),
    'mp nagar zone 2': (23.2318, 77.4353),
    'db city mall': (23.2351, 77.4324),
    'new market': (23.2330, 77.4010),
    'kolar road': (23.1770, 77.4260),
    'misrod': (23.1690, 77.4790),
    'lalghati': (23.2680, 77.3830),
    'bairagarh': (23.2790, 77.3370),
    'sant hirdaram nagar': (23.2790, 77.3370),
    'raja bhoj airport': (23.2875, 77.3378),
    'airport': (23.2875, 77.3378),
    'rani kamlapati': (23.2264, 77.4352),
    'habibganj': (23.2264, 77.4352),
    'arera colony': (23.2050, 77.4300),
    'bittan market': (23.2240, 77.4390),
    'bhel': (23.2450, 77.4800),
    'ayodhya bypass': (23.2760, 77.4680),
    'mandideep': (23.0560, 77.5250),
    'sehore': (23.2030, 77.0840),
    'ashta': (23.0180, 76.5450),
    'sonkatch': (22.9780, 76.3680),
    'dewas': (22.9550, 76.0820),
    'indore': (22.7196, 75.8577),
    'vidisha': (23.5250, 77.8180),
    'hoshangabad': (22.7519, 77.7289),
    'narmadapuram': (22.7519, 77.7289),
    'raisen': (23.3300, 77.7800),
    'sanchi': (23.4850, 77.7390),
    'ujjain': (23.1765, 75.7885),
    'jabalpur': (23.1815, 79.9864),
    'gwalior': (26.2183, 78.1828),
    'sagar': (23.8388, 78.7378),
}

# Key highway anchor points for Bhopal-Indore Highway SH-18 / NH-52
BHOPAL_INDORE_HIGHWAY_WAYPOINTS = [
    (23.2599, 77.4126),  # Bhopal Center
    (23.2680, 77.3830),  # Lalghati Square
    (23.2790, 77.3370),  # Bairagarh
    (23.2450, 77.2100),  # Phanda Highway Section
    (23.1950, 77.0620),  # Sehore Bypass (SH-18)
    (23.1250, 76.9200),  # Shyampur Road Link
    (23.0840, 76.8520),  # Kothri Highway Node (SH-18)
    (23.0180, 76.5450),  # Ashta Midway Hub (SH-18)
    (22.9780, 76.3680),  # Sonkatch Bypass (SH-18)
    (22.9550, 76.0820),  # Dewas Bypass Junction (SH-18 / NH-52)
    (22.8120, 75.9180),  # Manglia Expressway Gateway
    (22.7196, 75.8577),  # Indore City Center
]


def geocode_location(query):
    """
    Resolve address/location name to (lat, lng, display_name).
    Tries exact & partial matching in known dictionary first, then falls back to Nominatim OSM if needed.
    """
    if not query:
        return None

    clean = str(query).strip().lower()

    # Direct match in known locations
    if clean in KNOWN_LOCATIONS:
        lat, lng = KNOWN_LOCATIONS[clean]
        return {'lat': lat, 'lng': lng, 'name': query.title()}

    # Substring search in known locations
    for key, (lat, lng) in KNOWN_LOCATIONS.items():
        if key in clean or clean in key:
            return {'lat': lat, 'lng': lng, 'name': key.title()}

    # Try coordinates parsing if user pasted "lat, lng"
    try:
        parts = clean.split(',')
        if len(parts) == 2:
            lat, lng = float(parts[0].strip()), float(parts[1].strip())
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                return {'lat': lat, 'lng': lng, 'name': f"Coordinates ({lat:.4f}, {lng:.4f})"}
    except (ValueError, TypeError):
        pass

    # Online fallback via OpenStreetMap Nominatim
    try:
        url = "https://nominatim.openstreetmap.org/search"
        headers = {'User-Agent': 'HapticEV-RoutePlanner/1.0'}
        params = {'q': query, 'format': 'json', 'limit': 1}
        resp = requests.get(url, params=params, headers=headers, timeout=3.0)
        if resp.status_code == 200:
            results = resp.json()
            if results and len(results) > 0:
                lat = float(results[0]['lat'])
                lng = float(results[0]['lon'])
                return {'lat': lat, 'lng': lng, 'name': results[0].get('display_name', query)}
    except Exception as e:
        logger.warning(f"Nominatim geocode failed for {query}: {e}")

    # Fallback default: center of Bhopal
    return {'lat': 23.2599, 'lng': 77.4126, 'name': str(query).title()}


def calculate_base_consumption_kwh_per_km(battery_capacity_kwh, max_range_km, vehicle_efficiency_wh_km=None):
    """
    Calculates estimated base energy consumption per kilometre:
      - Uses vehicle actual rated Wh/km specification when available: Wh/km / 1000
      - Otherwise calculates: battery_capacity_kwh / max_range_km
    """
    if vehicle_efficiency_wh_km and float(vehicle_efficiency_wh_km) > 0:
        return float(vehicle_efficiency_wh_km) / 1000.0

    capacity = float(battery_capacity_kwh) if battery_capacity_kwh else 40.0
    rng = float(max_range_km) if max_range_km else 300.0
    if rng <= 0:
        rng = 300.0
    return capacity / rng


def calculate_optimal_segment_energy_kwh(
    distance_km,
    base_kwh_per_km,
    is_highway=True,
    elevation_diff_m=0.0,
    vehicle_mass_kg=DEFAULT_EV_MASS_KG,
):
    """
    Fully automatic, optimal mathematical formula for EV segment energy consumption.
    The system automatically defines the optimal physics model:
      - Highway cruise speed (~85 km/h) with quadratic aerodynamic drag C_aero
      - Baseline standard traffic efficiency multiplier (1.02x)
      - Continuous HVAC auxiliary climate load (1.06x)
      - Exact elevation potential energy calculation with 65% regenerative recoup
    """
    if distance_km <= 0:
        return 0.0

    if is_highway:
        # Highway cruising speed ~85 km/h
        # Aerodynamic drag grows with v^1.8 above optimal 60 km/h
        f_speed = 1.0 + 0.00035 * ((85.0 - 60.0) ** 1.8)  # ~1.115
        f_traffic = 1.02  # Smooth highway flow with occasional toll plazas
    else:
        # Urban / suburban speed ~45 km/h
        f_speed = 0.94
        f_traffic = 1.08  # Urban stop-and-go intersections

    f_aux = 1.06  # Standard optimal HVAC climate buffer & battery thermal management

    # Elevation potential energy calculation
    delta_e_elev = 0.0
    if elevation_diff_m > 0:
        delta_e_elev = (vehicle_mass_kg * GRAVITY_ACCEL * elevation_diff_m) / (3.6e6 * PROPULSION_EFFICIENCY)
    elif elevation_diff_m < 0:
        recoup = (vehicle_mass_kg * GRAVITY_ACCEL * abs(elevation_diff_m) * REGEN_EFFICIENCY) / 3.6e6
        delta_e_elev = -recoup

    e_seg = (distance_km * base_kwh_per_km * f_speed * f_traffic * f_aux) + delta_e_elev
    return max(0.01 * distance_km * base_kwh_per_km, e_seg)


def is_bhopal_indore_corridor(start_geo, dest_geo):
    """Checks whether the route travels between the Bhopal area and Indore area."""
    bhopal_lat, bhopal_lng = 23.25, 77.41
    indore_lat, indore_lng = 22.72, 75.86

    d_start_bhopal = haversine_distance(start_geo['lat'], start_geo['lng'], bhopal_lat, bhopal_lng)
    d_dest_indore = haversine_distance(dest_geo['lat'], dest_geo['lng'], indore_lat, indore_lng)

    d_start_indore = haversine_distance(start_geo['lat'], start_geo['lng'], indore_lat, indore_lng)
    d_dest_bhopal = haversine_distance(dest_geo['lat'], dest_geo['lng'], bhopal_lat, bhopal_lng)

    forward = (d_start_bhopal < 35.0 and d_dest_indore < 35.0)
    reverse = (d_start_indore < 35.0 and d_dest_bhopal < 35.0)
    return forward, reverse


def generate_driving_route(start_coords, end_coords):
    """
    Generates realistic driving path coordinates and segments between start and end.
    Tries OSRM public API; if offline or unavailable, uses highway corridor anchors
    (e.g. Bhopal-Indore Highway SH-18) to provide the true highway path.
    """
    lat1, lon1 = start_coords['lat'], start_coords['lng']
    lat2, lon2 = end_coords['lat'], end_coords['lng']

    direct_dist = haversine_distance(lat1, lon1, lat2, lon2)

    # 1. Attempt to query OSRM driving service
    try:
        url = f"https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson&steps=true"
        resp = requests.get(url, timeout=3.5)
        if resp.status_code == 200:
            data = resp.json()
            if data.get('code') == 'Ok' and data.get('routes'):
                route = data['routes'][0]
                total_dist_km = round(route['distance'] / 1000.0, 2)
                total_duration_min = round(route['duration'] / 60.0, 1)
                coordinates = route['geometry']['coordinates']
                latlngs = [[c[1], c[0]] for c in coordinates]
                return {
                    'distance_km': total_dist_km,
                    'duration_min': total_duration_min,
                    'waypoints': latlngs,
                    'is_real_road_geometry': True,
                }
    except Exception as e:
        logger.info(f"OSRM router fallback used: {e}")

    # 2. Highway Corridor Anchors for Bhopal <-> Indore corridor
    is_fwd, is_rev = is_bhopal_indore_corridor(start_coords, end_coords)
    if is_fwd or is_rev:
        anchors = list(BHOPAL_INDORE_HIGHWAY_WAYPOINTS)
        if is_rev:
            anchors.reverse()

        # Connect start to first anchor and last anchor to destination
        dense_waypoints = [[start_coords['lat'], start_coords['lng']]]
        total_road_dist = 0.0

        for idx in range(len(anchors) - 1):
            p1 = anchors[idx]
            p2 = anchors[idx + 1]
            seg_dist = haversine_distance(p1[0], p1[1], p2[0], p2[1])
            total_road_dist += seg_dist
            sub_steps = max(3, int(seg_dist / 4.0))
            for s in range(1, sub_steps + 1):
                r = s / float(sub_steps)
                w_lat = p1[0] + (p2[0] - p1[0]) * r
                w_lng = p1[1] + (p2[1] - p1[1]) * r
                dense_waypoints.append([round(w_lat, 5), round(w_lng, 5)])

        # Ensure destination is the final point
        dense_waypoints.append([end_coords['lat'], end_coords['lng']])
        total_road_dist = round(total_road_dist, 1)
        est_duration = round((total_road_dist / 75.0) * 60.0, 1)  # ~75 km/h average highway speed

        return {
            'distance_km': total_road_dist,
            'duration_min': est_duration,
            'waypoints': dense_waypoints,
            'is_real_road_geometry': True,
        }

    # 3. Standard fallback generator for other routes
    road_factor = 1.25 if direct_dist > 5 else 1.15
    road_dist_km = round(direct_dist * road_factor, 2)
    est_speed = 45.0 if direct_dist < 20 else 70.0
    est_duration_min = round((road_dist_km / est_speed) * 60.0, 1)

    steps = max(8, int(direct_dist * 2))
    waypoints = []
    for i in range(steps + 1):
        ratio = i / float(steps)
        curve_offset = math.sin(ratio * math.pi) * 0.005 * (1 if (lat1 < lat2) else -1)
        lat = lat1 + (lat2 - lat1) * ratio + curve_offset
        lng = lon1 + (lon2 - lon1) * ratio
        waypoints.append([round(lat, 5), round(lng, 5)])

    return {
        'distance_km': road_dist_km,
        'duration_min': est_duration_min,
        'waypoints': waypoints,
        'is_real_road_geometry': False,
    }


def point_to_segment_distance(px, py, x1, y1, x2, y2):
    """Calculates minimum distance from point P to line segment (A, B) in km."""
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return haversine_distance(px, py, x1, y1), 0.0

    t = ((px - x1) * dx + (py - y1) * dy) / float(dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy

    dist = haversine_distance(px, py, proj_x, proj_y)
    return dist, t


def find_stations_along_route(waypoints, total_route_km):
    """
    Finds EV charging stations along the route corridor.
    For highway trips (> 30 km), strictly prioritizes highway chargers located on the path
    and excludes city interior stations that require large backwards/inward detours.
    """
    active_stations = Station.objects.filter(is_active=True).select_related('owner')

    # Build cumulative distance array along route waypoints
    cumulative_dist = [0.0]
    for i in range(1, len(waypoints)):
        seg_dist = haversine_distance(
            waypoints[i - 1][0], waypoints[i - 1][1],
            waypoints[i][0], waypoints[i][1]
        )
        cumulative_dist.append(cumulative_dist[-1] + seg_dist)

    route_len = cumulative_dist[-1] if cumulative_dist else total_route_km
    is_highway_trip = (route_len > 30.0)

    # For highway trips, keep corridor tight (6 km) to capture stations right on the highway
    max_corridor_km = 6.0 if is_highway_trip else 4.0

    results = []

    for station in active_stations:
        if station.latitude is None or station.longitude is None:
            continue

        s_lat = float(station.latitude)
        s_lng = float(station.longitude)

        min_perp_dist = 9999.0
        best_along_dist = 0.0

        for i in range(len(waypoints) - 1):
            w1 = waypoints[i]
            w2 = waypoints[i + 1]
            perp_dist, t = point_to_segment_distance(
                s_lat, s_lng,
                w1[0], w1[1],
                w2[0], w2[1]
            )
            if perp_dist < min_perp_dist:
                min_perp_dist = perp_dist
                seg_len = cumulative_dist[i + 1] - cumulative_dist[i]
                best_along_dist = cumulative_dist[i] + (t * seg_len)

        # For highway trips, filter out city stations before the highway starts
        # (e.g. driver doesn't stop at an origin city mall before even leaving the city)
        if is_highway_trip:
            # Must be ahead along the travel path (>= 12 km from start) and before destination entry
            if best_along_dist < 12.0 or best_along_dist > (route_len - 5.0):
                continue
            # Detour must be minimal (< 4 km) because highway drivers want chargers on the road
            if min_perp_dist > max_corridor_km:
                continue
        else:
            if min_perp_dist > max_corridor_km:
                continue

        results.append({
            'station': station,
            'detour_km': round(min_perp_dist * 2.0, 1),
            'perp_distance_km': round(min_perp_dist, 2),
            'along_route_km': round(best_along_dist, 1),
            'total_distance_from_start_km': round(best_along_dist + min_perp_dist, 1),
        })

    # Sort stations strictly by travel order along the highway
    results.sort(key=lambda x: x['along_route_km'])
    return results


def calculate_nonlinear_charging_time(
    arrival_soc_pct,
    target_soc_pct,
    battery_capacity_kwh,
    station_power_kw,
    vehicle_max_charging_kw=60.0
):
    """
    Models realistic nonlinear EV CC-CV charging curve.
    Constant Current (CC) up to ~80% SoC, then Constant Voltage (CV) taper above 80%.
    """
    arrival_soc = max(0.0, min(100.0, float(arrival_soc_pct)))
    target_soc = max(arrival_soc, min(100.0, float(target_soc_pct)))

    if target_soc <= arrival_soc:
        return {
            'energy_to_charge_kwh': 0.0,
            'duration_minutes': 0,
            'effective_power_kw': float(station_power_kw or 50),
            'fast_charge_kwh': 0.0,
            'taper_charge_kwh': 0.0,
        }

    total_energy_kwh = ((target_soc - arrival_soc) / 100.0) * float(battery_capacity_kwh)

    st_power = float(station_power_kw) if station_power_kw else 50.0
    v_power = float(vehicle_max_charging_kw) if vehicle_max_charging_kw else 60.0
    effective_power = min(st_power, v_power) * 0.92  # 92% inverter/transfer efficiency

    time_minutes = 0.0
    fast_kwh = 0.0
    taper_kwh = 0.0

    if arrival_soc < 80.0:
        cc_end_soc = min(target_soc, 80.0)
        fast_kwh = ((cc_end_soc - arrival_soc) / 100.0) * float(battery_capacity_kwh)
        time_minutes += (fast_kwh / effective_power) * 60.0

    if target_soc > 80.0:
        cv_start_soc = max(arrival_soc, 80.0)
        taper_kwh = ((target_soc - cv_start_soc) / 100.0) * float(battery_capacity_kwh)
        taper_power = max(7.2, effective_power * 0.45)
        time_minutes += (taper_kwh / taper_power) * 60.0

    return {
        'energy_to_charge_kwh': round(total_energy_kwh, 2),
        'duration_minutes': max(5, int(round(time_minutes))),
        'effective_power_kw': round(effective_power, 1),
        'fast_charge_kwh': round(fast_kwh, 2),
        'taper_charge_kwh': round(taper_kwh, 2),
    }


def plan_smart_route(
    start_input,
    dest_input,
    battery_capacity_kwh,
    max_range_km,
    current_battery_pct,
    vehicle_efficiency_wh_km=None,
    vehicle_max_charging_kw=60.0,
    selected_station_id=None,
    custom_target_charge_pct=None,
):
    """
    Main orchestrator for Smart Route Intelligence:
    1. Geocodes start and destination.
    2. Uses optimal mathematical vehicle physics & road geometry.
    3. Evaluates direct journey feasibility.
    4. Identifies along-route highway charging stations (excluding city centers).
    5. Automatically computes:
       - Expected arrival battery % at each station.
       - Exact required charge (kWh) to comfortably reach destination with 15% safety reserve.
       - Optimal fast-charge target % (e.g. 80%).
       - Precise charging time and final destination arrival %.
    """
    # 1. Geocode
    start_geo = geocode_location(start_input)
    dest_geo = geocode_location(dest_input)

    # 2. Vehicle base specs
    battery_capacity = float(battery_capacity_kwh) if battery_capacity_kwh else 40.5
    max_range = float(max_range_km) if max_range_km else 450.0
    current_soc = float(current_battery_pct) if current_battery_pct is not None else 75.0

    base_kwh_per_km = calculate_base_consumption_kwh_per_km(
        battery_capacity, max_range, vehicle_efficiency_wh_km
    )
    rated_wh_km = round(base_kwh_per_km * 1000.0, 1)

    # 3. Generate route geometry
    route_info = generate_driving_route(start_geo, dest_geo)
    total_route_km = route_info['distance_km']
    waypoints = route_info['waypoints']
    is_highway_trip = (total_route_km > 30.0)

    # 4. Direct route energy consumption
    total_direct_energy = calculate_optimal_segment_energy_kwh(
        distance_km=total_route_km,
        base_kwh_per_km=base_kwh_per_km,
        is_highway=is_highway_trip,
    )

    initial_energy_kwh = (current_soc / 100.0) * battery_capacity
    direct_remaining_energy_kwh = initial_energy_kwh - total_direct_energy
    direct_arrival_soc = max(0.0, (direct_remaining_energy_kwh / battery_capacity) * 100.0)
    direct_arrival_soc = round(direct_arrival_soc, 1)

    can_reach_direct = direct_arrival_soc >= SAFETY_RESERVE_PCT

    # 5. Stations along route corridor
    candidate_stations = find_stations_along_route(waypoints, total_route_km)

    # Ensure explicitly selected station is always evaluated
    if selected_station_id is not None:
        try:
            sel_id = int(selected_station_id)
            if not any(item['station'].id == sel_id for item in candidate_stations):
                explicit_st = Station.objects.filter(id=sel_id).first()
                if explicit_st and explicit_st.latitude and explicit_st.longitude:
                    d_from_start = round(haversine_distance(start_geo['lat'], start_geo['lng'], explicit_st.latitude, explicit_st.longitude), 1)
                    candidate_stations.append({
                        'station': explicit_st,
                        'detour_km': 0.0,
                        'perp_distance_km': 0.0,
                        'along_route_km': d_from_start,
                        'total_distance_from_start_km': d_from_start,
                    })
        except (ValueError, TypeError):
            pass

    evaluated_stations = []
    selected_stop_summary = None
    today = timezone.localdate()

    for item in candidate_stations:
        st = item['station']
        dist_to_station = item['along_route_km']
        detour = item['detour_km']

        # Energy consumed from start to this station
        energy_to_station = calculate_optimal_segment_energy_kwh(
            distance_km=dist_to_station,
            base_kwh_per_km=base_kwh_per_km,
            is_highway=is_highway_trip,
        )

        arrival_kwh = initial_energy_kwh - energy_to_station
        arrival_soc = max(0.0, (arrival_kwh / battery_capacity) * 100.0)
        arrival_soc = round(arrival_soc, 1)

        # Reachability classification
        if arrival_soc >= SAFETY_RESERVE_PCT:
            reachability = 'safe'
            reachability_label = 'Reachable Safely'
        elif arrival_soc >= CRITICAL_RESERVE_PCT:
            reachability = 'warning'
            reachability_label = 'Low Reserve Margin'
        else:
            reachability = 'unreachable'
            reachability_label = 'Out of Reach'

        # Remaining distance from station to destination
        rem_dist_km = max(0.0, round(total_route_km - dist_to_station, 1))

        # Energy needed for remaining leg (Station -> Destination)
        rem_energy_kwh = calculate_optimal_segment_energy_kwh(
            distance_km=rem_dist_km,
            base_kwh_per_km=base_kwh_per_km,
            is_highway=is_highway_trip,
        )

        # AUTOMATIC OPTIMAL TARGET CHARGE CALCULATION:
        # Minimum SoC needed to finish leg 2 with 15% safety reserve:
        # SoC_needed = (rem_energy_kwh / battery_capacity * 100) + 15%
        # Standard fast-charging gold standard is 80% (CC band), or more if leg 2 requires it.
        min_soc_for_leg2 = round(((rem_energy_kwh / battery_capacity) * 100.0) + SAFETY_RESERVE_PCT)
        auto_target_soc = float(min(100.0, max(80.0, min_soc_for_leg2)))

        if custom_target_charge_pct is not None:
            effective_target_soc = float(custom_target_charge_pct)
        else:
            effective_target_soc = auto_target_soc

        # Charging simulation at this station
        charge_sim = calculate_nonlinear_charging_time(
            arrival_soc_pct=arrival_soc,
            target_soc_pct=effective_target_soc,
            battery_capacity_kwh=battery_capacity,
            station_power_kw=st.power_kw or 50,
            vehicle_max_charging_kw=vehicle_max_charging_kw,
        )

        # Estimated cost
        price_hr = float(st.price_per_hour) if st.price_per_hour else 30.0
        est_cost = round((charge_sim['duration_minutes'] / 60.0) * price_hr, 2)

        # Recalculate remaining leg: Station -> Destination
        post_charge_kwh = (effective_target_soc / 100.0) * battery_capacity
        dest_arrival_kwh = post_charge_kwh - rem_energy_kwh
        dest_arrival_soc = max(0.0, (dest_arrival_kwh / battery_capacity) * 100.0)
        dest_arrival_soc = round(dest_arrival_soc, 1)

        # Available slots count for today
        available_slots_count = TimeSlot.objects.filter(
            station=st, date=today, is_available=True, booked_count__lt=F('capacity')
        ).count()

        station_data = {
            'id': st.id,
            'name': st.name,
            'location_text': st.location_text,
            'latitude': st.latitude,
            'longitude': st.longitude,
            'charger_type': st.charger_type or 'DC Fast Charger',
            'power_kw': st.power_kw or 50,
            'price_per_hour': float(st.price_per_hour) if st.price_per_hour else 0.0,
            'total_slots': st.total_slots,
            'available_slots_today': available_slots_count,
            'distance_from_start_km': round(dist_to_station, 1),
            'detour_km': round(detour, 1),
            'along_route_km': item['along_route_km'],
            'energy_consumed_to_station_kwh': round(energy_to_station, 2),
            'expected_arrival_battery_pct': arrival_soc,
            'reachability': reachability,
            'reachability_label': reachability_label,
            'optimal_target_charge_pct': auto_target_soc,
            'charging_time_minutes': charge_sim['duration_minutes'],
            'energy_to_charge_kwh': charge_sim['energy_to_charge_kwh'],
            'effective_charging_power_kw': charge_sim['effective_power_kw'],
            'estimated_charging_cost': est_cost,
            'remaining_distance_to_dest_km': rem_dist_km,
            'remaining_energy_to_dest_kwh': round(rem_energy_kwh, 2),
            'destination_arrival_battery_pct': dest_arrival_soc,
            'can_reach_destination_after_charge': dest_arrival_soc >= SAFETY_RESERVE_PCT,
            'is_selected_stop': (selected_station_id is not None and int(selected_station_id) == st.id),
        }
        evaluated_stations.append(station_data)

        if selected_station_id is not None and int(selected_station_id) == st.id:
            selected_stop_summary = station_data

    # Recommend best station automatically if direct trip is tight
    recommended_station = None
    if evaluated_stations:
        safe_candidates = [s for s in evaluated_stations if s['reachability'] == 'safe']
        if safe_candidates:
            # Optimal highway stop: midway / highest along-route distance that is safely reachable
            recommended_station = max(safe_candidates, key=lambda x: x['along_route_km'])
        else:
            warning_candidates = [s for s in evaluated_stations if s['reachability'] == 'warning']
            if warning_candidates:
                recommended_station = warning_candidates[0]

    return {
        'start_location': start_geo,
        'dest_location': dest_geo,
        'vehicle': {
            'battery_capacity_kwh': battery_capacity,
            'max_range_km': max_range,
            'current_battery_pct': current_soc,
            'consumption_kwh_per_km': round(base_kwh_per_km, 4),
            'rated_wh_km': rated_wh_km,
            'is_highway_mode': is_highway_trip,
        },
        'route': {
            'total_distance_km': total_route_km,
            'estimated_duration_min': route_info['duration_min'],
            'waypoints': waypoints,
            'is_real_road_geometry': route_info['is_real_road_geometry'],
            'direct_energy_kwh': round(total_direct_energy, 2),
            'direct_arrival_battery_pct': direct_arrival_soc,
            'can_reach_direct': can_reach_direct,
            'safety_reserve_pct': SAFETY_RESERVE_PCT,
        },
        'along_route_stations': evaluated_stations,
        'recommended_station': recommended_station,
        'selected_stop_summary': selected_stop_summary,
    }
