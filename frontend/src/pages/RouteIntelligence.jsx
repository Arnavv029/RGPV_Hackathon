import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  Clock,
  Compass,
  Crosshair,
  Gauge,
  Info,
  MapPin,
  Navigation,
  Radio,
  Route,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import { inr } from '@/lib/format';
import { useGeolocation } from '@/hooks/useGeolocation';
import LiveMap from '@/components/map/LiveMap';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

// Popular Indian EV vehicle presets with realistic battery capacity, certified range, and peak fast-charging intake
const VEHICLE_PRESETS = [
  {
    name: 'Tata Nexon EV Max / Long Range',
    capacity: 40.5,
    range: 465,
    maxPower: 50,
    whKm: 87.1,
  },
  {
    name: 'MG ZS EV',
    capacity: 50.3,
    range: 461,
    maxPower: 80,
    whKm: 109.1,
  },
  {
    name: 'Tata Punch EV Long Range',
    capacity: 35.0,
    range: 421,
    maxPower: 50,
    whKm: 83.1,
  },
  {
    name: 'Mahindra XUV400 EV',
    capacity: 39.4,
    range: 456,
    maxPower: 50,
    whKm: 86.4,
  },
  {
    name: 'Hyundai Ioniq 5',
    capacity: 72.6,
    range: 631,
    maxPower: 220,
    whKm: 115.0,
  },
  {
    name: 'Tata Tiago EV Long Range',
    capacity: 24.0,
    range: 315,
    maxPower: 25,
    whKm: 76.2,
  },
  {
    name: 'BYD Atto 3',
    capacity: 60.48,
    range: 521,
    maxPower: 80,
    whKm: 116.0,
  },
  {
    name: 'Ola S1 Pro Gen 2 (Electric Scooter)',
    capacity: 4.0,
    range: 195,
    maxPower: 3.3,
    whKm: 20.5,
  },
  {
    name: 'Ather 450X (Electric Scooter)',
    capacity: 3.7,
    range: 150,
    maxPower: 3.0,
    whKm: 24.6,
  },
  {
    name: 'Custom Vehicle Profile',
    capacity: 40.0,
    range: 350,
    maxPower: 60,
    whKm: null,
  },
];

const QUICK_STARTS = ['Bhopal', 'MP Nagar, Bhopal', 'DB City Mall, Bhopal', 'Raja Bhoj Airport'];
const QUICK_DESTINATIONS = ['Indore', 'Dewas', 'Sehore', 'Ashta', 'Ujjain', 'Vidisha', 'Hoshangabad'];

