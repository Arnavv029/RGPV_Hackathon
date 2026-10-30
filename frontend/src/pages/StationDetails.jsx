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
import { addDays, dateShort, dateTimeLong, inr, time12, toISODate } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { AvailabilityPill, RatingStars, stationImage } from '@/components/station/StationCard';
import LiveMap from '@/components/map/LiveMap';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/Feedback';

export const PENDING_BOOKING_KEY = 'hev_booking_pending';

export default function StationDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [date, setDate] = useState(toISODate());
  const [selected, setSelected] = useState(null);

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

  const proceed = () => {
    if (!selectedSlot) return;
    sessionStorage.setItem(
      PENDING_BOOKING_KEY,
      JSON.stringify({
        slotId: selectedSlot.id,
        stationId: s.id,
        stationName: s.name,
        stationLocation: s.location_text,
        slotDate: selectedSlot.date,
        slotStart: selectedSlot.start_time,
        slotEnd: selectedSlot.end_time,
        pricePerHour: rate,
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
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Selected slot</p>
                    <p className="mt-2 text-lg font-semibold text-bone">
                      {dateShort(selectedSlot.date)} · {time12(selectedSlot.start_time)} – {time12(selectedSlot.end_time)}
                    </p>
                    {selectedSlot.dynamic_price?.explanation && (
                      <div className="mt-4 flex gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-xs leading-relaxed text-neutral-300">
                        <BrainCircuit className="mt-0.5 size-4 shrink-0 text-sky-300" />
                        {selectedSlot.dynamic_price.explanation}
                      </div>
                    )}
                    <div className="mt-4 flex items-baseline justify-between">
                      <span className="text-sm text-neutral-400">Live rate</span>
                      <span className="font-display text-2xl font-semibold text-amber-300">{inr(rate)}/hr</span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-neutral-400">
                    Pick a time slot to see its live price and continue to checkout.
                  </motion.p>
                )}
              </AnimatePresence>

              <Button block size="lg" className="mt-6" disabled={!selectedSlot} onClick={proceed}>
                Continue to checkout <ArrowRight className="size-4" />
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
