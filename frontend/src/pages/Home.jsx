import { AnimatePresence, motion } from 'framer-motion';
import {
  Crosshair,
  LayoutGrid,
  Map as MapIcon,
  MapPinned,
  Route,
  Search,
  SlidersHorizontal,
  Star,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { endpoints } from '@/lib/api';
import { fullName, inr } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useAuth } from '@/hooks/useAuth';
import LiveMap from '@/components/map/LiveMap';
import StationCard from '@/components/station/StationCard';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import Button from '@/components/ui/Button';

const SORTS = [
  { value: 'distance', label: 'Nearest' },
  { value: 'rating', label: 'Top rated' },
];

/**
 * Trip-range presets. The long options matter: a driver planning a highway run
 * wants to reserve a slot at the far end of today's range, not next door.
 */
const RANGES = [5, 10, 25, 50, 100, 200];
const MAX_RANGE = 200;

// Map auto-zoom: frame the driver plus their closest chargers instead of the whole city.
const NEARBY_KM = 10;
const NEARBY_MAX = 5;
const NEARBY_MIN = 3;

/** Lat/lng box around a point, used to frame the selected search radius. */
function radiusBox({ lat, lng }, km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [
    [lat - dLat, lng - dLng],
    [lat + dLat, lng + dLng],
  ];
}

/**
 * What the map should frame:
 *  - no location yet          → every listed station (default behaviour)
 *  - a search range is chosen → the whole range circle
 *  - otherwise                → the driver + up to 5 stations within 10 km;
 *                               if fewer than 3 are that close, the 3 nearest
 *                               wherever they are, so something is always visible.
 */
function mapFocus(coords, stations, range) {
  if (!coords) return null;
  if (range) return radiusBox(coords, range);
  const byDistance = stations
    .filter((s) => s.distance != null && Number.isFinite(Number(s.latitude)))
    .sort((a, b) => Number(a.distance) - Number(b.distance));
  const near = byDistance.filter((s) => Number(s.distance) <= NEARBY_KM).slice(0, NEARBY_MAX);
  const picked = near.length >= NEARBY_MIN ? near : byDistance.slice(0, NEARBY_MIN);
  return [[coords.lat, coords.lng], ...picked.map((s) => [Number(s.latitude), Number(s.longitude)])];
}

