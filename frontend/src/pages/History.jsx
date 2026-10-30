import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, ChevronRight, Clock, Navigation, Star, Wallet, Zap } from 'lucide-react';
import { openDirections } from '@/lib/maps';
import { useMemo, useState } from 'react';
import { endpoints } from '@/lib/api';
import { dateShort, inr, time12 } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton, StatCard } from '@/components/ui/Feedback';
import { stationImage } from '@/components/station/StationCard';
import { CancelBookingModal, ReviewModal } from '@/components/station/BookingActions';

const TABS = [
  { key: 'active', label: 'Active', match: (b) => ['pending', 'confirmed'].includes(b.status) },
  { key: 'completed', label: 'Completed', match: (b) => b.status === 'completed' },
  { key: 'closed', label: 'Cancelled', match: (b) => ['cancelled', 'rejected'].includes(b.status) },
  { key: 'all', label: 'All', match: () => true },
];

export default function History() {
  const { data, loading, error, reload, setData } = useAsync(() => endpoints.bookingHistory(), []);
  const [tab, setTab] = useState('active');
  const [cancelling, setCancelling] = useState(null);
  const [reviewing, setReviewing] = useState(null);

  const bookings = useMemo(() => (Array.isArray(data) ? data : data?.results || []), [data]);
  const filtered = bookings.filter(TABS.find((t) => t.key === tab).match);

  const replace = (updated) =>
    updated && setData((prev) => (Array.isArray(prev) ? prev.map((b) => (b.id === updated.id ? updated : b)) : prev));

  const spent = bookings.reduce((sum, b) => sum + Number(b.amount_paid || 0) - Number(b.refund_amount || 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Your sessions"
        title="My bookings"
        description="Your tickets, refunds and reviews, all in one place."
        actions={<Button to="/app"><Zap className="size-4" /> Book a charge</Button>}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard icon={CalendarClock} label="Total bookings" value={bookings.length} />
        <StatCard icon={Clock} label="Active" value={bookings.filter(TABS[0].match).length} accent="beam" delay={0.05} />
        <StatCard icon={Wallet} label="Net spent" value={inr(spent)} accent="flare" delay={0.1} />
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
        {TABS.map((t) => {
          const count = bookings.filter(t.match).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors ${
                tab === t.key ? 'text-bone' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {t.label} <span className="ml-1 text-xs text-neutral-500">{count}</span>
              {tab === t.key && <motion.span layoutId="hist-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-amber-400" />}
            </button>
          );
        })}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing here yet"
          description="Book a charging slot and your QR ticket will show up here."
          action={<Button to="/app">Find a station</Button>}
        />
      ) : (
        <motion.ul layout className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((b, i) => (
              <motion.li
                layout
                key={b.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0, transition: { delay: i * 0.03 } }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="glass group flex flex-col gap-4 rounded-2xl p-4 transition-colors hover:border-line-2 sm:flex-row sm:items-center"
              >
                <img src={stationImage(b.station)} alt="" className="h-20 w-full rounded-xl object-cover sm:w-28" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-bone">{b.station?.name}</h3>
                    <Badge status={b.status} />
                  </div>
                  <p className="mt-1.5 text-sm text-neutral-400">
                    {dateShort(b.slot?.date)} · {time12(b.slot?.start_time)} – {time12(b.slot?.end_time)}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {inr(b.amount_paid, { decimals: 2 })}
                    {Number(b.refund_amount) > 0 && ` · refunded ${inr(b.refund_amount, { decimals: 2 })}`}
                    {b.has_review && ' · reviewed'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['pending', 'confirmed'].includes(b.status) && (
                    <Button size="sm" onClick={() => openDirections(b.station)} aria-label={`Directions to ${b.station?.name}`}>
                      <Navigation className="size-3.5" /> Directions
                    </Button>
                  )}
                  {b.can_review && !b.has_review && (
                    <Button size="sm" variant="secondary" onClick={() => setReviewing(b)}>
                      <Star className="size-3.5" /> Rate
                    </Button>
                  )}
                  {['pending', 'confirmed'].includes(b.status) && (
                    <Button size="sm" variant="danger" onClick={() => setCancelling(b)}>
                      Cancel
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" to={`/app/bookings/${b.id}`}>
                    Ticket <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <CancelBookingModal booking={cancelling} onClose={() => setCancelling(null)} onCancelled={replace} />
      <ReviewModal booking={reviewing} onClose={() => setReviewing(null)} onReviewed={replace} />
    </div>
  );
}
