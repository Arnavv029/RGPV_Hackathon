import { AnimatePresence, motion } from 'framer-motion';
import { Car, Check, CheckCheck, Inbox, Mail, Phone, RefreshCw, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import { dateShort, dateTimeLong, inr, time12 } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';

const FILTERS = ['pending', 'confirmed', 'completed', 'rejected', 'cancelled', 'all'];

/** Allowed owner transitions, mirroring BookingStatusUpdateSerializer. */
export function nextActions(status) {
  if (status === 'pending') return ['confirmed', 'rejected'];
  if (status === 'confirmed') return ['completed'];
  return [];
}

const ACTION_UI = {
  confirmed: { label: 'Approve', icon: Check, variant: 'primary' },
  rejected: { label: 'Reject', icon: X, variant: 'danger' },
  completed: { label: 'Mark completed', icon: CheckCheck, variant: 'sky' },
};

export function StatusActions({ booking, onChanged, size = 'sm' }) {
  const [busy, setBusy] = useState(null);
  const run = async (status) => {
    setBusy(status);
    try {
      await endpoints.updateBookingStatus(booking.id, status);
      toast.success(`Booking ${status}`);
      onChanged?.({ ...booking, status });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {nextActions(booking.status).map((s) => {
        const { label, icon: Icon, variant } = ACTION_UI[s];
        return (
          <Button key={s} size={size} variant={variant} loading={busy === s} disabled={!!busy} onClick={() => run(s)}>
            {busy !== s && <Icon className="size-4" />} {label}
          </Button>
        );
      })}
    </div>
  );
}

export default function BookingRequests() {
  const { data, loading, error, reload, setData } = useAsync(() => endpoints.ownerBookings(), []);
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');

  const all = useMemo(() => (Array.isArray(data) ? data : data?.results || []), [data]);
  const shown = all.filter((b) => {
    if (filter !== 'all' && b.status !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || [b.full_name, b.phone, b.vehicle_number, b.station?.name].some((f) => f?.toLowerCase().includes(q));
  });

  const replace = (nb) => setData((prev) => (Array.isArray(prev) ? prev.map((b) => (b.id === nb.id ? { ...b, ...nb } : b)) : prev));

  return (
    <div>
      <PageHeader
        eyebrow="Bookings"
        title="Booking requests"
        description="Approve new bookings, reject the ones you can't serve, and close sessions once charging is done."
        actions={
          <Button variant="secondary" onClick={reload} loading={loading}>
            {!loading && <RefreshCw className="size-4" />} Refresh
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-ink-900/60 p-1">
          {FILTERS.map((f) => {
            const count = f === 'all' ? all.length : all.filter((b) => b.status === f).length;
            return (
              <button key={f} onClick={() => setFilter(f)} className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${filter === f ? 'text-bone' : 'text-neutral-400 hover:text-bone'}`}>
                {filter === f && <motion.span layoutId="req-filter" className="absolute inset-0 rounded-lg bg-hover-2" />}
                <span className="relative">
                  {f} <span className="text-neutral-500">{count}</span>
                </span>
              </button>
            );
          })}
        </div>
        <label className="relative md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, vehicle…"
            className="h-10 w-full rounded-xl border border-line bg-ink-900/70 pl-9 pr-3 text-sm text-bone placeholder:text-neutral-500 focus:border-amber-400/60 focus:outline-none"
          />
        </label>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={Inbox} title={`No ${filter === 'all' ? '' : filter} bookings`} description="Nothing to act on right now." />
      ) : (
        <motion.div layout className="grid gap-4 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {shown.map((b) => (
              <motion.article key={b.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="glass rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-bone">{b.full_name}</h3>
                    <p className="mt-0.5 text-xs text-neutral-500">Booked {dateTimeLong(b.created_at)}</p>
                  </div>
                  <Badge status={b.status} />
                </div>

                <div className="mt-4 rounded-xl border border-line bg-hover p-3">
                  <p className="text-sm font-medium text-bone">{b.station?.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {dateShort(b.slot?.date)} · {time12(b.slot?.start_time)} – {time12(b.slot?.end_time)}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-400">
                  <a href={`tel:${b.phone}`} className="flex items-center gap-1.5 hover:text-bone">
                    <Phone className="size-3.5" /> {b.phone || '—'}
                  </a>
                  <span className="flex items-center gap-1.5 truncate">
                    <Mail className="size-3.5 shrink-0" /> <span className="truncate">{b.email}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Car className="size-3.5" /> {b.vehicle_number || b.vehicle_type || '—'}
                  </span>
                  <span className="font-semibold text-bone">
                    {inr(b.amount_paid, { decimals: 2 })} <span className="font-normal capitalize text-neutral-500">· {b.payment_status}</span>
                  </span>
                </div>

                {/* Platform Commission & Net Payout breakdown */}
                {b.amount_paid > 0 && (
                  <div className="mt-3 rounded-lg border border-line bg-ink-900/50 px-3 py-1.5 text-[11px]">
                    {Number(b.commission_amount || 0) > 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-1 text-neutral-400">
                        <span>Platform Fee (5% Free Tier): <b className="text-amber-400">-{inr(b.commission_amount)}</b></span>
                        <span>Your Net Earnings: <b className="text-emerald-400">{inr(b.owner_earnings)}</b></span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-1 text-neutral-400">
                        <span className="text-emerald-300">✓ 0% Platform Commission (Quota Active)</span>
                        <span>Your Net Earnings: <b className="text-emerald-400">{inr(b.owner_earnings || b.amount_paid)}</b></span>
                      </div>
                    )}
                  </div>
                )}

                {nextActions(b.status).length > 0 && (
                  <div className="mt-4 border-t border-line pt-4">
                    <StatusActions booking={b} onChanged={replace} />
                  </div>
                )}
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
