import { AnimatePresence, motion } from 'framer-motion';
import {
  Award,
  BatteryWarning,
  Briefcase,
  Crosshair,
  MapPin,
  Navigation,
  Phone,
  PlugZap,
  Siren,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import { dateTimeLong, distanceLabel, inr } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { useGeolocation } from '@/hooks/useGeolocation';
import LiveMap from '@/components/map/LiveMap';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { RatingStars } from '@/components/station/StationCard';

const SOS_STATUS_COPY = {
  pending: 'Waiting for the mechanic to respond…',
  accepted: 'Accepted — the mechanic is on the way and will call you.',
  rejected: 'Declined. Please try another mechanic.',
  completed: 'Job completed.',
};

const SPECIALIZATIONS = [
  { value: '', label: 'Any issue', icon: Wrench },
  { value: 'battery', label: 'Battery', icon: BatteryWarning },
  { value: 'charger', label: 'Charger / wiring', icon: PlugZap },
  { value: 'motor', label: 'Motor', icon: Sparkles },
  { value: 'tyre', label: 'Tyre', icon: Briefcase },
  { value: 'general', label: 'General', icon: Wrench },
];

export default function Emergency() {
  const { coords, status: geoStatus, locate } = useGeolocation();
  const [tab, setTab] = useState('mechanics');
  const [spec, setSpec] = useState('');
  const [activeId, setActiveId] = useState(null);

  const mechanics = useAsync(
    () => endpoints.emergencyMechanics({ lat: coords?.lat, lng: coords?.lng, specialization: spec }),
    [coords?.lat, coords?.lng, spec],
  );
  const stations = useAsync(
    () => endpoints.emergencyStations({ lat: coords?.lat, lng: coords?.lng }),
    [coords?.lat, coords?.lng],
  );

  const sos = useAsync(() => endpoints.emergencyRequests(), []);
  const sosList = Array.isArray(sos.data) ? sos.data : [];
  const waiting = sosList.some((r) => r.status === 'pending');

  // While a request is waiting, check for the mechanic's answer every 15 s.
  useEffect(() => {
    if (!waiting) return undefined;
    const id = setInterval(() => sos.reload(), 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  const current = tab === 'mechanics' ? mechanics : stations;
  const list = Array.isArray(current.data) ? current.data : [];

  const points = list.map((item, i) => ({
    id: `${tab}-${item.id}`,
    lat: Number(item.latitude),
    lng: Number(item.longitude),
    tone: tab === 'mechanics' ? (item.is_available ? 'rose' : 'muted') : 'mint',
    label: tab === 'mechanics' ? String(i + 1) : '',
    popup: (
      <div className="min-w-44">
        <div className="text-[15px] font-bold text-zinc-900">{item.name}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{item.location_text}</div>
        {item.phone && (
          <a
            href={`tel:${item.phone}`}
            className="mt-3 block rounded-lg bg-rose-600 py-2 text-center text-xs font-bold !text-bone hover:bg-rose-500"
          >
            Call {item.phone}
          </a>
        )}
      </div>
    ),
  }));

  return (
    <div>
      {/* ── SOS header ─────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mb-8 overflow-hidden rounded-3xl border border-rose-500/25 bg-gradient-to-br from-rose-500/15 via-ink-900 to-ink-900 p-7 sm:p-10"
      >
        <div className="absolute -right-10 -top-10 size-64 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-5">
            <div className="relative grid size-16 shrink-0 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/30" />
              <span className="relative grid size-16 place-items-center rounded-full bg-rose-500 shadow-[0_0_40px_rgba(239,68,68,0.6)]">
                <Siren className="size-7 text-bone" />
              </span>
            </div>
            <div>
              <h1 className="display-xl text-[clamp(2rem,4vw,3.2rem)]">Roadside emergency</h1>
              <p className="mt-2 max-w-xl text-neutral-300">
                Stuck with a flat battery or a fault? We rank EV mechanics near you by distance, rating, price and
                experience. The top pick is the best overall match.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => (window.location.href = 'tel:112')}>
              <Phone className="size-4" /> Call 112
            </Button>
            <Button variant="secondary" onClick={locate} loading={geoStatus === 'locating'}>
              <Crosshair className="size-4" /> {coords ? 'Refresh location' : 'Use my location'}
            </Button>
          </div>
        </div>
      </motion.section>

      {sosList.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
            <Siren className="size-4 text-rose-300" /> Your help requests
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {sosList.slice(0, 4).map((r) => (
              <li key={r.id} className="glass flex items-start justify-between gap-3 rounded-2xl p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-bone">{r.mechanic_name || 'Mechanic'}</span>
                    <Badge status={r.status} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">{SOS_STATUS_COPY[r.status]}</p>
                  <p className="mt-1 text-[11px] text-neutral-600">{dateTimeLong(r.created_at)}</p>
                </div>
                {r.status === 'accepted' && r.mechanic_phone && (
                  <a
                    href={`tel:${r.mechanic_phone}`}
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-500 text-bone hover:bg-rose-400"
                    aria-label={`Call ${r.mechanic_name}`}
                  >
                    <Phone className="size-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-line bg-ink-900/60 p-1">
          {[
            { key: 'mechanics', label: 'Mechanics', icon: Wrench },
            { key: 'stations', label: 'Emergency charging', icon: PlugZap },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setActiveId(null);
              }}
              className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
                tab === t.key ? 'text-bone' : 'text-neutral-400 hover:text-bone'
              }`}
            >
              {tab === t.key && <motion.span layoutId="sos-tab" className="absolute inset-0 rounded-lg bg-hover-2" />}
              <t.icon className="relative size-4" /> <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
        {geoStatus === 'denied' && (
          <p className="text-xs text-amber-300">Location access is off, so distances aren't available.</p>
        )}
      </div>

      <AnimatePresence>
        {tab === 'mechanics' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 flex flex-wrap gap-2"
          >
            {SPECIALIZATIONS.map((s) => (
              <button
                key={s.value || 'any'}
                onClick={() => setSpec(s.value)}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  spec === s.value
                    ? 'border-rose-500/50 bg-rose-500/15 text-rose-300'
                    : 'border-line text-neutral-400 hover:text-bone'
                }`}
              >
                <s.icon className="size-3.5" /> {s.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-3">
          {current.error ? (
            <ErrorState error={current.error} onRetry={current.reload} />
          ) : current.loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)
          ) : list.length === 0 ? (
            <EmptyState icon={Wrench} title="Nobody matches" description="Try another issue type or widen your search." />
          ) : tab === 'mechanics' ? (
            list.map((m, i) => (
              <MechanicCard
                key={m.id}
                mechanic={m}
                rank={i + 1}
                active={activeId === `mechanics-${m.id}`}
                coords={coords}
                openRequest={sosList.find((r) => r.mechanic === m.id && ['pending', 'accepted'].includes(r.status))}
                onSent={sos.reload}
              />
            ))
          ) : (
            list.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                className="glass flex items-center justify-between gap-4 rounded-2xl p-4"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-bone">{s.name}</h3>
                  <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                    <MapPin className="size-3" /> {s.location_text}
                    {distanceLabel(s.distance) && <span className="text-amber-300"> · {distanceLabel(s.distance)}</span>}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {s.available_slots} open slots today · {s.charger_type || 'Standard charger'}
                  </p>
                </div>
                <Button size="sm" variant="secondary" to={`/app/stations/${s.id}`}>
                  Book
                </Button>
              </motion.div>
            ))
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
          <LiveMap points={points} user={coords} activeId={activeId} onSelect={setActiveId} radiusKm={coords ? 10 : null} className="h-[380px] lg:h-full" />
        </div>
      </div>
    </div>
  );
}

function MechanicCard({ mechanic: m, rank, active, coords, openRequest, onSent }) {
  const { user } = useAuth();
  const best = rank === 1 && m.recommendation_reason;
  const dist = distanceLabel(m.distance);
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ phone: user?.phone || '', vehicle_number: '', message: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await endpoints.sendSos({ mechanic: m.id, ...form, latitude: coords?.lat, longitude: coords?.lng });
      toast.success(`Request sent to ${m.name}. You'll see their reply here.`);
      setAsking(false);
      onSent?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { delay: rank * 0.04 } }}
      className={`glass relative overflow-hidden rounded-2xl p-5 transition-all ${
        best ? 'border-rose-500/40 shadow-[0_20px_50px_-20px_rgba(239,68,68,0.45)]' : active ? 'border-line-2' : ''
      }`}
    >
      {best && (
        <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
          <Award className="size-4" /> Best match for you
        </div>
      )}
      <div className="flex items-start gap-4">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-xl font-display text-lg font-semibold ${
            best ? 'bg-rose-500 text-bone' : 'bg-hover text-neutral-300'
          }`}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-bone">{m.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                m.is_available ? 'bg-amber-500/15 text-amber-300' : 'bg-hover text-neutral-500'
              }`}
            >
              {m.is_available ? 'Available' : 'Busy'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-neutral-400">{m.specialization_display}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-400">
            <span className="flex items-center gap-1">
              <RatingStars value={Number(m.rating)} size="size-3" /> {Number(m.rating).toFixed(1)} ({m.review_count})
            </span>
            {dist && (
              <span className="flex items-center gap-1">
                <Navigation className="size-3" /> {dist}
              </span>
            )}
            <span>{m.experience_years} yrs exp</span>
            <span className="font-semibold text-bone">{inr(m.service_cost)} visit</span>
          </div>

          {best && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {m.recommendation_reason.map((r) => (
                <span key={r} className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
                  {r}
                </span>
              ))}
            </div>
          )}

          {m.topsis_score != null && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                <span>Match score</span>
                <span>{Math.round(m.topsis_score * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(m.topsis_score * 100)}%` }}
                  transition={{ duration: 0.9, delay: 0.2 + rank * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className={`h-full rounded-full ${best ? 'bg-gradient-to-r from-rose-500 to-amber-400' : 'bg-neutral-500'}`}
                />
              </div>
            </div>
          )}
        </div>
        {m.phone && (
          <a
            href={`tel:${m.phone}`}
            className={`grid size-11 shrink-0 place-items-center rounded-xl transition ${
              best ? 'bg-rose-500 text-bone hover:bg-rose-400' : 'border border-line text-neutral-300 hover:bg-hover'
            }`}
            aria-label={`Call ${m.name}`}
          >
            <Phone className="size-4" />
          </a>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        {openRequest ? (
          <p className="flex items-center gap-2 text-xs text-neutral-400">
            <Badge status={openRequest.status} /> {SOS_STATUS_COPY[openRequest.status]}
          </p>
        ) : asking ? (
          <form onSubmit={send} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Your phone *">
                <Input type="tel" required value={form.phone} onChange={set('phone')} placeholder="98765 43210" />
              </Field>
              <Field label="Vehicle number">
                <Input value={form.vehicle_number} onChange={set('vehicle_number')} placeholder="MP04 AB 1234" />
              </Field>
            </div>
            <Field label="What's wrong?">
              <Textarea rows={2} value={form.message} onChange={set('message')} placeholder="Battery dead near DB Mall…" />
            </Field>
            {!coords && <p className="text-[11px] text-amber-300">Turn on location so the mechanic can find you.</p>}
            <div className="flex gap-2">
              <Button type="submit" variant="danger" size="sm" loading={sending}>
                <Siren className="size-4" /> Send request
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant={best ? 'danger' : 'secondary'} disabled={!m.is_available} onClick={() => setAsking(true)}>
            <Siren className="size-4" /> {m.is_available ? 'Request help' : 'Busy right now'}
          </Button>
        )}
      </div>
    </motion.article>
  );
}

