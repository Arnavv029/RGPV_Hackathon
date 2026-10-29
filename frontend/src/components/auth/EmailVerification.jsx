import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Mail, RotateCw, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

const CODE_LENGTH = 6;

/**
 * Sign-up email ownership check.
 *
 * Flow: enter email → we mail a 6-digit code → enter it → the backend returns a
 * short-lived token that registration must carry. Until that token exists the
 * account cannot be created, so an address can't be claimed by someone else.
 *
 * `onVerified(token)` fires once the code checks out; changing the email after
 * that clears the token via `onReset()`.
 */
export default function EmailVerification({ email, onEmailChange, verified, onVerified, onReset }) {
  const [stage, setStage] = useState('idle'); // idle | sending | sent | verifying
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const boxes = useRef([]);

  // Resend cooldown ticker — mirrors the 60s the API enforces.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const code = digits.join('');
  const emailLooksValid = /\S+@\S+\.\S+/.test(email.trim());

  // Auto-submit as soon as six digits are present. Driving this from an effect
  // (rather than inside the change handler) means it can't read a stale copy of
  // `digits` when the boxes are filled quickly or pasted.
  useEffect(() => {
    if (stage === 'sent' && code.length === CODE_LENGTH) submitCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, stage]);

  const sendCode = async () => {
    setError('');
    if (!emailLooksValid) {
      setError('Enter a valid email address first.');
      return;
    }
    setStage('sending');
    try {
      const res = await endpoints.requestOtp(email.trim());
      toast.success(res.message || 'Verification code sent.');
      setStage('sent');
      setCooldown(60);
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => boxes.current[0]?.focus(), 80);
    } catch (err) {
      setError(err.message);
      setStage(stage === 'sent' ? 'sent' : 'idle');
    }
  };

  const submitCode = async (value = code) => {
    if (value.length !== CODE_LENGTH) return;
    setError('');
    setStage('verifying');
    try {
      const res = await endpoints.verifyOtp(email.trim(), value);
      onVerified(res.verification_token);
      toast.success('Email verified.');
    } catch (err) {
      setError(err.message);
      setDigits(Array(CODE_LENGTH).fill(''));
      boxes.current[0]?.focus();
      setStage('sent');
    }
  };

  const setDigit = (i, raw) => {
    const char = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = char;
    setDigits(next);
    if (char && i < CODE_LENGTH - 1) boxes.current[i + 1]?.focus();
  };

  const onKeyDown = (i) => (e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) boxes.current[i + 1]?.focus();
  };

  // Pasting the whole code into any box should just work.
  const onPaste = (e) => {
    const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill('');
    text.split('').forEach((c, i) => (next[i] = c));
    setDigits(next);
    boxes.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus();
  };

  if (verified) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-mint-500/30 bg-mint-500/10 p-4"
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 shrink-0 text-mint-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-bone">Email verified</p>
            <p className="truncate text-xs text-neutral-500">{email}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onReset();
              setStage('idle');
              setDigits(Array(CODE_LENGTH).fill(''));
            }}
            className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-bone"
          >
            Change
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <Field label="Email *" icon={Mail}>
        <div className="flex gap-2">
          <Input
            withIcon
            required
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={stage === 'sending'}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={sendCode}
            loading={stage === 'sending'}
            disabled={!emailLooksValid || cooldown > 0}
            className="shrink-0"
          >
            {stage === 'sent' ? (cooldown > 0 ? `${cooldown}s` : <RotateCw className="size-4" />) : 'Verify'}
          </Button>
        </div>
      </Field>

      <AnimatePresence>
        {stage !== 'idle' && stage !== 'sending' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-line bg-hover p-4">
              <p className="flex items-center gap-2 text-xs text-neutral-400">
                <ShieldCheck className="size-3.5 shrink-0 text-amber-300" />
                Enter the 6-digit code we emailed you.
              </p>

              <div className="mt-3 flex gap-2" onPaste={onPaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => (boxes.current[i] = el)}
                    value={d}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={onKeyDown(i)}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    aria-label={`Digit ${i + 1}`}
                    disabled={stage === 'verifying'}
                    className="h-12 w-full rounded-xl border border-line bg-ink-900 text-center font-display text-lg font-bold text-bone transition focus:border-amber-400/70 focus:outline-none focus:ring-4 focus:ring-amber-400/10 disabled:opacity-60"
                  />
                ))}
              </div>

              <Button
                type="button"
                block
                className="mt-3"
                loading={stage === 'verifying'}
                disabled={code.length !== CODE_LENGTH}
                onClick={() => submitCode(code)}
              >
                Verify code
              </Button>

              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[11px] text-neutral-500">
                  {stage === 'verifying' ? 'Checking…' : 'Code expires in 10 minutes'}
                </span>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={cooldown > 0}
                  className="text-[11px] font-bold uppercase tracking-wider text-amber-300 disabled:opacity-40"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
