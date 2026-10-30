import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Zap,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  CreditCard,
  TrendingUp,
  Percent,
  Clock,
  Layers,
  AlertCircle,
  HelpCircle,
  Flame,
  Check,
  ChevronDown,
  Info,
  Gift,
  Building2,
  Receipt,
  TestTube2,
} from 'lucide-react';
import { endpoints } from '@/lib/api';
import { loadRazorpay } from '@/lib/razorpay';
import { inr, dateShort } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Spinner, ErrorState } from '@/components/ui/Feedback';

export default function OwnerMembership() {
  const { data, loading, error, reload } = useAsync(() => endpoints.ownerMembership(), []);

  const [selectedPlan, setSelectedPlan] = useState('plan_1299');
  const [autopayEnabled, setAutopayEnabled] = useState(false);
  const [autopayPlan, setAutopayPlan] = useState('plan_999');
  const [purchasing, setPurchasing] = useState(false);
  const [updatingAutopay, setUpdatingAutopay] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  // Sync state when data loads
  const membership = data?.membership;
  const plans = data?.plans || {};
  const orders = data?.orders || [];
  const stats = data?.stats || {};

  // Keep local autopay in sync
  const isAutopayActive = membership?.is_autopay_enabled ?? false;

  const currentPlanInfo = useMemo(() => {
    if (!membership) return null;
    if (membership.plan === 'free') {
      return {
        name: membership.bookings_remaining > 0 ? 'Free Trial' : 'Free Plan (5% Commission)',
        badge: membership.bookings_remaining > 0 ? 'Trial Active' : 'Commission Tier',
        price: 0,
        isFree: true,
      };
    }
    return plans[membership.plan] || { name: membership.plan_display, price: 999 };
  }, [membership, plans]);

  // Handle Autopay toggle
  const handleToggleAutopay = async (newVal, planKey) => {
    setUpdatingAutopay(true);
    try {
      const res = await endpoints.toggleAutopay({
        is_autopay_enabled: newVal,
        autopay_plan: planKey || membership?.autopay_plan || 'plan_999',
      });
      toast.success(res.message || 'Autopay preference updated.');
      await reload();
    } catch (err) {
      toast.error(err.message || 'Failed to update autopay setting.');
    } finally {
      setUpdatingAutopay(false);
    }
  };

  // Handle Razorpay Membership Purchase
  const handleBuyPlan = async (planKey) => {
    const targetPlan = plans[planKey];
    if (!targetPlan) return;

    setPurchasing(true);
    try {
      const [Razorpay, orderData] = await Promise.all([
        loadRazorpay(),
        endpoints.createMembershipOrder({ plan: planKey }),
      ]);

      const rzp = new Razorpay({
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'HapticEV Station Membership',
        description: `${targetPlan.name} (${targetPlan.bookings} Bookings)`,
        order_id: orderData.order_id,
        prefill: orderData.prefill || {},
        theme: { color: '#e5941c' },
        handler: async (response) => {
          try {
            const verifyRes = await endpoints.verifyMembershipOrder({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan: planKey,
              is_autopay: isAutopayActive,
            });
            toast.success(verifyRes.message || 'Membership activated successfully!');
            await reload();
          } catch (err) {
            toast.error(err.message || 'Signature verification failed.');
          } finally {
            setPurchasing(false);
          }
        },
        modal: {
          ondismiss: () => {
            toast('Payment checkout cancelled.');
            setPurchasing(false);
          },
        },
      });

      rzp.on('payment.failed', (resp) => {
        toast.error(`Payment failed: ${resp.error?.description || 'Declined'}`);
        setPurchasing(false);
      });

      rzp.open();
    } catch (err) {
      toast.error(err.message || 'Could not initiate Razorpay checkout.');
      setPurchasing(false);
    }
  };

  // Instant simulation purchase (useful for instant testing/demo)
  const handleSimulatePurchase = async (planKey) => {
    setPurchasing(true);
    try {
      const res = await endpoints.simulateMembershipPurchase({
        plan: planKey,
        is_autopay: isAutopayActive,
      });
      toast.success(res.message);
      await reload();
    } catch (err) {
      toast.error(err.message || 'Simulation failed.');
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) return <Spinner label="Loading membership details…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const remaining = membership?.bookings_remaining ?? 0;
  const totalCredited = membership?.total_bookings_credited || 20;
  const used = membership?.bookings_used ?? 0;
  const quotaPercent = Math.min(100, Math.round((remaining / Math.max(totalCredited, 1)) * 100));

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Station Owner Membership"
        title="Accelerate Bookings & Boost Revenue"
        description="Select a booking quota plan for 0% commission, premier search ranking, and automated renewal."
      />

      {/* ── Active Status & Quota Banner ── */}
      <div className="mb-10 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="relative overflow-hidden p-6 sm:p-8">
          <div className="absolute right-0 top-0 -mr-10 -mt-10 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl border border-amber-500/30 bg-amber-500/15 text-amber-400">
                <Crown className="size-6" />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Current Status
                </span>
                <h2 className="font-display text-2xl font-bold text-bone">
                  {currentPlanInfo?.name || 'Active Plan'}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {membership?.is_priority ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                  <Sparkles className="size-3.5 animate-pulse" /> Priority Partner Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
                  <Percent className="size-3.5" /> 5% Commission Tier
                </span>
              )}
            </div>
          </div>

          {/* Quota Progress Bar */}
          <div className="mt-8 rounded-2xl border border-line bg-ink-900/60 p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-neutral-400">Remaining Booking Quota</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-extrabold text-bone">{remaining}</span>
                  <span className="text-sm font-medium text-neutral-500">
                    / {totalCredited} total credited
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-neutral-400">Used: {used}</p>
                <p className="mt-1 text-xs font-semibold text-amber-300">
                  {membership?.effective_commission_rate}% Platform Commission
                </p>
              </div>
            </div>

            <div className="mt-3.5 h-2.5 w-full overflow-hidden rounded-full bg-ink-700">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${quotaPercent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={`h-full rounded-full transition-all ${
                  remaining > 15
                    ? 'bg-gradient-to-r from-emerald-500 to-amber-400'
                    : remaining > 0
                    ? 'bg-gradient-to-r from-amber-500 to-rose-400'
                    : 'bg-rose-500'
                }`}
              />
            </div>

            {remaining === 0 ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-rose-300">
                <AlertCircle className="size-4 shrink-0" />
                <span>
                  Booking quota is exhausted. Your stations are now on the <b>Free Tier (5% commission)</b> and will have standard search ranking.
                </span>
              </div>
            ) : remaining <= 5 ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-300">
                <AlertCircle className="size-4 shrink-0" />
                <span>Low quota remaining! Recharge below to keep top search priority.</span>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Your stations enjoy top priority listing with 0% platform commission!</span>
              </div>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-line/60 pt-5 text-center">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">Stations Active</p>
              <p className="mt-0.5 text-lg font-bold text-bone">{stats.stations_count || 1}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">Gross Processed</p>
              <p className="mt-0.5 text-lg font-bold text-bone">{inr(stats.gross_revenue || 0)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">Commission Deducted</p>
              <p className="mt-0.5 text-lg font-bold text-amber-300">
                {inr(stats.total_commission_paid || 0)}
              </p>
            </div>
          </div>
        </Card>

        {/* ── Autopay Control Card ── */}
        <Card className="flex flex-col justify-between p-6 sm:p-7">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="size-5 text-amber-400" />
                <h3 className="text-base font-semibold text-bone">Seamless Autopay</h3>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  isAutopayActive
                    ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border border-neutral-700 bg-neutral-800 text-neutral-400'
                }`}
              >
                {isAutopayActive ? 'Autopay ON' : 'Autopay OFF'}
              </span>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-neutral-300">
              When enabled, your chosen plan is automatically renewed as soon as your booking quota hits 0. Never worry about losing station priority or paying 5% commission.
            </p>

            <div className="mt-5 rounded-xl border border-line bg-ink-900/50 p-4">
              <label className="text-xs font-medium text-neutral-400">
                Default Auto-Renewal Plan
              </label>
              <select
                value={membership?.autopay_plan || autopayPlan}
                onChange={(e) => {
                  setAutopayPlan(e.target.value);
                  if (isAutopayActive) {
                    handleToggleAutopay(true, e.target.value);
                  }
                }}
                className="mt-2 w-full rounded-lg border border-line bg-ink-800 px-3 py-2 text-sm text-bone focus:border-amber-400 focus:outline-none"
              >
                <option value="plan_999">Starter Plan — ₹999 (50 Bookings)</option>
                <option value="plan_1299">Growth Plan — ₹1299 (75 Bookings) [Recommended]</option>
                <option value="plan_1499">Enterprise Plan — ₹1499 (100 Bookings)</option>
              </select>
            </div>
          </div>

          <div className="mt-6 border-t border-line/60 pt-5">
            <Button
              variant={isAutopayActive ? 'secondary' : 'primary'}
              block
              disabled={updatingAutopay}
              onClick={() => handleToggleAutopay(!isAutopayActive, autopayPlan)}
            >
              {updatingAutopay ? (
                'Updating Autopay…'
              ) : isAutopayActive ? (
                'Disable Autopay'
              ) : (
                <>
                  <Zap className="size-4" /> Enable Instant Autopay
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>

      {/* ── Plans Header ── */}
      <div className="mb-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
          <Gift className="size-3.5" /> High-Return Membership Plans
        </span>
        <h2 className="mt-2 font-display text-3xl font-bold text-bone">
          Choose Your Station Booking Pack
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-neutral-400">
          All paid plans offer <b>0% platform commission</b> and <b>search priority placement</b> so EV drivers find and book your charging stations first.
        </p>
      </div>

      {/* ── The 3 Membership Plans Grid ── */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Plan 1: Starter ₹999 */}
        <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
          <Card
            className={`relative flex h-full flex-col justify-between p-6 sm:p-7 ${
              selectedPlan === 'plan_999' ? 'border-amber-500/80 shadow-lg shadow-amber-500/10' : ''
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-neutral-700 bg-neutral-800/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
                  Starter Plan
                </span>
                <span className="text-xs font-medium text-neutral-400">50 Bookings</span>
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-4xl font-extrabold text-bone">₹999</span>
                <span className="text-xs text-neutral-400">/ 50 slots</span>
              </div>
              <p className="mt-1 text-xs text-amber-300/90 font-medium">₹19.98 per booking</p>

              <p className="mt-3 text-xs leading-relaxed text-neutral-400">
                Ideal for emerging EV charging stations starting out on the platform.
              </p>

              <div className="mt-6 space-y-3 border-t border-line/60 pt-5 text-xs text-neutral-300">
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400" />
                  <span><b>50 Verified Bookings</b> quota</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400" />
                  <span><b>0% Platform Commission</b></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400" />
                  <span><b>Priority Ranking</b> in Station Search</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400" />
                  <span>Real-time QR Verification</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400" />
                  <span>Autopay Eligible</span>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-2">
              <Button
                variant={selectedPlan === 'plan_999' ? 'primary' : 'secondary'}
                block
                disabled={purchasing}
                onClick={() => handleBuyPlan('plan_999')}
              >
                <CreditCard className="size-4" /> Buy Starter (₹999)
              </Button>
              <button
                type="button"
                onClick={() => handleSimulatePurchase('plan_999')}
                className="w-full text-center text-[11px] text-neutral-500 hover:text-amber-300"
              >
                Instant Test / Demo Activate
              </button>
            </div>
          </Card>
        </motion.div>

        {/* Plan 2: Growth ₹1299 (Featured / Best Value) */}
        <motion.div whileHover={{ y: -6 }} transition={{ duration: 0.2 }}>
          <Card
            className="relative flex h-full flex-col justify-between border-amber-400 bg-gradient-to-b from-amber-500/10 via-ink-850 to-ink-900 p-6 shadow-xl shadow-amber-500/15 sm:p-7"
          >
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full border border-amber-400 bg-amber-400 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-950 shadow-md">
              ★ Most Popular · Best Value
            </div>

            <div>
              <div className="flex items-center justify-between pt-1">
                <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                  Growth Plan
                </span>
                <span className="text-xs font-semibold text-amber-300">75 Bookings</span>
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-4xl font-extrabold text-bone">₹1299</span>
                <span className="text-xs text-neutral-400">/ 75 slots</span>
              </div>
              <p className="mt-1 text-xs font-semibold text-emerald-300">
                ₹17.32 per booking (Save 15%)
              </p>

              <p className="mt-3 text-xs leading-relaxed text-neutral-300">
                Perfect for busy charging stations with steady daily traffic.
              </p>

              <div className="mt-6 space-y-3 border-t border-line/60 pt-5 text-xs text-neutral-200">
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-amber-300" />
                  <span><b>75 Verified Bookings</b> quota</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-amber-300" />
                  <span><b>0% Platform Commission</b></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-amber-300" />
                  <span><b>High Search Priority + Featured Badge</b></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-amber-300" />
                  <span>Peak Hours Dynamic Pricing</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-amber-300" />
                  <span>Autopay Automated Renewal</span>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-2">
              <Button
                variant="primary"
                block
                disabled={purchasing}
                onClick={() => handleBuyPlan('plan_1299')}
                className="shadow-lg shadow-amber-500/20"
              >
                <Zap className="size-4" /> Buy Growth (₹1299)
              </Button>
              <button
                type="button"
                onClick={() => handleSimulatePurchase('plan_1299')}
                className="w-full text-center text-[11px] text-neutral-500 hover:text-amber-300"
              >
                Instant Test / Demo Activate
              </button>
            </div>
          </Card>
        </motion.div>

        {/* Plan 3: Enterprise ₹1499 */}
        <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
          <Card
            className={`relative flex h-full flex-col justify-between p-6 sm:p-7 ${
              selectedPlan === 'plan_1499' ? 'border-amber-500/80 shadow-lg shadow-amber-500/10' : ''
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-neutral-700 bg-neutral-800/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
                  Enterprise Plan
                </span>
                <span className="text-xs font-medium text-neutral-400">100 Bookings</span>
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-4xl font-extrabold text-bone">₹1499</span>
                <span className="text-xs text-neutral-400">/ 100 slots</span>
              </div>
              <p className="mt-1 text-xs font-semibold text-emerald-300">
                ₹14.99 per booking (Highest Savings)
              </p>

              <p className="mt-3 text-xs leading-relaxed text-neutral-400">
                Maximum volume for premium stations and multi-gun charging hubs.
              </p>

              <div className="mt-6 space-y-3 border-t border-line/60 pt-5 text-xs text-neutral-300">
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400" />
                  <span><b>100 Verified Bookings</b> quota</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400" />
                  <span><b>0% Platform Commission</b></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400" />
                  <span><b>Premier Search Priority Placement</b></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400" />
                  <span>Verified Partner Station Badge</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="size-4 text-emerald-400" />
                  <span>Dedicated Multi-Slot Optimization</span>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-2">
              <Button
                variant={selectedPlan === 'plan_1499' ? 'primary' : 'secondary'}
                block
                disabled={purchasing}
                onClick={() => handleBuyPlan('plan_1499')}
              >
                <CreditCard className="size-4" /> Buy Enterprise (₹1499)
              </Button>
              <button
                type="button"
                onClick={() => handleSimulatePurchase('plan_1499')}
                className="w-full text-center text-[11px] text-neutral-500 hover:text-amber-300"
              >
                Instant Test / Demo Activate
              </button>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* ── Free Plan Comparison & Policy Card ── */}
      <Card className="mt-10 border-dashed p-6 sm:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-10 place-items-center rounded-xl bg-ink-800 text-amber-400">
              <Info className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-bone">How does the Free Plan work?</h3>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-neutral-400">
                • <b>New Station Welcome:</b> When a new charging station is registered, the owner automatically receives <b>20 free trial bookings</b>.<br />
                • <b>After 20 Bookings:</b> If you choose to stay on the free plan without purchasing a membership, a <b>5% platform fee</b> is deducted from each booking payment.<br />
                • <b>Prioritization:</b> Free tier stations do not receive top search priority, while paid membership stations are prioritized at the top of driver searches.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleBuyPlan('plan_999')}
            >
              Upgrade to 0% Commission
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Transaction & Membership Orders History ── */}
      <div className="mt-12">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl font-bold text-bone">Order & Invoice History</h3>
            <p className="text-xs text-neutral-400">
              Record of your membership purchases and automated renewals.
            </p>
          </div>
          <Receipt className="size-5 text-neutral-500" />
        </div>

        {orders.length === 0 ? (
          <Card className="p-8 text-center text-sm text-neutral-500">
            No membership purchases yet. Choose a plan above to activate your priority quota.
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-ink-900/80 text-[11px] uppercase tracking-wider text-neutral-400">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Plan</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Bookings</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Order / Txn ID</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-neutral-300">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-ink-800/40">
                      <td className="px-5 py-3.5 font-medium text-bone">{o.plan_name}</td>
                      <td className="px-5 py-3.5 font-semibold text-bone">{inr(o.amount)}</td>
                      <td className="px-5 py-3.5 font-medium text-emerald-400">
                        +{o.bookings_credited}
                      </td>
                      <td className="px-5 py-3.5">
                        {o.is_autopay ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            <RefreshCw className="size-2.5" /> Autopay
                          </span>
                        ) : (
                          <span className="text-neutral-400">Manual</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-neutral-400">
                        {o.razorpay_payment_id || o.razorpay_order_id}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            o.status === 'paid'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-neutral-500">{dateShort(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* ── FAQ Section ── */}
      <div className="mt-12">
        <h3 className="mb-4 font-display text-xl font-bold text-bone">
          Frequently Asked Questions
        </h3>
        <div className="space-y-3">
          {[
            {
              q: 'How does Autopay work?',
              a: 'When you turn Autopay ON, you choose your preferred renewal plan (₹999, ₹1299, or ₹1499). When your booking quota runs out, the system automatically renews your plan so your charging stations never suffer from dropped search rankings or commission fees.',
            },
            {
              q: 'What happens to the 20 free bookings when I register a station?',
              a: 'Every newly registered station gives you 20 free bookings quota with 0% platform commission. After using the 20 bookings, you can choose any of the 3 plans or stay on the free plan with a 5% platform fee.',
            },
            {
              q: 'How does station prioritization work in driver searches?',
              a: 'Drivers seeing the list of charging stations will see stations owned by active paid members first at the top of their search results, tagged with a Priority Partner badge. Free tier stations appear below paid stations.',
            },
            {
              q: 'Can I change my Autopay plan or turn it off at any time?',
              a: 'Yes! You can toggle Autopay ON or OFF anytime with a single click, or select a different default renewal plan from the control panel above.',
            },
          ].map((faq, i) => (
            <Card
              key={i}
              interactive
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="cursor-pointer p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-bone">{faq.q}</span>
                <ChevronDown
                  className={`size-4 text-neutral-400 transition-transform ${
                    openFaq === i ? 'rotate-180' : ''
                  }`}
                />
              </div>
              <AnimatePresence>
                {openFaq === i && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden pt-3 text-xs leading-relaxed text-neutral-400"
                  >
                    {faq.a}
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
