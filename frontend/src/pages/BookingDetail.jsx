import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CalendarDays,
  CarFront,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Hash,
  MapPin,
  Navigation,
  Star,
  XCircle,
} from 'lucide-react';
import { openDirections } from '@/lib/maps';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { endpoints } from '@/lib/api';
import { dateShort, dateTimeLong, inr, time12 } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { ErrorState, Spinner } from '@/components/ui/Feedback';
import { qrSrc } from '@/components/station/StationCard';
import { CancelBookingModal, ReviewModal } from '@/components/station/BookingActions';

const STATUS_COPY = {
  pending: 'Paid. Waiting for the station to approve your booking.',
  confirmed: 'Approved. Show this QR code when you arrive.',
  completed: 'Session complete. Thanks for charging with HapticEV.',
  rejected: 'The station declined this booking. Your refund has been started.',
  cancelled: 'You cancelled this booking.',
};

/** The QR "ticket" for a single booking — also the post-payment confirmation. */
export default function BookingDetail() {
  const { id } = useParams();
  const { data: b, loading, error, reload, setData } = useAsync(() => endpoints.booking(id), [id]);
  const [cancelling, setCancelling] = useState(null);
  const [reviewing, setReviewing] = useState(null);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !b) return <Spinner label="Loading your ticket…" />;

  const canCancel = ['pending', 'confirmed'].includes(b.status);
  const qr = qrSrc(b.qr_code);
  const fresh = b.status === 'pending' && Date.now() - new Date(b.created_at).getTime() < 5 * 60 * 1000;

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/app/bookings" className="mb-5 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-bone">
        <ArrowLeft className="size-4" /> My bookings
      </Link>

      {fresh && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4"
        >
          <motion.span
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.15 }}
          >
            <CheckCircle2 className="size-7 text-amber-300" />
          </motion.span>
          <div>
            <p className="font-semibold text-bone">Payment received. Your slot is reserved.</p>
            <p className="text-sm text-neutral-400">We'll let you know as soon as the station owner approves it.</p>
          </div>
        </motion.div>
      )}

      {/* Ticket */}
      <motion.div
        initial={{ opacity: 0, rotateX: 12, y: 20 }}
        animate={{ opacity: 1, rotateX: 0, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformPerspective: 1200 }}
      >
        <Card className="grid overflow-hidden p-0 md:grid-cols-[1fr_auto]">
          <div className="p-7">
            <div className="flex flex-wrap items-center gap-3">
              <Badge status={b.status} />
              <span className="flex items-center gap-1 font-mono text-xs text-neutral-500">
                <Hash className="size-3" />
                {String(b.booking_id).slice(0, 8).toUpperCase()}
              </span>
            </div>
            <h1 className="display-xl mt-4 text-[clamp(1.9rem,3.5vw,2.8rem)]">{b.station?.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-400">
              <MapPin className="size-4" /> {b.station?.location_text}
            </p>
            <p className="mt-4 text-sm text-neutral-300">{STATUS_COPY[b.status]}</p>

            <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Meta icon={CalendarDays} label="Date" value={dateShort(b.slot?.date)} />
              <Meta icon={Clock} label="Time" value={`${time12(b.slot?.start_time)} – ${time12(b.slot?.end_time)}`} />
              <Meta icon={CarFront} label="Vehicle" value={b.vehicle_number || b.vehicle_type || '—'} />
              <Meta icon={CreditCard} label="Paid" value={inr(b.amount_paid, { decimals: 2 })} />
            </div>

            {Number(b.refund_amount) > 0 && (
              <div className="mt-6 rounded-xl border border-sky-500/25 bg-sky-500/10 p-4 text-sm">
                Refund of <b className="text-bone">{inr(b.refund_amount, { decimals: 2 })}</b> ({b.refund_percentage}%)
                started {b.cancelled_at ? `on ${dateTimeLong(b.cancelled_at)}` : ''}.
              </div>
            )}

            <div className="mt-7 flex flex-wrap gap-2">
              {canCancel && (
                <Button onClick={() => openDirections(b.station)}>
                  <Navigation className="size-4" /> Directions
                </Button>
              )}
              {b.can_review && !b.has_review && (
                <Button onClick={() => setReviewing(b)}>
                  <Star className="size-4" /> Rate your session
                </Button>
              )}
              {canCancel && (
                <Button variant="danger" onClick={() => setCancelling(b)}>
                  <XCircle className="size-4" /> Cancel booking
                </Button>
              )}
            </div>
          </div>

          {/* Perforated QR stub */}
          <div className="relative flex flex-col items-center justify-center border-t border-dashed border-line-2 bg-hover p-7 md:border-l md:border-t-0">
            <span className="absolute -left-3 -top-3 hidden size-6 rounded-full bg-ink-950 md:block" />
            <span className="absolute -bottom-3 -left-3 hidden size-6 rounded-full bg-ink-950 md:block" />
            {qr && !['cancelled', 'rejected'].includes(b.status) ? (
              <>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.35, type: 'spring' }}
                  className="rounded-2xl bg-white p-3 shadow-[0_0_60px_-10px_rgba(18,210,181,0.6)]"
                >
                  <img src={qr} alt="Booking QR code" className="size-44" />
                </motion.div>
                <p className="mt-4 text-center text-xs text-neutral-400">Scan at the station to check in</p>
                <a href={qr} download={`hapticev-${String(b.booking_id).slice(0, 8)}.png`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200">
                  <Download className="size-3.5" /> Save QR
                </a>
              </>
            ) : (
              <div className="grid size-44 place-items-center rounded-2xl border border-line text-center text-xs text-neutral-500">
                QR not available
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      <CancelBookingModal booking={cancelling} onClose={() => setCancelling(null)} onCancelled={(nb) => nb && setData(nb)} />
      <ReviewModal booking={reviewing} onClose={() => setReviewing(null)} onReviewed={(nb) => nb && setData(nb)} />
    </div>
  );
}

function Meta({ icon: Icon, label, value }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-1 text-sm font-medium text-bone">{value}</div>
    </div>
  );
}
