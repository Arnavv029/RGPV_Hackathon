import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  Crown,
  Hourglass,
  IndianRupee,
  MapPin,
  Percent,
  PlusCircle,
  RefreshCw,
  ScanLine,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { endpoints } from '@/lib/api';
import { addDays, dateShort, fullName, inr, time12, toISODate } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner, StatCard } from '@/components/ui/Feedback';
import { stationImage } from '@/components/station/StationCard';

// Single-series line: amber-500 clears WCAG 3:1 against the ink-850 card surface.
const CHART_COLOR = '#e5941c';
const DAYS = 14;

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([
      endpoints.ownerStations(),
      endpoints.ownerBookings(),
      endpoints.ownerMembership().catch(() => null),
    ]),
    [],
  );

  const [stations, bookings, membershipData] = data || [[], [], null];
  const stationList = Array.isArray(stations) ? stations : [];
  const bookingList = Array.isArray(bookings) ? bookings : bookings?.results || [];
  const membership = membershipData?.membership;

  const stats = useMemo(() => {
    const earning = bookingList.filter((b) => ['confirmed', 'completed', 'pending'].includes(b.status));
    return {
      revenue: earning.reduce((s, b) => s + Number(b.amount_paid || 0), 0),
      pending: bookingList.filter((b) => b.status === 'pending').length,
      today: bookingList.filter((b) => b.slot?.date === toISODate() && b.status !== 'cancelled').length,
    };
  }, [bookingList]);

  // Revenue per day for the last two weeks, zero-filled so the x-axis is continuous.
  const series = useMemo(() => {
    const byDay = new Map();
    for (let i = DAYS - 1; i >= 0; i--) byDay.set(toISODate(addDays(new Date(), -i)), 0);
    bookingList.forEach((b) => {
      if (['cancelled', 'rejected'].includes(b.status)) return;
      const day = toISODate(new Date(b.created_at));
      if (byDay.has(day)) byDay.set(day, byDay.get(day) + Number(b.amount_paid || 0));
    });
    return [...byDay].map(([day, revenue]) => ({
      day,
      label: new Date(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      revenue,
    }));
  }, [bookingList]);

  const periodTotal = series.reduce((s, d) => s + d.revenue, 0);

  if (loading) return <Spinner label="Loading your dashboard…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Owner console"
        title={`Good to see you, ${fullName(user).split(' ')[0]}`}
        description="See what's happening across your charging network."
        actions={
          <>
            <Button variant="secondary" to="/owner/scanner">
              <ScanLine className="size-4" /> Scan QR
            </Button>
            <Button to="/owner/stations/new">
              <PlusCircle className="size-4" /> Add station
            </Button>
          </>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={Building2} label="Stations" value={stationList.length} />
        <StatCard icon={Hourglass} label="Awaiting approval" value={stats.pending} accent="flare" delay={0.05} />
        <StatCard icon={CalendarCheck} label="Sessions today" value={stats.today} accent="beam" delay={0.1} />
        <StatCard icon={IndianRupee} label="Gross bookings" value={inr(stats.revenue)} delay={0.15} />
      </div>

      {/* Membership & Quota Widget */}
      {membership && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-ink-900 via-ink-850 to-ink-900 p-5 shadow-lg"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-300">
                <Crown className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-bone">
                    {membership.plan_display || 'Membership Pack'}
                  </h3>
                  {membership.is_priority ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                      <Sparkles className="size-3" /> Priority Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      <Percent className="size-3" /> 5% Commission
                    </span>
                  )}
                  {membership.is_autopay_enabled && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-300">
                      <RefreshCw className="size-2.5 text-amber-400" /> Autopay ON
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  <b className="text-bone">{membership.bookings_remaining}</b> bookings quota remaining of{' '}
                  {membership.total_bookings_credited} credited ·{' '}
                  {membership.bookings_remaining > 0
                    ? '0% platform commission on bookings'
                    : '5% platform commission on bookings (Free Plan)'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Button size="sm" variant="secondary" to="/owner/membership">
                Manage Plans & Autopay <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {stats.pending > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Link
            to="/owner/requests"
            className="group mb-8 flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 transition hover:bg-amber-500/15"
          >
            <span className="flex items-center gap-3 text-sm">
              <Hourglass className="size-5 text-amber-300" />
              <span>
                <b className="text-bone">{stats.pending} booking{stats.pending > 1 ? 's' : ''}</b>{' '}
                <span className="text-neutral-300">waiting for your approval</span>
              </span>
            </span>
            <ArrowRight className="size-4 text-amber-300 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* Revenue chart */}
        <Card className="p-6">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-base font-semibold">Booking revenue, last {DAYS} days</h2>
              <p className="mt-1 font-display text-3xl font-semibold text-bone">{inr(periodTotal)}</p>
            </div>
          </div>
          <div className="relative h-64">
            {periodTotal === 0 && (
              <div className="absolute inset-0 z-10 grid place-items-center">
                <p className="rounded-xl border border-line bg-ink-800/90 px-4 py-2 text-sm text-neutral-400">
                  No paid bookings in the last {DAYS} days
                </p>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLOR} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#6b6b73', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis
                  allowDecimals={false}
                  domain={[0, (max) => Math.max(max, 100)]}
                  tick={{ fill: '#6b6b73', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) => (v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`)}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-xl border border-line bg-ink-800 px-3 py-2 shadow-xl">
                        <p className="text-[11px] text-neutral-400">{dateShort(payload[0].payload.day)}</p>
                        <p className="text-sm font-semibold text-bone">{inr(payload[0].value)}</p>
                      </div>
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLOR}
                  strokeWidth={2}
                  fill="url(#rev)"
                  activeDot={{ r: 5, stroke: '#101013', strokeWidth: 2, fill: CHART_COLOR }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Recent bookings */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Latest bookings</h2>
            <Link to="/owner/requests" className="text-xs font-semibold text-amber-300 hover:text-amber-200">
              View all
            </Link>
          </div>
          {bookingList.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">No bookings yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {bookingList.slice(0, 6).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-bone">{b.full_name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {b.station?.name} · {dateShort(b.slot?.date)} {time12(b.slot?.start_time)}
                    </p>
                  </div>
                  <Badge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Stations */}
      <h2 className="mb-4 mt-10 text-xl uppercase">Your stations</h2>
      {stationList.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No stations yet"
          description="Add your first charging station and start taking bookings."
          action={<Button to="/owner/stations/new">Add a station</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stationList.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}>
              <Card interactive className="overflow-hidden p-0">
                <img src={stationImage(s)} alt="" className="h-32 w-full object-cover" />
                <div className="p-4">
                  <h3 className="font-semibold text-bone">{s.name}</h3>
                  <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                    <MapPin className="size-3" /> <span className="truncate">{s.location_text}</span>
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Star className="size-3 fill-amber-400 text-amber-300" /> {Number(s.avg_rating || 0).toFixed(1)} · {s.review_count} reviews
                    </span>
                    <span className="font-semibold text-bone">{s.price_per_hour ? `${inr(s.price_per_hour)}/hr` : 'Free'}</span>
                  </div>
                  <Button size="sm" variant="secondary" block className="mt-4" to={`/owner/slots?station=${s.id}`}>
                    Manage slots & price
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
