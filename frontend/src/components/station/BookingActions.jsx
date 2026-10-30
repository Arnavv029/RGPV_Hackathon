import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import { inr } from '@/lib/format';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Feedback';
import { RatingStars } from './StationCard';

/** Shows the backend's refund preview, then cancels on confirm. */
export function CancelBookingModal({ booking, onClose, onCancelled }) {
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const bookingId = booking?.id;

  // Ask the backend what the refund would be every time the modal opens.
  useEffect(() => {
    if (!bookingId) return undefined;
    let alive = true;
    setPreview(null);
    endpoints
      .refundPreview(bookingId)
      .then((p) => alive && setPreview(p))
      .catch((err) => alive && setPreview({ can_cancel: false, reason: err.message }));
    return () => {
      alive = false;
    };
  }, [bookingId]);
  const loading = !!bookingId && !preview;

  const confirm = async () => {
    setSubmitting(true);
    try {
      const res = await endpoints.cancelBooking(booking.id);
      toast.success(`Booking cancelled. ${inr(res.refund_amount, { decimals: 2 })} refund started.`);
      onCancelled?.(res.booking);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const close = onClose;

  return (
    <Modal open={!!booking} onClose={close} title="Cancel this booking?">
      {!preview ? (
        <Spinner label="Working out your refund…" className="py-8" />
      ) : preview.can_cancel === false ? (
        <p className="text-sm text-neutral-400">{preview.reason || preview.error || 'This booking can no longer be cancelled.'}</p>
      ) : (
        <>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">You'll get back</p>
            <p className="mt-1 font-display text-4xl font-semibold text-amber-300">{inr(preview.refund_amount, { decimals: 2 })}</p>
            <p className="mt-1 text-sm text-neutral-400">
              {preview.refund_percentage}% of {inr(preview.amount_paid, { decimals: 2 })}
            </p>
          </div>
          {preview.reason && <p className="mt-4 text-sm text-neutral-400">{preview.reason}</p>}
        </>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Keep booking
        </Button>
        {preview?.can_cancel !== false && (
          <Button variant="danger" onClick={confirm} loading={submitting} disabled={loading}>
            Yes, cancel
          </Button>
        )}
      </div>
    </Modal>
  );
}

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

export function ReviewModal({ booking, onClose, onReviewed }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setRating(0);
    setComment('');
    onClose();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await endpoints.reviewBooking(booking.id, { rating, comment: comment.trim() });
      toast.success('Thanks for your review!');
      onReviewed?.(res.booking);
      close();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={!!booking} onClose={close} title={`Rate ${booking?.station?.name || 'your session'}`}>
      <div className="flex flex-col items-center py-2">
        <RatingStars value={rating} onChange={setRating} size="size-9" />
        <p className="mt-2 h-5 text-sm font-semibold text-amber-300">{RATING_LABELS[rating]}</p>
      </div>
      <Textarea
        className="mt-4"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How was the charger, the wait and the staff? (optional)"
        maxLength={1000}
      />
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Not now
        </Button>
        <Button onClick={submit} loading={submitting} disabled={!rating}>
          Submit review
        </Button>
      </div>
    </Modal>
  );
}