export default function Home() {
  const { user } = useAuth();
  const { coords, status: geoStatus, locate } = useGeolocation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('distance');
  const [minRating, setMinRating] = useState(0);
  const [openOnly, setOpenOnly] = useState(false);
  const [range, setRange] = useState(null); // km, or null for "anywhere"
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState('split');

  const { data, loading, error, reload } = useAsync(
    () =>
      endpoints.stations({
        lat: coords?.lat,
        lng: coords?.lng,
        sort: sort === 'rating' ? 'rating' : undefined,
        min_rating: minRating || undefined,
      }),
    [coords?.lat, coords?.lng, sort, minRating],
  );

  const all = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const stations = useMemo(() => {
    let list = [...all];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        [s.name, s.location_text, s.charger_type].some((f) => f?.toLowerCase().includes(q)),
      );
    }
    if (openOnly) list = list.filter((s) => Number(s.available_slots) > 0);
    // Range only means something once we know where the driver is.
    if (range && coords) {
      list = list.filter((s) => s.distance != null && Number(s.distance) <= range);
    }
    return list;
  }, [all, query, openOnly, range, coords]);

  const points = stations.map((s) => ({
    id: s.id,
    lat: Number(s.latitude),
    lng: Number(s.longitude),
    tone: Number(s.available_slots) > 0 ? 'mint' : 'muted',
    popup: (
      <div className="min-w-48">
        <div className="text-[15px] font-bold text-zinc-900">{s.name}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{s.location_text}</div>
        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span className={Number(s.available_slots) > 0 ? 'font-semibold text-emerald-600' : 'text-zinc-400'}>
            {Number(s.available_slots) > 0 ? `${s.available_slots} slots today` : 'Full today'}
          </span>
          <span className="font-bold text-zinc-900">{s.price_per_hour ? `${inr(s.price_per_hour)}/hr` : 'Free'}</span>
        </div>
        <Link
          to={`/app/stations/${s.id}`}
          className="mt-3 block rounded-lg bg-zinc-900 py-2 text-center text-xs font-bold !text-white hover:bg-zinc-800"
        >
          View & book →
        </Link>
      </div>
    ),
  }));

  const focus = useMemo(() => mapFocus(coords, stations, range), [coords, stations, range]);

  const openCount = stations.filter((s) => Number(s.available_slots) > 0).length;
  const cheapest = stations
    .map((s) => Number(s.price_per_hour))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)[0];

  const filtersOn = query || minRating || openOnly || range;
  const clearFilters = () => {
    setQuery('');
    setMinRating(0);
    setOpenOnly(false);
    setRange(null);
  };

  return (
    <div>
      {/* ── Masthead ──────────────────────────────────────────────────────── */}
      <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-sm text-neutral-500">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-400/15 text-xs">
                ⚡
              </span>
              Hi {fullName(user).split(' ')[0]} — here's what's live in Bhopal
            </p>
            <h1 className="display-xl mt-3 text-[clamp(2.2rem,4.5vw,3.6rem)]">
              Find a charger <span className="text-gradient">near you</span>
            </h1>
          </div>

          {/* Live counters double as an at-a-glance status of the network */}
          <div className="flex gap-3">
            {[
              { label: 'Stations', value: loading ? '—' : stations.length, icon: MapPinned },
              { label: 'Open today', value: loading ? '—' : openCount, icon: Zap },
              { label: 'From', value: loading || !cheapest ? '—' : `${inr(cheapest)}/hr`, icon: Route },
            ].map((s) => (
              <div key={s.label} className="glass rounded-2xl px-4 py-3">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                  <s.icon className="size-3" /> {s.label}
                </div>
                <div className="mt-1 font-display text-xl font-bold text-bone">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {geoStatus === 'denied' && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 text-xs text-amber-300">
            Location is off — turn it on for distances and range filtering.
          </p>
        )}
      </motion.header>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="glass sticky top-[5.5rem] z-[400] mb-8 rounded-3xl p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by station, area or connector…"
              className="h-11 w-full rounded-full border border-line bg-ink-900 pl-11 pr-4 text-sm text-bone placeholder:text-neutral-600 focus:border-amber-400/60 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-line bg-ink-900 p-1">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSort(s.value)}
                  className={`relative rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    sort === s.value ? 'text-on-accent' : 'text-neutral-400 hover:text-bone'
                  }`}
                >
                  {sort === s.value && <motion.span layoutId="sort-pill" className="absolute inset-0 rounded-full bg-amber-400" />}
                  <span className="relative">{s.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setMinRating((r) => (r >= 4 ? 0 : r + 1 < 3 ? 3 : r + 1))}
              className={`flex h-10 items-center gap-1.5 rounded-full border px-4 text-[11px] font-bold uppercase tracking-wider transition ${
                minRating ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-line text-neutral-400 hover:text-bone'
              }`}
            >
              <Star className="size-3.5" /> {minRating ? `${minRating}+ stars` : 'Any rating'}
            </button>

            <button
              onClick={() => setOpenOnly((v) => !v)}
              className={`flex h-10 items-center gap-1.5 rounded-full border px-4 text-[11px] font-bold uppercase tracking-wider transition ${
                openOnly ? 'border-mint-500/40 bg-mint-500/10 text-mint-300' : 'border-line text-neutral-400 hover:text-bone'
              }`}
            >
              <span className={`size-1.5 rounded-full ${openOnly ? 'bg-mint-400' : 'bg-neutral-600'}`} /> Open now
            </button>

            <Button variant="secondary" size="sm" onClick={locate} loading={geoStatus === 'locating'} aria-label="Use my location">
              <Crosshair className="size-4" />
            </Button>

            <div className="flex rounded-full border border-line p-1 lg:hidden">
              <button onClick={() => setView('split')} className={`rounded-full p-2 ${view === 'split' ? 'bg-hover-2 text-bone' : 'text-neutral-500'}`} aria-label="Map view">
                <MapIcon className="size-4" />
              </button>
              <button onClick={() => setView('grid')} className={`rounded-full p-2 ${view === 'grid' ? 'bg-hover-2 text-bone' : 'text-neutral-500'}`} aria-label="List view">
                <LayoutGrid className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Trip range ────────────────────────────────────────────────────
            Planning a long drive? Set how far ahead you want to look and book
            a slot at the far end of the trip, not just around the corner. */}
        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-hover px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            <SlidersHorizontal className="size-3.5 text-amber-300" />
            Search within
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-2">
            <button
              onClick={() => setRange(null)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                range === null ? 'border-amber-400 bg-amber-400 text-on-accent' : 'border-line text-neutral-400 hover:text-bone'
              }`}
            >
              Anywhere
            </button>
            {RANGES.map((km) => (
              <button
                key={km}
                onClick={() => setRange(km)}
                disabled={!coords}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-40 ${
                  range === km ? 'border-amber-400 bg-amber-400 text-on-accent' : 'border-line text-neutral-400 hover:text-bone'
                }`}
              >
                {km} km
              </button>
            ))}

            <div className="flex min-w-48 flex-1 items-center gap-3 sm:ml-2">
              <input
                type="range"
                min="1"
                max={MAX_RANGE}
                step="1"
                value={range ?? MAX_RANGE}
                disabled={!coords}
                onChange={(e) => setRange(Number(e.target.value))}
                aria-label="Search radius in kilometres"
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-amber-400 disabled:opacity-40"
              />
              <span className="w-16 shrink-0 text-right font-display text-sm font-bold text-bone">
                {range ? `${range} km` : 'Any'}
              </span>
            </div>
          </div>
        </div>

        {!coords && (
          <p className="mt-2 px-4 text-[11px] text-neutral-500">
            Share your location to filter by distance — we use it only to sort and measure, never to track you.
          </p>
        )}
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className={`${view === 'grid' ? 'hidden lg:block' : ''} lg:sticky lg:top-[14rem] lg:h-[calc(100vh-16rem)]`}>
            <LiveMap
              points={points}
              user={coords}
              activeId={activeId}
              onSelect={setActiveId}
              radiusKm={range && coords ? range : null}
              focus={focus}
              className="h-[360px] lg:h-full"
            />
          </div>

          <div>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-80" />
                ))}
              </div>
            ) : stations.length === 0 ? (
              <EmptyState
                icon={MapPinned}
                title={range ? `Nothing within ${range} km` : 'No stations match'}
                description={
                  range
                    ? 'Widen the search range, or clear your filters to see the whole Bhopal network.'
                    : 'Try clearing your search or filters to see more stations.'
                }
                action={
                  filtersOn ? (
                    <Button variant="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : null
                }
              />
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between px-1">
                  <p className="text-xs text-neutral-500">
                    Showing <span className="font-semibold text-bone">{stations.length}</span> of {all.length} stations
                    {range && coords ? ` within ${range} km` : ''}
                  </p>
                  {filtersOn && (
                    <button onClick={clearFilters} className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                      Clear
                    </button>
                  )}
                </div>

                <motion.div layout className="grid gap-4 sm:grid-cols-2">
                  <AnimatePresence>
                    {stations.map((s, i) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.04, 0.4) } }}
                        exit={{ opacity: 0, scale: 0.96 }}
                      >
                        <StationCard station={s} active={activeId === s.id} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
