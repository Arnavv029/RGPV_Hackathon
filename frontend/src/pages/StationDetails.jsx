import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Battery,
  BatteryCharging,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  Info as InfoIcon,
  Layers,
  MapPin,
  MessageSquareText,
  Minus,
  Navigation,
  Phone,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { endpoints } from '@/lib/api';
import { openDirections } from '@/lib/maps';
import {
  addDays,
  dateShort,
  dateTimeLong,
  formatDuration,
  inr,
  time12,
  toISODate,
} from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { AvailabilityPill, RatingStars, stationImage } from '@/components/station/StationCard';
import LiveMap from '@/components/map/LiveMap';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/Feedback';

export const PENDING_BOOKING_KEY = 'hev_booking_pending';

const EV_PRESETS = [
  { name: 'Nexon EV', capacity: 40.5, type: 'EV SUV' },
  { name: 'Tiago EV', capacity: 24.0, type: 'EV Hatchback' },
  { name: 'MG ZS EV', capacity: 50.3, type: 'EV SUV' },
  { name: 'XUV400', capacity: 39.4, type: 'EV SUV' },
  { name: 'Ioniq 5', capacity: 72.6, type: 'EV Sedan' },
  { name: 'Ola S1 Pro', capacity: 4.0, type: 'Electric Scooter' },
  { name: 'Ather 450X', capacity: 3.7, type: 'Electric Scooter' },
];

