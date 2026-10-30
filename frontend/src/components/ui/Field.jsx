import { forwardRef } from 'react';

const base =
  'w-full rounded-2xl bg-ink-900 border border-line px-4 h-12 text-sm text-bone placeholder:text-neutral-600 ' +
  'transition duration-300 focus:outline-none focus:border-amber-400/70 focus:bg-ink-850 focus:ring-4 focus:ring-amber-400/10 disabled:opacity-60';

/** Label + control + hint/error, so every form lines up the same way. */
export function Field({ label, hint, error, icon: Icon, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          {label}
        </span>
      )}
      <span className="relative block">
        {Icon && (
          <Icon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-600" />
        )}
        {children}
      </span>
      {error ? (
        <span className="mt-2 block text-xs text-rose-300">{error}</span>
      ) : hint ? (
        <span className="mt-2 block text-xs text-neutral-600">{hint}</span>
      ) : null}
    </label>
  );
}

export const Input = forwardRef(function Input({ className = '', withIcon, ...rest }, ref) {
  return <input ref={ref} className={`${base} ${withIcon ? 'pl-11' : ''} ${className}`} {...rest} />;
});

export const Select = forwardRef(function Select({ className = '', children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${base} cursor-pointer appearance-none ${className}`} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`${base} h-auto min-h-28 py-3.5 ${className}`} {...rest} />;
});
