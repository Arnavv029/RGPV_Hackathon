import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  BrainCircuit,
  CalendarDays,
  Clock,
  MapPin,
  MessageSquareText,
  Navigation,
  Phone,
  Sparkles,
  User,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { endpoints } from '@/lib/api';
import { openDirections } from '@/lib/maps';
import {
  addDays,
  addHoursToTime,
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
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/Feedback';

export const PENDING_BOOKING_KEY = 'hev_booking_pending';

const DURATION_OPTIONS = [
  { value: 0.5, label: '30 min', sub: '0.5 hr' },
  { value: 1.0, label: '1 hour', sub: 'Standard' },
  { value: 1.5, label: '1.5 hrs', sub: '1h 30m' },
  { value: 2.0, label: '2 hours', sub: '2.0 hrs' },
  { value: 2.5, label: '2.5 hrs', sub: '2h 30m' },
  { value: 3.0, label: '3 hours', sub: '3.0 hrs' },
];

export default function StationDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [date, setDate] = useState(toISODate());
  const [selected, setSelected] = useState(null);
  const [duration, setDuration] = useState(1.0);

  const station = useAsync(() => endpoints.station(id), [id]);
  const reviews = useAsync(() => endpoints.stationReviews(id, { limit: 20 }), [id]);
  const slots = useAsync(() => endpoints.stationSlots(id, date), [id, date]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)), []);

  if (station.error) return <ErrorState error={station.error} onRetry={station.reload} />;
  if (station.loading || !station.data) return <Spinner label="Loading station…" />;

  const s = station.data;
  const slotList = Array.isArray(slots.data) ? slots.data : slots.data?.slots || [];
  const reviewList = reviews.data?.reviews || [];
  const selectedSlot = slotList.find((x) => x.id === selected);
  const rate = selectedSlot?.dynamic_price?.hourly_rate ?? s.price_per_hour;

  const targetEndTime = useMemo(() => {
    if (!selectedSlot) return null;
    return addHoursToTime(selectedSlot.start_time, duration);
  }, [selectedSlot, duration]);

  const totalAmount = useMemo(() => {
    return Number(rate || 0) * duration;
  }, [rate, duration]);

  const isDurationAllowed = (d) => {
    if (!selectedSlot) return true;
    if (d <= 1.0) return true;
    const [sh, sm] = selectedSlot.start_time.split(':').map(Number);
    const endTotalMins = sh * 60 + (sm || 0) + Math.round(d * 60);
    const [origH, origM] = selectedSlot.end_time.split(':').map(Number);
    const origEndMins = origH * 60 + (origM || 0);

    const hasConflict = slotList.some((s) => {
      if (s.id === selectedSlot.id) return false;
      const [h, m] = s.start_time.split(':').map(Number);
      const slotStartMins = h * 60 + (m || 0);
      if (slotStartMins >= origEndMins && slotStartMins < endTotalMins) {
        return s.is_full || !s.is_available;
      }
      return false;
    });
    return !hasConflict;
  };

  const proceed = () => {
    if (!selectedSlot) return;
    const computedEnd = addHoursToTime(selectedSlot.start_time, duration);
    sessionStorage.setItem(
      PENDING_BOOKING_KEY,
      JSON.stringify({
        slotId: selectedSlot.id,
        durationHours: duration,
        stationId: s.id,
        stationName: s.name,
        stationLocation: s.location_text,
        slotDate: selectedSlot.date,
        slotStart: selectedSlot.start_time,
        slotEnd: computedEnd,
        pricePerHour: rate,
        totalAmount: totalAmount,
        basePrice: selectedSlot.dynamic_price?.base_rate ?? s.price_per_hour,
        priceExplanation: selectedSlot.dynamic_price?.explanation || '',
        imageUrl: stationImage(s),
      }),
    );
    navigate('/app/book');
  };

  const hasCoords = Number.isFinite(Number(s.latitude)) && s.latitude !== null;

  return (
    <div>
      <Link to="/app" className="mb-5 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-bone">
        <ArrowLeft className="size-4" /> All stations
      </Link>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative mb-10 h-80 overflow-hidden rounded-[32px] border border-line sm:h-[26rem]"
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
              <AvailabilityPill count={s.available_slots} />
              {s.is_priority && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-400/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-950 shadow-md backdrop-blur-md">
                  <Sparkles className="size-3 fill-ink-950" /> Priority Verified Partner
                </span>
              )}
            </div>
            <h1 className="display-xl mt-3 text-[clamp(2rem,4vw,3.4rem)] !text-white">{s.name}</h1>
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

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* ── Left column ──────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Slot picker */}
          <Card className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2.5 text-xl uppercase">
                <CalendarDays className="size-5 text-amber-300" /> Pick a slot
              </h2>
              <span className="text-xs text-neutral-500">Prices shown are live AI rates</span>
            </div>

            <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
              {days.map((d) => {
                const iso = toISODate(d);
                const active = iso === date;
                return (
                  <button
                    key={iso}
                    onClick={() => {
                      setDate(iso);
                      setSelected(null);
                    }}
                    className={`relative flex min-w-16 flex-col items-center rounded-xl border px-3 py-2.5 transition ${
                      active ? 'border-amber-400/60 text-on-accent' : 'border-line text-neutral-400 hover:border-line-2 hover:text-bone'
                    }`}
                  >
                    {active && (
                      <motion.span layoutId="day-pill" className="absolute inset-0 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500" />
                    )}
                    <span className="relative text-[10px] font-semibold uppercase tracking-wider">
                      {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                    </span>
                    <span className="relative font-display text-lg font-semibold">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>

            {slots.loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : slots.error ? (
              <ErrorState error={slots.error} onRetry={slots.reload} />
            ) : slotList.length === 0 ? (
              <EmptyState icon={Clock} title="No slots on this day" description="The owner hasn't opened slots for this date yet. Try another day." />
            ) : (
              <motion.div
                className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.03 } } }}
              >
                {slotList.map((slot) => {
                  const disabled = slot.is_full || !slot.is_available;
                  const active = selected === slot.id;
                  const price = slot.dynamic_price?.hourly_rate;
                  const base = slot.dynamic_price?.base_rate;
                  const surge = price && base ? Math.round(((price - base) / base) * 100) : 0;
                  return (
                    <motion.button
                      key={slot.id}
                      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                      whileTap={{ scale: 0.96 }}
                      disabled={disabled}
                      onClick={() => setSelected(slot.id)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        disabled
                          ? 'cursor-not-allowed border-line opacity-40'
                          : active
                            ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_0_4px_rgba(18,210,181,0.1)]'
                            : 'border-line hover:border-amber-400/40 hover:bg-hover'
                      }`}
                    >
                      <div className="text-sm font-semibold text-bone">
                        {time12(slot.start_time)} – {time12(slot.end_time)}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs">
                        <span className={disabled ? 'text-neutral-500' : 'text-neutral-400'}>
                          {disabled ? 'Full' : `${slot.available_spots} left`}
                        </span>
                        {price != null && (
                          <span className={surge > 0 ? 'text-amber-300' : surge < 0 ? 'text-amber-300' : 'text-neutral-300'}>
                            {inr(price)}/hr
                          </span>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}

            {selectedSlot && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.3 }}
                className="mt-6 border-t border-line/70 pt-6"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-300">
                      <Clock className="size-4" /> How much time do you need?
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Lock your custom charging interval starting from {time12(selectedSlot.start_time)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-amber-300">
                    Live Rate: {inr(rate)}/hr
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                  {DURATION_OPTIONS.map((opt) => {
                    const active = duration === opt.value;
                    const allowed = isDurationAllowed(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={!allowed}
                        onClick={() => setDuration(opt.value)}
                        className={`group relative flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                          !allowed
                            ? 'cursor-not-allowed border-line/40 opacity-30'
                            : active
                              ? 'border-amber-400 bg-amber-400/20 text-bone shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                              : 'border-line bg-surface/40 text-neutral-300 hover:border-amber-400/40 hover:bg-hover'
                        }`}
                      >
                        <span className="text-xs font-bold">{opt.label}</span>
                        <span className="mt-0.5 text-[10px] text-neutral-400 group-hover:text-neutral-300">
                          {opt.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.05] p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-amber-400/20 text-amber-300 text-xs">
                      ⚡
                    </span>
                    <div>
                      <div className="font-semibold text-bone">
                        Locked Interval: {time12(selectedSlot.start_time)} – {time12(targetEndTime)} ({formatDuration(duration)})
                      </div>
                      {duration === 1.5 && (
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          The subsequent remainder window ({time12(targetEndTime)} – {time12(addHoursToTime(selectedSlot.start_time, 2.0))}) will automatically open for other users.
                        </p>
                      )}
                      {duration === 0.5 && (
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          The remaining 30-min window ({time12(targetEndTime)} – {time12(selectedSlot.end_time)}) will stay open for other drivers.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right sm:shrink-0">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400">Est. Total: </span>
                    <span className="font-display text-base font-bold text-amber-300">{inr(totalAmount)}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </Card>

          {/* About */}
          <Card className="p-6">
            <h2 className="mb-5 text-xl uppercase">About this station</h2>
            <p className="text-sm leading-relaxed text-neutral-400">{s.description || 'No description provided yet.'}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Info icon={BatteryCharging} label="Charger" value={s.charger_type || 'Standard'} />
              <Info icon={Phone} label="Contact" value={s.phone || '—'} />
              <Info icon={User} label="Operator" value={s.owner_name} />
            </div>
            {hasCoords && (
              <LiveMap
                className="mt-6 h-56"
                points={[{ id: s.id, lat: Number(s.latitude), lng: Number(s.longitude), tone: 'mint' }]}
              />
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
              <p className="text-sm text-neutral-500">No reviews yet. Charge here and write the first one.</p>
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

        {/* ── Right: sticky booking summary ─────────────────────────────── */}
        <div>
          <Card className="sticky top-24 overflow-hidden p-0">
            <div className="border-b border-line bg-gradient-to-br from-amber-500/15 to-transparent p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Base rate</p>
              <p className="mt-1 font-display text-4xl font-semibold text-bone">
                {s.price_per_hour ? inr(s.price_per_hour) : 'Free'}
                {s.price_per_hour && <span className="text-base text-neutral-500"> /hr</span>}
              </p>
            </div>
            <div className="p-6">
              <AnimatePresence mode="wait">
                {selectedSlot ? (
                  <motion.div key="sel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Selected Reservation</p>
                    <p className="mt-2 text-lg font-semibold text-bone">
                      {dateShort(selectedSlot.date)}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-amber-300">
                      {time12(selectedSlot.start_time)} – {time12(targetEndTime)} ({formatDuration(duration)})
                    </p>

                    <div className="mt-4 space-y-2 rounded-xl border border-line bg-surface/50 p-3 text-xs">
                      <div className="flex justify-between text-neutral-400">
                        <span>Hourly Live Rate</span>
                        <span className="font-medium text-bone">{inr(rate)}/hr</span>
                      </div>
                      <div className="flex justify-between text-neutral-400">
                        <span>Charging Duration</span>
                        <span className="font-medium text-bone">{formatDuration(duration)}</span>
                      </div>
                      <div className="flex justify-between border-t border-line/60 pt-2 font-semibold text-bone">
                        <span>Total Payable</span>
                        <span className="font-display text-lg text-amber-300">{inr(totalAmount)}</span>
                      </div>
                    </div>

                    {selectedSlot.dynamic_price?.explanation && (
                      <div className="mt-4 flex gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-xs leading-relaxed text-neutral-300">
                        <BrainCircuit className="mt-0.5 size-4 shrink-0 text-sky-300" />
                        {selectedSlot.dynamic_price.explanation}
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-neutral-400">
                    Pick a time slot and choose how much time you need to continue to checkout.
                  </motion.p>
                )}
              </AnimatePresence>

              <Button block size="lg" className="mt-6" disabled={!selectedSlot} onClick={proceed}>
                {selectedSlot ? `Continue to checkout · ${inr(totalAmount)}` : 'Continue to checkout'} <ArrowRight className="size-4" />
              </Button>
              <p className="mt-3 text-center text-[11px] text-neutral-500">Free cancellation up to 30 min before your slot</p>
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