export default function StationDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [date, setDate] = useState(toISODate());

  // ── Smart Estimation State ────────────────────────────────────────────────
  const [selectedPreset, setSelectedPreset] = useState('Nexon EV');
  const [batteryCapacity, setBatteryCapacity] = useState(40.5);
  const [currentSoc, setCurrentSoc] = useState(20);
  const [targetSoc, setTargetSoc] = useState(80);
  const [chargerPower, setChargerPower] = useState(30);
  const [startTime, setStartTime] = useState('10:00');
  const [customDurationMins, setCustomDurationMins] = useState(null);

  // Estimation server response
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState('');
  const [selectedBay, setSelectedBay] = useState(1);

  const station = useAsync(() => endpoints.station(id), [id]);
  const reviews = useAsync(() => endpoints.stationReviews(id, { limit: 20 }), [id]);
  const schedule = useAsync(() => endpoints.stationSchedule(id, date), [id, date]);

  const routeContext = useMemo(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem('hev_route_booking_context') || 'null');
      if (stored && Number(stored.stationId) === Number(id)) return stored;
    } catch {
      // ignore
    }
    return null;
  }, [id]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)), []);

  // Update charger power once station loads
  useEffect(() => {
    if (station.data) {
      const p = station.data.power_kw || 30;
      setChargerPower(p);
    }
  }, [station.data]);

  // If routeContext is present, seed battery parameters
  useEffect(() => {
    if (routeContext) {
      if (routeContext.currentBatteryPct != null) setCurrentSoc(Number(routeContext.currentBatteryPct));
      if (routeContext.targetBatteryPct != null) setTargetSoc(Number(routeContext.targetBatteryPct));
      if (routeContext.energyToChargeKwh && batteryCapacity) {
        // approximate capacity
      }
    }
  }, [routeContext]);

  // Set default initial start time respecting operating hours (08:00 - 22:00)
  useEffect(() => {
    const now = new Date();
    const todayStr = toISODate(now);
    if (date === todayStr) {
      const h = now.getHours();
      let nextH;
      if (h < 8) {
        nextH = 8;
      } else if (h >= 21) {
        nextH = 8;
      } else {
        nextH = h + 1;
      }
      const hStr = String(nextH).padStart(2, '0');
      setStartTime(`${hStr}:00`);
    } else {
      setStartTime('10:00');
    }
    setCustomDurationMins(null);
  }, [date]);

  // ── Live Calculation Function ─────────────────────────────────────────────
  const fetchEstimate = useCallback(async () => {
    if (!id || !batteryCapacity || currentSoc == null || targetSoc == null) return;
    if (Number(currentSoc) >= Number(targetSoc)) {
      setEstimateError('Target battery % must be higher than current battery %');
      setEstimate(null);
      return;
    }

    try {
      setEstimating(true);
      setEstimateError('');
      const data = await endpoints.estimateCharging(id, {
        battery_capacity_kwh: Number(batteryCapacity),
        current_soc: Number(currentSoc),
        target_soc: Number(targetSoc),
        charger_power_kw: Number(chargerPower || 30),
        booking_date: date,
        start_time: startTime,
        custom_duration_minutes: customDurationMins,
      });
      setEstimate(data);
    } catch (err) {
      setEstimateError(err.message || 'Estimation failed');
      setEstimate(null);
    } finally {
      setEstimating(false);
    }
  }, [id, batteryCapacity, currentSoc, targetSoc, chargerPower, date, startTime, customDurationMins]);

  // Trigger calculation whenever inputs change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEstimate();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchEstimate]);

  const handlePresetSelect = (preset) => {
    setSelectedPreset(preset.name);
    setBatteryCapacity(preset.capacity);
    setCustomDurationMins(null);
  };

  const adjustDuration = (deltaMins) => {
    if (!estimate) return;
    const baseMins = customDurationMins ?? estimate.calculated_charging_minutes;
    const newMins = Math.max(15, baseMins + deltaMins);
    setCustomDurationMins(newMins);
  };

  const resetDuration = () => {
    setCustomDurationMins(null);
  };

  const selectGap = (gap) => {
    setStartTime(gap.start_time);
    setCustomDurationMins(null);
  };

  if (station.error) return <ErrorState error={station.error} onRetry={station.reload} />;
  if (station.loading || !station.data) return <Spinner label="Loading station…" />;

  const s = station.data;
  const reviewList = reviews.data?.reviews || [];
  const scheduleData = schedule.data || {};
  const bookedIntervals = scheduleData.booked_intervals || [];
  const availableGaps = scheduleData.available_gaps || [];

  const effectiveTariff = s.effective_tariff_per_kwh || s.price_per_hour || s.tariff_per_kwh || 20.0;

  const proceed = () => {
    if (!estimate || !estimate.is_available) return;

    sessionStorage.setItem(
      PENDING_BOOKING_KEY,
      JSON.stringify({
        stationId: s.id,
        stationName: s.name,
        stationLocation: s.location_text,
        bayNumber: selectedBay,
        bayName: `Bay #${selectedBay}`,
        slotDate: estimate.booking_date,
        slotStart: estimate.start_time,
        slotEnd: estimate.end_time,
        durationHours: estimate.duration_hours,
        durationMinutes: estimate.duration_minutes,
        batteryCapacityKwh: estimate.battery_capacity_kwh,
        currentSoc: estimate.current_soc,
        targetSoc: estimate.target_soc,
        energyRequiredKwh: estimate.energy_required_kwh,
        chargerPowerKw: estimate.effective_charging_power_kw,
        tariffPerKwh: estimate.tariff_per_kwh,
        totalAmount: estimate.total_estimated_cost,
        advanceAmount: estimate.advance_payment,
        remainingAmount: estimate.remaining_payment,
        imageUrl: stationImage(s),
        routeContext: routeContext || undefined,
      }),
    );
    navigate('/app/book');
  };

  const hasCoords =
    s.latitude !== null &&
    s.longitude !== null &&
    Number.isFinite(Number(s.latitude)) &&
    Number.isFinite(Number(s.longitude));

  return (
    <div className="pb-16">
      <Link to="/app" className="mb-5 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-bone">
        <ArrowLeft className="size-4" /> All stations
      </Link>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative mb-10 h-80 overflow-hidden rounded-[32px] border border-line sm:h-[24rem]"
      >
        <motion.img
          src={stationImage(s)}
          alt={s.name}
          className="absolute inset-0 size-full object-cover"
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060607]/95 via-[#060607]/55 to-[#060607]/15" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <Zap className="size-3.5 fill-emerald-500 dark:fill-emerald-300" /> {s.total_slots} Fast Charging Bays
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-300">
                ⚡ Rated {s.power_kw || 30} kW
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-400/20 px-3 py-1 text-xs font-semibold text-sky-200">
                ₹{effectiveTariff}/unit
              </span>
            </div>
            <h1 className="display-xl mt-3 text-[clamp(2rem,4vw,3.2rem)] !text-white">{s.name}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-white/80">
              <MapPin className="size-4" /> {s.location_text}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/15 bg-black/40 px-4 py-2.5 text-center backdrop-blur-md">
              <div className="flex items-center gap-1.5">
                <RatingStars value={s.avg_rating} />
                <span className="font-semibold text-white">{Number(s.avg_rating || 0).toFixed(1)}</span>
              </div>
              <div className="text-[11px] text-white/60">{s.review_count} reviews</div>
            </div>
            {hasCoords && (
              <Button variant="secondary" onClick={() => openDirections(s)}>
                <Navigation className="size-4" /> Directions
              </Button>
            )}
          </div>
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* ── Left column ──────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Smart Route Context if redirected from Route Planner */}
          {routeContext && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-xs text-amber-200">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-amber-400 text-xs font-black text-ink-950">
                  ⚡
                </span>
                <div>
                  <span className="font-bold text-bone">Smart Route Trip Plan:</span> Vehicle:{' '}
                  <strong>{routeContext.vehicle}</strong> · Target:{' '}
                  <strong className="text-emerald-400">{routeContext.targetBatteryPct}%</strong> (+
                  {routeContext.energyToChargeKwh} kWh)
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 1: Date & Live Schedule Timeline ──────────────────── */}
          <Card className="p-6">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2.5 text-xl uppercase tracking-wider text-bone">
                <CalendarDays className="size-5 text-amber-300" /> 1. Select Date & View Schedule
              </h2>
              <span className="text-xs text-neutral-400">Live booked intervals & open gaps</span>
            </div>

            {/* Date Picker Pills */}
            <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
              {days.map((d) => {
                const iso = toISODate(d);
                const active = iso === date;
                return (
                  <button
                    key={iso}
                    onClick={() => setDate(iso)}
                    className={`relative flex min-w-16 flex-col items-center rounded-xl border px-3 py-2.5 transition ${
                      active
                        ? 'border-amber-400/60 text-on-accent'
                        : 'border-line text-neutral-400 hover:border-line-2 hover:text-bone'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="day-pill"
                        className="absolute inset-0 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500"
                      />
                    )}
                    <span className="relative text-[10px] font-semibold uppercase tracking-wider">
                      {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                    </span>
                    <span className="relative font-display text-lg font-semibold">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>

            {/* Booked Intervals & Available Gaps View */}
            <div className="space-y-4 rounded-2xl border border-line bg-surface/40 p-4">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-400">
                <span>Booked Intervals on {dateShort(date)}</span>
                <span className="text-amber-300">{s.total_slots} Charger Bays Total</span>
              </div>

              {schedule.loading ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner label="Loading schedule timeline…" />
                </div>
              ) : bookedIntervals.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  ⚡ All chargers are currently open on this day with zero conflicting bookings!
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {bookedIntervals.map((b, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300"
                    >
                      <Clock className="size-3.5 text-rose-400" />
                      <span>{b.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Available Gaps to Book Directly */}
              {availableGaps.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Open gaps to book:
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {availableGaps.map((gap, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectGap(gap)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 transition hover:bg-emerald-500/25"
                      >
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        <span>{gap.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* ── STEP 2: Dedicated Bay Selection (Showcase All Station Bays) ────────────── */}
          <Card className="p-6">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2.5 text-xl uppercase tracking-wider text-bone">
                  <Zap className="size-5 text-amber-300" /> 2. Select Station Bay
                </h2>
                <p className="text-xs text-neutral-400">
                  This station has {s.total_slots} dedicated charging bays. Choose your preferred bay.
                </p>
              </div>
              <div className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
                {s.total_slots} Dedicated Bays
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: Math.max(1, s.total_slots || 1) }, (_, i) => i + 1).map((bayNum) => {
                const isSelected = selectedBay === bayNum;
                return (
                  <button
                    key={bayNum}
                    type="button"
                    onClick={() => setSelectedBay(bayNum)}
                    className={`relative flex flex-col items-center justify-between rounded-2xl border p-3.5 text-center transition ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_20px_rgba(245,158,11,0.25)] ring-1 ring-amber-400'
                        : 'border-line/80 bg-surface/50 hover:border-amber-400/40 hover:bg-hover'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-amber-300">Bay #{bayNum}</span>
                      <span className={`inline-block size-2 rounded-full ${isSelected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'}`} />
                    </div>
                    <div className="my-2.5 text-center">
                      <div className="font-display text-base font-bold text-bone">
                        Bay {bayNum}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        {s.charger_type || 'Fast DC'} · {s.power_kw || 60} kW
                      </div>
                    </div>
                    <div className={`w-full rounded-lg py-1 text-[10px] font-semibold ${
                      isSelected
                        ? 'bg-amber-400/20 text-amber-300'
                        : 'border border-line/60 bg-hover text-neutral-300'
                    }`}>
                      {isSelected ? '✓ Selected Bay' : 'Available'}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* ── STEP 3: Vehicle & Battery Estimation Engine ────────────── */}
          <Card className="p-6">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2.5 text-xl uppercase tracking-wider text-bone">
                  <BatteryCharging className="size-5 text-amber-300" /> 3. Vehicle & Charging Needs
                </h2>
                <p className="text-xs text-neutral-400">
                  Calculates exact energy required and estimated charging duration.
                </p>
              </div>
              <div className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
                Tariff: ₹{effectiveTariff}/unit
              </div>
            </div>

            {/* Quick Presets */}
            <div className="mb-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Select your EV model preset:
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {EV_PRESETS.map((p) => {
                  const active = selectedPreset === p.name;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handlePresetSelect(p)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'border-amber-400 bg-amber-400/20 text-bone shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                          : 'border-line bg-surface/50 text-neutral-400 hover:border-amber-400/40 hover:text-bone'
                      }`}
                    >
                      {p.name} ({p.capacity} kWh)
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSelectedPreset('Custom')}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                    selectedPreset === 'Custom'
                      ? 'border-amber-400 bg-amber-400/20 text-bone'
                      : 'border-line bg-surface/50 text-neutral-400 hover:text-bone'
                  }`}
                >
                  Custom EV
                </button>
              </div>
            </div>

            {/* Input Form Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Battery Capacity (kWh) *
                </label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-surface/50 px-3 py-2">
                  <Battery className="size-4 text-amber-300" />
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="200"
                    value={batteryCapacity}
                    onChange={(e) => {
                      setBatteryCapacity(e.target.value);
                      setSelectedPreset('Custom');
                      setCustomDurationMins(null);
                    }}
                    className="w-full bg-transparent text-sm font-semibold text-bone outline-none"
                    placeholder="e.g. 40.5"
                  />
                  <span className="text-xs text-neutral-500">kWh</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Charger Power (kW) *
                </label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-surface/50 px-3 py-2">
                  <Zap className="size-4 text-amber-300" />
                  <input
                    type="number"
                    step="1"
                    min="3"
                    max="350"
                    value={chargerPower}
                    onChange={(e) => {
                      setChargerPower(e.target.value);
                      setCustomDurationMins(null);
                    }}
                    className="w-full bg-transparent text-sm font-semibold text-bone outline-none"
                  />
                  <span className="text-xs text-neutral-500">kW</span>
                </div>
              </div>

              {/* Current Battery % (SOC) */}
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold uppercase tracking-wider text-neutral-300">Current Battery %</span>
                  <span className="font-bold text-amber-300">{currentSoc}%</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="95"
                    value={currentSoc}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setCurrentSoc(v);
                      if (v >= targetSoc) setTargetSoc(Math.min(100, v + 20));
                      setCustomDurationMins(null);
                    }}
                    className="h-2 w-full cursor-pointer accent-amber-400"
                  />
                </div>
              </div>

              {/* Target Battery % (SOC) */}
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold uppercase tracking-wider text-neutral-300">Target Battery %</span>
                  <span className="font-bold text-emerald-400">{targetSoc}%</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={Math.min(99, Number(currentSoc) + 1)}
                    max="100"
                    value={targetSoc}
                    onChange={(e) => {
                      setTargetSoc(Number(e.target.value));
                      setCustomDurationMins(null);
                    }}
                    className="h-2 w-full cursor-pointer accent-emerald-400"
                  />
                </div>
              </div>

              {/* Start Time Picker */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                    Reservation Start Time *
                  </label>
                  <span className="text-[11px] font-semibold text-emerald-400">
                    ⚡ Operating Hours: 08:00 AM – 10:00 PM
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 rounded-xl border border-line bg-surface/50 px-3 py-2">
                    <Clock className="size-4 text-amber-300" />
                    <input
                      type="time"
                      min={date === toISODate() ? (new Date().getHours() < 8 ? '08:00' : `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`) : '08:00'}
                      max="21:30"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        setCustomDurationMins(null);
                      }}
                      className="bg-transparent text-sm font-semibold text-bone outline-none"
                    />
                  </div>
                  <span className="text-xs text-neutral-400">
                    Charger will be locked for you starting at {time12(startTime)}
                  </span>
                </div>
              </div>
            </div>

            {/* Error state */}
            {estimateError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                <AlertCircle className="size-4 shrink-0" /> {estimateError}
              </div>
            )}

            {/* Past / Operating Hours Conflict Alert */}
            {estimate && !estimate.is_available && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/15 p-3.5 text-xs text-rose-300">
                <AlertCircle className="size-4 shrink-0 text-rose-400" />
                <span><b>Time Slot Unavailable:</b> {estimate.conflict_reason}</span>
              </div>
            )}

            {/* Estimation Results Panel */}
            {estimate && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 rounded-2xl border border-line/80 bg-surface/60 p-5 space-y-4"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-line bg-hover p-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      Energy Needed
                    </div>
                    <div className="mt-1 font-display text-xl font-bold text-bone">
                      {estimate.energy_required_kwh} <span className="text-xs font-normal text-neutral-400">kWh</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-line bg-hover p-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      Est. Duration
                    </div>
                    <div className="mt-1 font-display text-xl font-bold text-amber-300">
                      {estimate.duration_label}
                    </div>
                  </div>

                  <div className="rounded-xl border border-line bg-hover p-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      Total Est. Cost
                    </div>
                    <div className="mt-1 font-display text-xl font-bold text-bone">
                      {inr(estimate.total_estimated_cost)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                      Complete Payment
                    </div>
                    <div className="mt-1 font-display text-xl font-bold text-amber-300">
                      {inr(estimate.total_estimated_cost)}
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      100% Online
                    </div>
                  </div>
                </div>

                {/* Duration Adjustment Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3">
                  <div>
                    <span className="text-xs font-semibold text-bone">Adjust Session Duration:</span>
                    <span className="ml-2 text-xs text-neutral-400">
                      Lock {time12(estimate.start_time)} – {time12(estimate.end_time)} ({estimate.duration_label})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => adjustDuration(-15)}
                      disabled={estimate.duration_minutes <= 15}
                    >
                      <Minus className="size-3" /> 15m
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => adjustDuration(-5)}
                      disabled={estimate.duration_minutes <= 15}
                    >
                      <Minus className="size-3" /> 5m
                    </Button>
                    {customDurationMins && (
                      <Button size="sm" variant="ghost" onClick={resetDuration}>
                        <RotateCcw className="size-3" /> Reset
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => adjustDuration(15)}>
                      <Plus className="size-3" /> 15m
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => adjustDuration(30)}>
                      <Plus className="size-3" /> 30m
                    </Button>
                  </div>
                </div>

                {/* Availability / Conflict Status Alert */}
                {estimate.is_available ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                    <div>
                      <span className="font-semibold text-bone">Slot Available! </span>
                      No conflict on {dateShort(estimate.booking_date)} between {time12(estimate.start_time)} and{' '}
                      {time12(estimate.end_time)}.
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <ShieldAlert className="size-4 shrink-0 text-rose-400 mt-0.5" />
                    <div>
                      <span className="font-semibold text-bone">Slot Conflict Detected: </span>
                      {estimate.conflict_reason}
                    </div>
                  </div>
                )}

                {/* Disclaimer */}
                <p className="text-[11px] leading-relaxed text-neutral-500 italic">
                  * {estimate.disclaimer}
                </p>
              </motion.div>
            )}
          </Card>

          {/* About Station */}
          <Card className="p-6">
            <h2 className="mb-4 text-xl uppercase">About this station</h2>
            <p className="text-sm leading-relaxed text-neutral-400">{s.description || 'No description provided.'}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Info icon={BatteryCharging} label="Charger" value={s.charger_type || 'Fast DC'} />
              <Info icon={Phone} label="Contact" value={s.phone || '—'} />
              <Info icon={User} label="Operator" value={s.owner_name} />
            </div>
            {hasCoords && (
              <ErrorBoundary fallback={() => null}>
                <LiveMap
                  className="mt-6 h-56"
                  points={[{ id: s.id, lat: Number(s.latitude), lng: Number(s.longitude), tone: 'mint' }]}
                />
              </ErrorBoundary>
            )}
          </Card>

          {/* Reviews */}
          <Card className="p-6">
            <h2 className="mb-6 flex items-center gap-2.5 text-xl uppercase">
              <MessageSquareText className="size-5 text-amber-300" /> Driver reviews
            </h2>
            {reviews.loading ? (
              <Spinner />
            ) : reviewList.length === 0 ? (
              <p className="text-sm text-neutral-500">No reviews yet. Be the first to review after charging.</p>
            ) : (
              <ul className="space-y-4">
                {reviewList.map((r) => (
                  <li key={r.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-bone">{r.user_display}</span>
                      <RatingStars value={r.rating} />
                    </div>
                    {r.comment && <p className="mt-1.5 text-sm text-neutral-400">{r.comment}</p>}
                    <p className="mt-1 text-[11px] text-neutral-600">{dateTimeLong(r.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ── Right Column: Sticky Checkout Summary ───────────────────── */}
        <div>
          <Card className="sticky top-24 overflow-hidden p-0 border-amber-500/30">
            <div className="border-b border-line bg-gradient-to-br from-amber-500/15 to-transparent p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Station Unit Tariff</p>
              <p className="mt-1 font-display text-4xl font-semibold text-bone">
                ₹{effectiveTariff}
                <span className="text-base text-neutral-500"> /kWh</span>
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                {s.power_kw ? `${s.power_kw} kW Fast Charger` : 'Standard EV Point'} · {s.total_slots} bays
              </p>
            </div>

            <div className="p-6">
              <AnimatePresence mode="wait">
                {estimate ? (
                  <motion.div
                    key="est"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                        Reserved Charging Window
                      </p>
                      <p className="mt-1 text-lg font-semibold text-bone">{dateShort(estimate.booking_date)}</p>
                      <p className="mt-0.5 text-sm font-semibold text-amber-300">
                        {time12(estimate.start_time)} – {time12(estimate.end_time)} ({estimate.duration_label})
                      </p>
                    </div>

                    <div className="space-y-2 rounded-xl border border-line bg-surface/50 p-3.5 text-xs">
                      <div className="flex justify-between text-neutral-400">
                        <span>Selected Bay</span>
                        <span className="font-bold text-amber-300">⚡ Bay #{selectedBay}</span>
                      </div>
                      <div className="flex justify-between text-neutral-400">
                        <span>Energy to Add</span>
                        <span className="font-semibold text-bone">{estimate.energy_required_kwh} kWh</span>
                      </div>
                      <div className="flex justify-between text-neutral-400">
                        <span>Battery SOC</span>
                        <span className="font-semibold text-bone">
                          {estimate.current_soc}% → {estimate.target_soc}%
                        </span>
                      </div>
                      <div className="flex justify-between text-neutral-400">
                        <span>Effective Power</span>
                        <span className="font-semibold text-bone">{estimate.effective_charging_power_kw} kW</span>
                      </div>
                      <div className="flex justify-between border-t border-line/60 pt-2 text-neutral-400">
                        <span>Total Estimated Cost</span>
                        <span className="font-semibold text-bone">{inr(estimate.total_estimated_cost)}</span>
                      </div>

                      <div className="flex justify-between rounded-lg bg-amber-500/10 px-2 py-1.5 font-bold text-amber-300">
                        <span>Total Payable</span>
                        <span>{inr(estimate.total_estimated_cost)}</span>
                      </div>
                    </div>

                    {!estimate.is_available && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                        {estimate.conflict_reason}
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.p
                    key="none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-neutral-400"
                  >
                    Configure your vehicle battery and start time above to compute energy and unlock reservation.
                  </motion.p>
                )}
              </AnimatePresence>

              <Button
                block
                size="lg"
                className="mt-6"
                disabled={!estimate || !estimate.is_available || estimating}
                onClick={proceed}
              >
                {estimating
                  ? 'Calculating…'
                  : estimate?.is_available
                    ? `Pay Total · ${inr(estimate.total_estimated_cost)}`
                    : 'Select Available Time'}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-line bg-hover p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-bone">{value}</div>
    </div>
  );
}
