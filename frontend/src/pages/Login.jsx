import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BatteryCharging, Building2, Lock, Mail, Phone, User, Wrench, Zap } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { HOME_FOR_ROLE } from '@/context/auth-context';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import Logo from '@/components/brand/Logo';
import EmailVerification from '@/components/auth/EmailVerification';

const ROLES = [
  { value: 'user', label: 'Driver', icon: BatteryCharging },
  { value: 'owner', label: 'Station owner', icon: Building2 },
  { value: 'mechanic', label: 'Mechanic', icon: Wrench },
];

export default function Login() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'register' ? 'register' : 'login';
  const { login, register, isAuthenticated, homePath } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: ['owner', 'mechanic'].includes(params.get('role')) ? params.get('role') : 'user',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Sign-up only: proof that the address belongs to whoever is filling this in.
  const [verificationToken, setVerificationToken] = useState('');

  if (isAuthenticated) return <Navigate to={homePath} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const switchMode = (next) => {
    setError('');
    setVerificationToken('');
    const p = new URLSearchParams(params);
    if (next === 'register') p.set('mode', 'register');
    else p.delete('mode');
    setParams(p, { replace: true });
  };

  const goHome = (user) => {
    const from = location.state?.from;
    const target = HOME_FOR_ROLE[user.role] || '/app';
    // Only honour `from` when it belongs to the signed-in role's area.
    navigate(from && from.startsWith(target) ? from : target, { replace: true });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'register') {
      if (!verificationToken) {
        setError('Please verify your email address first.');
        return;
      }
      if (form.password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const user = await login({ email: form.email.trim(), password: form.password });
        toast.success(`Welcome back${user.first_name ? `, ${user.first_name}` : ''}!`);
        goHome(user);
      } else {
        const user = await register({
          ...form,
          email: form.email.trim(),
          verification_token: verificationToken,
        });
        if (user) {
          toast.success('Account created. Welcome to HapticEV!');
          goHome(user);
        } else {
          toast.success('Account created. Please sign in.');
          switchMode('login');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ── Left: brand panel ───────────────────────────────────────────── */}
      <aside className="on-dark relative hidden overflow-hidden border-r border-line lg:block">
        <video
          className="absolute inset-0 size-full object-cover opacity-40"
          src="/videos/ev-hero.mp4"
          poster="/images/ev-hero.jpg"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#060607]/92 via-[#060607]/60 to-amber-700/40" />
        <div className="grid-fade absolute inset-0" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="display-xl max-w-md text-[clamp(2.6rem,3.6vw,3.8rem)] !text-white"
            >
              Chargers that <span className="text-gradient">wait for you</span>, not the other way round.
            </motion.h2>
            <div className="mt-10 space-y-3">
              {['Live availability at every station', 'AI prices that fall off-peak', 'QR check-in in seconds'].map(
                (t, i) => (
                  <motion.div
                    key={t}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="flex items-center gap-3 text-white/80"
                  >
                    <span className="grid size-6 place-items-center rounded-full bg-amber-500/20">
                      <Zap className="size-3 text-amber-300" />
                    </span>
                    {t}
                  </motion.div>
                ),
              )}
            </div>
          </div>
          <p className="text-xs text-white/50">© {new Date().getFullYear()} HapticEV</p>
        </div>
      </aside>

      {/* ── Right: form ─────────────────────────────────────────────────── */}
      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          {/* Mode switch */}
          <div className="relative mb-8 grid grid-cols-2 rounded-full border border-line bg-ink-900 p-1">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`relative z-10 h-11 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  mode === m ? 'text-on-accent' : 'text-neutral-400 hover:text-bone'
                }`}
              >
                {mode === m && (
                  <motion.span
                    layoutId="auth-tab"
                    className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <h1 className="display-xl text-4xl">{mode === 'login' ? 'Welcome back' : 'Join HapticEV'}</h1>
              <p className="mt-2 text-sm text-neutral-400">
                {mode === 'login'
                  ? 'Sign in to book slots, track sessions and manage stations.'
                  : 'Pick your role. It only takes a moment.'}
              </p>

              <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
                {mode === 'register' && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {ROLES.map(({ value, label, icon: Icon }) => (
                        <button
                          type="button"
                          key={value}
                          onClick={() => setForm((f) => ({ ...f, role: value }))}
                          className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-[11px] font-semibold uppercase tracking-wider transition-all duration-300 ${
                            form.role === value
                              ? 'border-amber-400/60 bg-amber-500/10 text-bone shadow-[0_0_0_4px_rgba(245,173,63,0.12)]'
                              : 'border-line text-neutral-400 hover:border-line-2 hover:text-bone'
                          }`}
                        >
                          <Icon className={`size-5 ${form.role === value ? 'text-amber-300' : ''}`} />
                          {label}
                        </button>
                      ))}
                    </div>
                    <Field label="Full name" icon={User}>
                      <Input withIcon value={form.full_name} onChange={set('full_name')} placeholder="Ramesh Kumar" autoComplete="name" />
                    </Field>
                    <Field label="Phone" icon={Phone}>
                      <Input withIcon type="tel" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" autoComplete="tel" />
                    </Field>
                  </>
                )}

                {mode === 'register' ? (
                  <EmailVerification
                    email={form.email}
                    onEmailChange={(v) => setForm((f) => ({ ...f, email: v }))}
                    verified={!!verificationToken}
                    onVerified={setVerificationToken}
                    onReset={() => setVerificationToken('')}
                  />
                ) : (
                  <Field label="Email or username" icon={Mail}>
                    <Input
                      withIcon
                      required
                      type="text"
                      value={form.email}
                      onChange={set('email')}
                      placeholder="you@example.com"
                      autoComplete="username"
                    />
                  </Field>
                )}
                <Field label="Password" icon={Lock} hint={mode === 'register' ? 'At least 6 characters.' : undefined}>
                  <Input
                    withIcon
                    required
                    type="password"
                    value={form.password}
                    onChange={set('password')}
                    placeholder="••••••••"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </Field>

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  block
                  size="lg"
                  loading={loading}
                  disabled={
                    !form.email || !form.password || (mode === 'register' && !verificationToken)
                  }
                >
                  {mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight className="size-4" />
                </Button>
              </form>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