export default function RouteIntelligence() {
  const navigate = useNavigate();
  const { coords, locate } = useGeolocation();

  // Selected vehicle preset
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);

  // Core Form State (simplified & automated)
  const [start, setStart] = useState('Bhopal');
  const [destination, setDestination] = useState('Indore');
  const [batteryCapacity, setBatteryCapacity] = useState(40.5);
  const [maxRange, setMaxRange] = useState(465);
  const [currentBatteryPct, setCurrentBatteryPct] = useState(75);

  // Calculation state
  const [loading, setLoading] = useState(false);
  const [routePlan, setRoutePlan] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);
  const [recalculating, setRecalculating] = useState(false);

  // Handle Preset Change
  const handlePresetSelect = (idx) => {
    setSelectedPresetIndex(idx);
    const p = VEHICLE_PRESETS[idx];
    if (p) {
      setBatteryCapacity(p.capacity);
      setMaxRange(p.range);
    }
  };

  // Use Current Location
  const handleUseMyLocation = () => {
    if (coords) {
      setStart(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
      toast.success('Live GPS coordinates set as starting point');
    } else {
      locate();
    }
  };

  // Execute Route Intelligence Calculation
  const handleCalculateRoute = async (e) => {
    if (e) e.preventDefault();
    if (!start.trim() || !destination.trim()) {
      toast.error('Please enter both starting location and destination.');
      return;
    }

    setLoading(true);
    setSelectedStation(null);

    try {
      const preset = VEHICLE_PRESETS[selectedPresetIndex];
      const payload = {
        start: start.trim(),
        destination: destination.trim(),
        battery_capacity_kwh: Number(batteryCapacity),
        max_range_km: Number(maxRange),
        current_battery_pct: Number(currentBatteryPct),
        vehicle_efficiency_wh_km: preset?.whKm || null,
        vehicle_max_charging_kw: preset?.maxPower || 60,
      };

      const res = await endpoints.smartRoutePlan(payload);
      setRoutePlan(res);

      if (res.along_route_stations?.length > 0) {
        toast.success(
          `Smart route calculated! Found ${res.along_route_stations.length} highway charging stations directly on your path.`
        );
      } else {
        toast.info('Route calculated. Destination reachable with available battery.');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to calculate smart route. Please check location names.');
    } finally {
      setLoading(false);
    }
  };

  // Select a station as charging stop and recalculate journey
  const handleSelectChargingStop = async (station) => {
    setSelectedStation(station);
    setRecalculating(true);

    try {
      const preset = VEHICLE_PRESETS[selectedPresetIndex];
      const payload = {
        start: start.trim(),
        destination: destination.trim(),
        battery_capacity_kwh: Number(batteryCapacity),
        max_range_km: Number(maxRange),
        current_battery_pct: Number(currentBatteryPct),
        vehicle_efficiency_wh_km: preset?.whKm || null,
        vehicle_max_charging_kw: preset?.maxPower || 60,
        selected_station_id: station.id,
      };

      const res = await endpoints.smartRouteRecalculate(payload);
      setRoutePlan(res);
      toast.success(
        `Journey updated with ${station.name} as your scheduled charging stop!`
      );
    } catch (err) {
      toast.error('Failed to recalculate journey with selected stop.');
    } finally {
      setRecalculating(false);
    }
  };

  // Direct Book Slot at Station
  const handleBookSlot = (station) => {
    // Store route planning context in sessionStorage for prefilling booking
    try {
      sessionStorage.setItem('hev_route_booking_context', JSON.stringify({
        stationId: station.id,
        stationName: station.name,
        vehicle: VEHICLE_PRESETS[selectedPresetIndex]?.name,
        currentBatteryPct: station.expected_arrival_battery_pct,
        targetBatteryPct: station.optimal_target_charge_pct,
        energyToChargeKwh: station.energy_to_charge_kwh,
        chargingDurationMins: station.charging_time_minutes,
      }));
    } catch (e) {
      console.warn('Storage failed:', e);
    }
    navigate(`/app/stations/${station.id}`);
  };

  // Map markers preparation
  const mapPoints = useMemo(() => {
    if (!routePlan) return [];
    const points = [];

    // Start point
    if (routePlan.start_location?.lat) {
      points.push({
        id: 'start-point',
        lat: Number(routePlan.start_location.lat),
        lng: Number(routePlan.start_location.lng),
        tone: 'mint',
        label: 'A',
        popup: (
          <div className="p-1">
            <div className="text-xs font-bold text-zinc-900">Start: {routePlan.start_location.name}</div>
            <div className="mt-1 text-[11px] text-zinc-600">Starting Battery: {currentBatteryPct}%</div>
          </div>
        ),
      });
    }

    // Destination point
    if (routePlan.dest_location?.lat) {
      points.push({
        id: 'dest-point',
        lat: Number(routePlan.dest_location.lat),
        lng: Number(routePlan.dest_location.lng),
        tone: 'sky',
        label: 'B',
        popup: (
          <div className="p-1">
            <div className="text-xs font-bold text-zinc-900">Destination: {routePlan.dest_location.name}</div>
            <div className="mt-1 text-[11px] text-zinc-600">
              Expected Arrival Battery:{' '}
              <strong className={routePlan.route?.direct_arrival_battery_pct < 15 ? 'text-rose-600' : 'text-emerald-600'}>
                {routePlan.selected_stop_summary
                  ? `${routePlan.selected_stop_summary.destination_arrival_battery_pct}% (via Charging Stop)`
                  : `${routePlan.route?.direct_arrival_battery_pct}%`}
              </strong>
            </div>
          </div>
        ),
      });
    }

    // Along route stations
    (routePlan.along_route_stations || []).forEach((st) => {
      const isSelected = selectedStation?.id === st.id || routePlan.selected_stop_summary?.id === st.id;
      let tone = 'mint';
      if (st.reachability === 'warning') tone = 'amber';
      if (st.reachability === 'unreachable') tone = 'rose';
      if (isSelected) tone = 'gold';

      points.push({
        id: st.id,
        lat: Number(st.latitude),
        lng: Number(st.longitude),
        tone,
        popup: (
          <div className="min-w-60 p-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-zinc-900">{st.name}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  st.reachability === 'safe'
                    ? 'bg-emerald-100 text-emerald-800'
                    : st.reachability === 'warning'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {st.reachability === 'safe' ? 'Reachable' : st.reachability === 'warning' ? 'Low Reserve' : 'Out of Range'}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">{st.location_text}</div>
            <div className="mt-2 space-y-1 border-t border-zinc-200 pt-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Expected Arrival Battery:</span>
                <span className="font-bold text-zinc-900">{st.expected_arrival_battery_pct}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Auto Target Charge:</span>
                <span className="font-bold text-emerald-600">{st.optimal_target_charge_pct}% (+{st.energy_to_charge_kwh} kWh)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Fast Charging Time:</span>
                <span className="font-semibold text-emerald-700">~{st.charging_time_minutes} mins ({st.power_kw} kW)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Rate:</span>
                <span className="font-semibold text-zinc-900">{inr(st.price_per_hour)}/hr</span>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => handleSelectChargingStop(st)}
                className="flex-1 rounded-lg bg-zinc-900 py-1.5 text-center text-xs font-bold !text-white hover:bg-zinc-800"
              >
                {isSelected ? '✓ Selected Stop' : 'Select Stop'}
              </button>
              <button
                onClick={() => handleBookSlot(st)}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-amber-300"
              >
                Book Slot
              </button>
            </div>
          </div>
        ),
      });
    });

    return points;
  }, [routePlan, selectedStation, currentBatteryPct]);

  return (
    <div className="pb-16">
      {/* ── Page Masthead ── */}
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-400">
              <Compass className="size-4 animate-spin-slow" />
              <span>Smart Route Intelligence Engine</span>
            </div>
            <h1 className="display-xl mt-2 text-[clamp(2.1rem,4.2vw,3.2rem)] font-extrabold tracking-tight text-bone">
              Highway Route & <span className="text-gradient">Battery Intelligence</span>
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-400">
              Optimal mathematical EV route planning. Discovers high-speed charging plazas directly on your highway path
              and automatically calculates exact battery drain, required charging top-up, and arrival battery.
            </p>
          </div>
        </div>
      </motion.header>

      {/* ── Main Layout: Inputs Card & Interactive Intelligence Display ── */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Form: Parameters & Controls (4 cols on lg) */}
        <div className="space-y-6 lg:col-span-5">
          <Card className="glass rounded-3xl p-6">
            <form onSubmit={handleCalculateRoute} className="space-y-5">
              {/* Vehicle Preset Selector */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-300">
                  Select EV Vehicle
                </label>
                <select
                  value={selectedPresetIndex}
                  onChange={(e) => handlePresetSelect(Number(e.target.value))}
                  className="w-full rounded-2xl border border-line bg-ink-900 px-4 py-3 text-sm font-semibold text-bone focus:border-amber-400 focus:outline-none"
                >
                  {VEHICLE_PRESETS.map((v, i) => (
                    <option key={v.name} value={i}>
                      {v.name} ({v.capacity} kWh · {v.range} km)
                    </option>
                  ))}
                </select>
              </div>

              {/* Locations: Start and Destination */}
              <div className="space-y-3.5 rounded-2xl border border-line/80 bg-ink-900/60 p-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-bold text-neutral-300">Starting Location</label>
                    <button
                      type="button"
                      onClick={handleUseMyLocation}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 transition hover:text-amber-300"
                    >
                      <Crosshair className="size-3" /> Use My GPS
                    </button>
                  </div>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mint-400" />
                    <input
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      placeholder="e.g. Bhopal, MP Nagar or coordinates"
                      className="w-full rounded-xl border border-line bg-ink-950 py-2.5 pl-10 pr-4 text-sm text-bone placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none"
                      required
                    />
                  </div>
                  {/* Quick origin chips */}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {QUICK_STARTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setStart(q)}
                        className="rounded-lg border border-line/60 bg-ink-800/80 px-2 py-0.5 text-[10px] text-neutral-400 hover:border-amber-400/40 hover:text-bone"
                      >
                        {q.split(',')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-neutral-300">Destination Location</label>
                  <div className="relative">
                    <Navigation className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-sky-400" />
                    <input
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="e.g. Indore, Dewas, Sehore"
                      className="w-full rounded-xl border border-line bg-ink-950 py-2.5 pl-10 pr-4 text-sm text-bone placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none"
                      required
                    />
                  </div>
                  {/* Quick destination chips */}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {QUICK_DESTINATIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setDestination(q)}
                        className="rounded-lg border border-line/60 bg-ink-800/80 px-2 py-0.5 text-[10px] text-neutral-400 hover:border-amber-400/40 hover:text-bone"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Battery & Vehicle Specs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-neutral-300">
                    Battery Capacity
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="200"
                      value={batteryCapacity}
                      onChange={(e) => setBatteryCapacity(Number(e.target.value))}
                      className="w-full rounded-xl border border-line bg-ink-950 py-2.5 pl-3 pr-11 text-sm font-semibold text-bone focus:border-amber-400 focus:outline-none"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                      kWh
                    </span>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-neutral-300">
                    Certified Range
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      min="10"
                      max="1000"
                      value={maxRange}
                      onChange={(e) => setMaxRange(Number(e.target.value))}
                      className="w-full rounded-xl border border-line bg-ink-950 py-2.5 pl-3 pr-10 text-sm font-semibold text-bone focus:border-amber-400 focus:outline-none"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                      km
                    </span>
                  </div>
                </div>
              </div>

              {/* Current Battery % Slider */}
              <div className="rounded-2xl border border-line/80 bg-ink-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BatteryCharging
                      className={`size-4 ${
                        currentBatteryPct > 50
                          ? 'text-mint-400'
                          : currentBatteryPct > 20
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    />
                    <span className="text-xs font-bold text-neutral-300">Current Battery Percentage</span>
                  </div>
                  <span
                    className={`font-display text-base font-bold ${
                      currentBatteryPct > 50
                        ? 'text-mint-400'
                        : currentBatteryPct > 20
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {currentBatteryPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="1"
                  value={currentBatteryPct}
                  onChange={(e) => setCurrentBatteryPct(Number(e.target.value))}
                  className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-ink-800 accent-amber-400"
                />
                <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
                  <span>5% (Depleted)</span>
                  <span>50%</span>
                  <span>100% (Full)</span>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full justify-center text-sm font-bold shadow-[0_0_25px_rgba(251,191,36,0.25)]"
              >
                <Compass className="size-4" /> Calculate Smart Highway Route
              </Button>
            </form>
          </Card>
        </div>

        {/* Right Section: Telemetry, Map & Along-Route Stations (7 cols on lg) */}
        <div className="space-y-6 lg:col-span-7">
          {/* Map display */}
          <Card className="glass overflow-hidden rounded-3xl p-3">
            <LiveMap
              points={mapPoints}
              routeWaypoints={routePlan?.route?.waypoints || null}
              routeColor="#0ea5e9"
              className="h-[420px] w-full"
            />
            {routePlan && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <span className="inline-block size-2 rounded-full bg-emerald-400"></span> Start
                  <span className="inline-block size-2 rounded-full bg-sky-400"></span> Destination
                  <span className="inline-block size-2 rounded-full bg-amber-400"></span> Highway Chargers
                </div>
                <div>
                  Highway corridor stations located directly on the travel path
                </div>
              </div>
            )}
          </Card>

          {/* If No Route Calculated Yet */}
          {!routePlan && !loading && (
            <Card className="glass flex flex-col items-center justify-center rounded-3xl py-12 text-center text-neutral-400">
              <Compass className="size-12 text-amber-400/50" />
              <h2 className="mt-3 text-lg font-bold text-bone">Ready to Plan Your EV Journey</h2>
              <p className="mt-1 max-w-md text-xs text-neutral-500">
                Choose your destination (e.g. Indore) and click Calculate Smart Highway Route to see
                high-speed chargers located directly on the highway with automatic battery predictions and slot booking.
              </p>
            </Card>
          )}

          {/* Results: Route Telemetry & Feasibility KPI */}
          {routePlan && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {/* Feasibility Alert Banner */}
              <div
                className={`rounded-3xl border p-5 ${
                  routePlan.route?.can_reach_direct
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {routePlan.route?.can_reach_direct ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
                  )}
                  <div className="flex-1">
                    <h2 className="text-base font-bold text-bone">
                      {routePlan.route?.can_reach_direct
                        ? 'Destination Reachable Directly Without Charging'
                        : 'Charging Stop Recommended Along the Highway'}
                    </h2>
                    <p className="mt-1 text-xs">
                      {routePlan.route?.can_reach_direct ? (
                        <>
                          Your current battery ({currentBatteryPct}%) is sufficient to reach{' '}
                          <strong>{routePlan.dest_location?.name}</strong> directly with{' '}
                          <strong>{routePlan.route?.direct_arrival_battery_pct}%</strong> remaining (above the 15% safety reserve).
                        </>
                      ) : (
                        <>
                          Direct driving to <strong>{routePlan.dest_location?.name}</strong> would drop your battery to{' '}
                          <strong className="text-rose-400">
                            {routePlan.route?.direct_arrival_battery_pct}%
                          </strong>{' '}
                          (below the 15% safety threshold). Please select one of the highway charging plazas below.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="glass rounded-2xl p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Highway Distance</div>
                  <div className="mt-1 font-display text-xl font-bold text-bone">
                    {routePlan.route?.total_distance_km} <span className="text-xs font-normal text-neutral-500">km</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">
                    ~{routePlan.route?.estimated_duration_min} mins drive
                  </div>
                </div>

                <div className="glass rounded-2xl p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Energy Consumption</div>
                  <div className="mt-1 font-display text-xl font-bold text-bone">
                    {routePlan.route?.direct_energy_kwh} <span className="text-xs font-normal text-neutral-500">kWh</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">
                    {routePlan.vehicle?.rated_wh_km} Wh/km
                  </div>
                </div>

                <div className="glass rounded-2xl p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Direct Arrival SoC</div>
                  <div
                    className={`mt-1 font-display text-xl font-bold ${
                      routePlan.route?.direct_arrival_battery_pct >= 15 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {routePlan.route?.direct_arrival_battery_pct}%
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">
                    {routePlan.route?.direct_arrival_battery_pct >= 15 ? 'Safe Reserve' : 'Depletion Risk'}
                  </div>
                </div>

                <div className="glass rounded-2xl p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Highway Chargers</div>
                  <div className="mt-1 font-display text-xl font-bold text-amber-400">
                    {routePlan.along_route_stations?.length || 0}
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">On Travel Corridor</div>
                </div>
              </div>

              {/* Recalculated Itinerary if a station stop is selected */}
              {routePlan.selected_stop_summary && (
                <Card className="glass border-amber-400/40 bg-amber-400/5 rounded-3xl p-5">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-amber-400 text-xs font-black text-ink-950">
                        ⚡
                      </span>
                      <h2 className="text-sm font-bold text-bone">
                        Updated Journey with Scheduled Stop at {routePlan.selected_stop_summary.name}
                      </h2>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleBookSlot(routePlan.selected_stop_summary)}
                    >
                      Book Slot Now →
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-line bg-ink-900/60 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Leg 1: To Highway Charger</div>
                      <div className="mt-1 text-xs text-neutral-300">
                        {routePlan.start_location?.name} → {routePlan.selected_stop_summary.name}
                      </div>
                      <div className="mt-2 text-sm font-bold text-bone">
                        Arrival Battery:{' '}
                        <span className="text-amber-400">
                          {routePlan.selected_stop_summary.expected_arrival_battery_pct}%
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {routePlan.selected_stop_summary.distance_from_start_km} km along highway
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Charging Session</div>
                      <div className="mt-1 text-xs text-neutral-300">
                        Fast charge to {routePlan.selected_stop_summary.optimal_target_charge_pct}%
                      </div>
                      <div className="mt-2 text-sm font-bold text-emerald-400">
                        +{routePlan.selected_stop_summary.energy_to_charge_kwh} kWh in ~{routePlan.selected_stop_summary.charging_time_minutes} min
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Est. Cost: {inr(routePlan.selected_stop_summary.estimated_charging_cost)} ({routePlan.selected_stop_summary.power_kw} kW)
                      </div>
                    </div>

                    <div className="rounded-2xl border border-line bg-ink-900/60 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Leg 2: To Destination</div>
                      <div className="mt-1 text-xs text-neutral-300">
                        Charger → {routePlan.dest_location?.name}
                      </div>
                      <div className="mt-2 text-sm font-bold text-emerald-400">
                        Final Arrival: {routePlan.selected_stop_summary.destination_arrival_battery_pct}%
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {routePlan.selected_stop_summary.remaining_distance_to_dest_km} km remaining
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Along-Route Highway Stations List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-bone">
                    Highway Charging Plazas Along Your Path ({routePlan.along_route_stations?.length || 0})
                  </h2>
                  <span className="text-xs text-neutral-500">Chronological highway order</span>
                </div>

                {routePlan.along_route_stations?.length === 0 ? (
                  <Card className="glass rounded-2xl p-6 text-center text-xs text-neutral-400">
                    No active charging stations located directly on this road corridor.
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {routePlan.along_route_stations.map((st) => {
                      const isSelected = selectedStation?.id === st.id || routePlan.selected_stop_summary?.id === st.id;
                      return (
                        <div
                          key={st.id}
                          className={`glass rounded-2xl p-4 transition ${
                            isSelected
                              ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_20px_rgba(251,191,36,0.15)] ring-1 ring-amber-400'
                              : 'border-line hover:border-neutral-600'
                          }`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-bold text-bone">{st.name}</h3>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                    st.reachability === 'safe'
                                      ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                                      : st.reachability === 'warning'
                                      ? 'border border-amber-500/30 bg-amber-500/15 text-amber-300'
                                      : 'border border-rose-500/30 bg-rose-500/15 text-rose-300'
                                  }`}
                                >
                                  {st.reachability_label}
                                </span>
                                {isSelected && (
                                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-ink-950">
                                    ✓ Scheduled Stop
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-neutral-400">{st.location_text}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
                                <span className="flex items-center gap-1 font-semibold text-neutral-300">
                                  <Route className="size-3 text-amber-400" />
                                  {st.distance_from_start_km} km along highway
                                </span>
                                <span>·</span>
                                <span className="text-emerald-400 font-semibold">{st.detour_km} km detour (On Road)</span>
                                <span>·</span>
                                <span className="text-bone font-semibold">{st.charger_type}</span>
                                <span>·</span>
                                <span className="font-semibold text-emerald-400">
                                  {st.available_slots_today > 0 ? `${st.available_slots_today} slots today` : 'Full today'}
                                </span>
                              </div>
                            </div>

                            {/* Battery & Charging Metrics at this station */}
                            <div className="flex shrink-0 items-center gap-4 sm:text-right">
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Arrival Battery
                                </div>
                                <div
                                  className={`font-display text-xl font-bold ${
                                    st.reachability === 'safe'
                                      ? 'text-emerald-400'
                                      : st.reachability === 'warning'
                                      ? 'text-amber-400'
                                      : 'text-rose-400'
                                  }`}
                                >
                                  {st.expected_arrival_battery_pct}%
                                </div>
                                <div className="text-[11px] font-semibold text-emerald-400">
                                  Auto Target: {st.optimal_target_charge_pct}%
                                </div>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <Button
                                  size="sm"
                                  variant={isSelected ? 'secondary' : 'primary'}
                                  onClick={() => handleSelectChargingStop(st)}
                                  loading={recalculating && selectedStation?.id === st.id}
                                  className="text-xs font-bold"
                                >
                                  {isSelected ? 'Selected' : 'Select Stop'}
                                </Button>
                                <button
                                  onClick={() => handleBookSlot(st)}
                                  className="rounded-lg border border-line bg-ink-800 px-3 py-1 text-[11px] font-semibold text-bone hover:border-amber-400/40 hover:text-amber-300"
                                >
                                  Book Slot →
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Secondary metrics bar with auto-calculated charge parameters */}
                          <div className="mt-3.5 flex flex-wrap items-center justify-between border-t border-line/50 pt-2.5 text-[11px] text-neutral-400">
                            <div>
                              Auto Top-up: <strong>+{st.energy_to_charge_kwh} kWh</strong> in <strong>~{st.charging_time_minutes} min</strong> · Est. cost:{' '}
                              <strong className="text-bone">{inr(st.estimated_charging_cost)}</strong>
                            </div>
                            <div>
                              Expected arrival at final destination:{' '}
                              <strong
                                className={
                                  st.can_reach_destination_after_charge ? 'text-emerald-400' : 'text-rose-400'
                                }
                              >
                                {st.destination_arrival_battery_pct}% at {routePlan.dest_location?.name}
                              </strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
