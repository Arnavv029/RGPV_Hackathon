import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import Button from './Button';
import { Counter } from '@/components/motion/Reveal';

/** Charging-bar loader — three bars filling in sequence. */
export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-20 ${className}`}>
      <div className="flex items-end gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-2 rounded-full bg-amber-400"
            animate={{ height: [10, 28, 10], opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</span>
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-shimmer rounded-2xl bg-[length:800px_100%] ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 100%)',
      }}
    />
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="glass flex flex-col items-center rounded-3xl px-6 py-20 text-center"
    >
      {Icon && (
        <div className="relative mb-6">
          <span className="absolute inset-0 animate-halo rounded-2xl bg-amber-400/20 blur-xl" />
          <div className="relative grid size-16 place-items-center rounded-2xl border border-amber-400/25 bg-amber-400/10">
            <Icon className="size-7 text-amber-300" />
          </div>
        </div>
      )}
      <h3 className="text-xl uppercase">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-8">{action}</div>}
    </motion.div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="glass flex flex-col items-center rounded-3xl px-6 py-16 text-center">
      <AlertTriangle className="mb-4 size-8 text-rose-300" />
      <p className="max-w-md text-sm text-neutral-300">{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

const ACCENTS = {
  amber: 'text-amber-300 bg-amber-400/10 border-amber-400/25',
  sky: 'text-sky-300 bg-sky-500/10 border-sky-500/25',
  mint: 'text-mint-300 bg-mint-500/10 border-mint-500/25',
  rose: 'text-rose-300 bg-rose-500/10 border-rose-500/25',
};

/**
 * Metric tile. Whole-number values count up on first view; anything else
 * (currency strings, labels) renders as-is.
 */
export function StatCard({ icon: Icon, label, value, accent = 'amber', delay = 0, prefix = '', suffix = '' }) {
  const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value));
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="glass group relative overflow-hidden rounded-3xl p-5 transition-colors duration-300 hover:border-line-2"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-amber-400/5 blur-2xl transition-all duration-500 group-hover:bg-amber-400/15" />
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{label}</span>
        {Icon && (
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl border ${ACCENTS[accent]}`}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="relative mt-4 truncate font-display text-3xl font-bold text-bone sm:text-4xl">
        {numeric ? <Counter value={Number(value)} prefix={prefix} suffix={suffix} /> : value}
      </div>
    </motion.div>
  );
}
