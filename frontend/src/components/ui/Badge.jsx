import { STATUS_TONE } from '@/lib/format';

/** Pill label. Pass `status` for booking/request states, or a custom `tone`. */
export default function Badge({ tone, status, className = '', children }) {
  const toneCls = status
    ? STATUS_TONE[status] || STATUS_TONE.cancelled
    : tone || 'text-neutral-300 bg-hover border-line';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${toneCls} ${className}`}
    >
      {status && <span className="size-1.5 rounded-full bg-current" />}
      {children ?? status}
    </span>
  );
}
