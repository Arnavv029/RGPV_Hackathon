import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BrainCircuit,
  CalendarDays,
  CarFront,
  Clock,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  TestTube2,
  User,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import { dateShort, formatDuration, fullName, inr, slotHours, time12 } from '@/lib/format';
import { loadRazorpay } from '@/lib/razorpay';
import { useAuth } from '@/hooks/useAuth';
import { PENDING_BOOKING_KEY } from './StationDetails';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';

export const LAST_BOOKING_KEY = 'hev_last_booking';

const VEHICLE_TYPES = [
  'EV Sedan',
  'EV Hatchback',
  'EV SUV',
  'Electric Scooter',
  'Electric Motorcycle',
  'Electric Auto',
  'Electric Bus',
  'Other EV',
];

const POLICY = [
  ['100%', 'Cancel 30+ min before the slot starts'],
  ['70%', 'Cancel within 30 min before the start'],
  ['50%', 'Cancel within the first 30 min of the session'],
  ['0%', 'Cancel after 30 min into the session'],
];

export default function Booking() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pending = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(PENDING_BOOKING_KEY) || 'null');
    } catch {
      return null;
    }
  }, []);

  const [form, setForm] = useState({
    full_name: fullName(user) === 'there' ? '' : fullName(user),
    phone: user?.phone || '',
    email: user?.email || '',
    vehicle_number: '',
    vehicle_type: '',
  });
  const [stage, setStage] = useState('idle'); // idle | ordering | paying | verifying
  const [error, setError] = useState('');

  if (!pending?.slotId) return <Navigate to="/app" replace />;

  const hours = pending.durationHours || slotHours(pending.slotStart, pending.slotEnd);
  const rate = Number(pending.pricePerHour || 0);
  const total = pending.totalAmount != null ? Number(pending.totalAmount) : rate * hours;
  const busy = stage !== 'idle';

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pay = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.full_name.trim() || !form.phone.trim() || !form.email.trim()) {
      setError('Please fill in your name, phone and email.');
      return;
    }

    try {
      setStage('ordering');
      const [Razorpay, order] = await Promise.all([
        loadRazorpay(),
        endpoints.createRazorpayOrder({
          slot: pending.slotId,
          duration_hours: hours,
          ...form,
          full_name: form.full_name.trim(),
          amount_paid: total,
        }),
      ]);

      setStage('paying');
      const rzp = new Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'HapticEV',
        description: `Charging slot at ${pending.stationName}`,
        order_id: order.order_id,
        prefill: order.prefill || { name: form.full_name, email: form.email, contact: form.phone },
        theme: { color: '#e5941c' },
        handler: async (response) => {
          setStage('verifying');
          try {
            const result = await endpoints.verifyRazorpay({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              attempt_id: order.attempt_id,
            });
            sessionStorage.setItem(LAST_BOOKING_KEY, JSON.stringify(result.booking));
            sessionStorage.removeItem(PENDING_BOOKING_KEY);
            toast.success('Payment successful. Your slot is booked.');
            navigate(`/app/bookings/${result.booking.id}`, { replace: true });
          } catch (err) {
            setError(`${err.message} If money was deducted, contact support with your payment ID.`);
            setStage('idle');
          }
        },
        modal: {
          ondismiss: () => {
            toast('Payment cancelled.');
            setStage('idle');
          },
        },
      });
      rzp.on('payment.failed', (resp) => {
        setError(`Payment failed: ${resp.error?.description || 'unknown error'}`);
        setStage('idle');
      });
      rzp.open();
    } catch (err) {
      setError(err.message);
      setStage('idle');
    }
  };

  const ctaLabel = {
    idle: total > 0 ? `Pay ${inr(total, { decimals: 2 })}` : 'Confirm booking',
    ordering: 'Creating secure order…',
    paying: 'Waiting for payment…',
    verifying: 'Verifying payment…',
  }[stage];

  return (
    <div className="mx-auto max-w-6xl">
      <Link to={`/app/stations/${pending.stationId}`} className="mb-5 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-bone">
        <ArrowLeft className="size-4" /> Back to station
      </Link>

      <Stepper current={2} />

      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="display-xl mb-3 mt-8 text-[clamp(2.2rem,4.5vw,3.4rem)]">
        Secure your slot
      </motion.h1>
      <p className="mb-8 text-neutral-400">Enter your details and pay to lock in your charging session.</p>

      <form onSubmit={pay} className="grid gap-6 lg:grid-cols-[1.45fr_1fr]" noValidate>
        <div className="space-y-6">
          <Card className="p-6">
            <SectionTitle icon={User}>Your details</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name *" icon={User}>
                <Input withIcon value={form.full_name} onChange={set('full_name')} required />
              </Field>
              <Field label="Phone *" icon={Phone}>
                <Input withIcon type="tel" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" required />
              </Field>
              <Field label="Email *" icon={Mail} className="sm:col-span-2">
                <Input withIcon type="email" value={form.email} onChange={set('email')} required />
              </Field>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle icon={CarFront}>Vehicle</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Registration number">
                <Input
                  value={form.vehicle_number}
                  onChange={(e) => setForm((f) => ({ ...f, vehicle_number: e.target.value.toUpperCase() }))}
                  placeholder="MP 04 AB 1234"
                  maxLength={20}
                />
              </Field>
              <Field label="Vehicle type">
                <Select value={form.vehicle_type} onChange={set('vehicle_type')}>
                  <option value="">Select type</option>
                  {VEHICLE_TYPES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="border-amber-500/20 p-6">
            <SectionTitle icon={ShieldCheck} tone="text-amber-300">
              Cancellation & refunds
            </SectionTitle>
            <div className="grid gap-2 sm:grid-cols-2">
              {POLICY.map(([pct, text]) => (
                <div key={pct} className="flex items-center gap-3 rounded-xl border border-line bg-hover p-3">
                  <span className="w-12 font-display text-lg font-semibold text-amber-300">{pct}</span>
                  <span className="text-xs text-neutral-400">{text}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── Order summary ─────────────────────────────────────────────── */}
        <div>
          <Card className="sticky top-24 overflow-hidden p-0">
            <div className="relative h-36">
              <img src={pending.imageUrl} alt="" className="size-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#060607]/95 via-[#060607]/60 to-transparent" />
              <div className="absolute inset-x-5 bottom-4">
                <h3 className="text-lg uppercase !text-white">{pending.stationName}</h3>
                {pending.stationLocation && (
                  <p className="flex items-center gap-1 text-xs text-white/75">
                    <MapPin className="size-3" /> {pending.stationLocation}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-3">
                <Chip icon={CalendarDays} label={dateShort(pending.slotDate)} />
                <Chip icon={Clock} label={`${time12(pending.slotStart)} – ${time12(pending.slotEnd)}`} />
              </div>

              <div className="space-y-2.5 text-sm">
                <Row label="Charging rate" value={rate ? `${inr(rate)}/hr` : 'Free'} />
                {pending.basePrice && Number(pending.basePrice) !== rate && (
                  <Row label="Base rate" value={<span className="line-through">{inr(pending.basePrice)}/hr</span>} muted />
                )}
                <Row label="Duration" value={formatDuration(hours)} />
                <div className="flex items-baseline justify-between border-t border-dashed border-line pt-4">
                  <span className="font-semibold text-bone">Total</span>
                  <motion.span
                    key={total}
                    initial={{ scale: 1.15, color: '#fcc97b' }}
                    animate={{ scale: 1, color: '#f6f5f2' }}
                    className="font-display text-3xl font-semibold"
                  >
                    {inr(total, { decimals: 2 })}
                  </motion.span>
                </div>
              </div>

              {pending.priceExplanation && (
                <div className="flex gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-xs leading-relaxed text-neutral-300">
                  <BrainCircuit className="mt-0.5 size-4 shrink-0 text-sky-300" />
                  {pending.priceExplanation}
                </div>
              )}

              {error && (
                <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {error}
                </motion.p>
              )}

              <Button type="submit" block size="lg" loading={busy}>
                {!busy && <Lock className="size-4" />} {ctaLabel}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-neutral-500">
                Secured by Razorpay · UPI, cards, net banking. Your QR code is generated as soon as payment is verified.
              </p>

              {import.meta.env.DEV && (
                <details className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-neutral-400">
                  <summary className="flex cursor-pointer items-center gap-2 font-semibold text-amber-300">
                    <TestTube2 className="size-3.5" /> Razorpay test credentials
                  </summary>
                  <div className="mt-2 space-y-1 font-mono">
                    <div>UPI: success@razorpay</div>
                    <div>Card: 4111 1111 1111 1111 · any future expiry · any CVV</div>
                    <div>OTP: 1234</div>
                  </div>
                </details>
              )}
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
}

/** Checkout progress. `current` is 1-based; earlier steps render as done. */
function Stepper({ current }) {
  const steps = ['Choose slot', 'Details & payment', 'QR ticket'];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`grid size-6 place-items-center rounded-full border ${
                done
                  ? 'border-amber-400 bg-amber-400 text-on-accent'
                  : active
                    ? 'border-amber-400 text-amber-300 shadow-[0_0_0_4px_rgba(18,210,181,0.12)]'
                    : 'border-line-2 text-neutral-500'
              }`}
            >
              {n}
            </span>
            <span className={done || active ? 'text-bone' : 'text-neutral-500'}>{label}</span>
            {n < steps.length && <span className="mx-1 h-px w-8 bg-hover-2 sm:w-14" />}
          </li>
        );
      })}
    </ol>
  );
}

function SectionTitle({ icon: Icon, children, tone = 'text-amber-300' }) {
  return (
    <h2 className="mb-5 flex items-center gap-2 text-base font-semibold">
      <Icon className={`size-4 ${tone}`} /> {children}
    </h2>
  );
}

function Chip({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-hover px-3 py-2 text-xs text-neutral-300">
      <Icon className="size-3.5 text-amber-300" /> {label}
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-neutral-500' : 'text-neutral-400'}`}>
      <span>{label}</span>
      <span className={muted ? '' : 'text-bone'}>{value}</span>
    </div>
  );
}
