import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/**
 * Pill buttons, matching the design system: a solid bone pill for the primary
 * action, amber for accent moments, and hairline outlines for everything else.
 */
const VARIANTS = {
  primary: 'bg-bone text-ink-950 shadow-lg shadow-bone/20 hover:opacity-90',
  accent:
    'bg-amber-400 text-on-accent hover:bg-amber-300 shadow-[0_12px_34px_-12px_rgba(245,173,63,0.85)]',
  secondary: 'border border-line-2 bg-hover text-bone hover:border-line-2 hover:bg-hover-2',
  ghost: 'text-neutral-300 hover:bg-hover-2 hover:text-bone',
  danger: 'border border-rose-500/35 bg-rose-500/12 text-rose-300 hover:bg-rose-500/22',
  sky: 'bg-sky-500 text-white hover:bg-sky-400 shadow-[0_12px_34px_-14px_rgba(14,165,233,0.9)]',
};

const SIZES = {
  sm: 'h-9 px-4 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-14 px-8 text-[15px] gap-2.5',
};

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    block,
    caps = false,
    to,
    className = '',
    children,
    disabled,
    ...rest
  },
  ref,
) {
  const cls = [
    'group/btn relative inline-flex items-center justify-center overflow-hidden rounded-full font-semibold',
    'whitespace-nowrap transition-all duration-300 select-none cursor-pointer',
    'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
    caps ? 'uppercase tracking-[0.14em] text-[11px]' : '',
    VARIANTS[variant],
    SIZES[size],
    block ? 'w-full' : '',
    className,
  ].join(' ');

  const content = (
    <>
      {/* Sheen that sweeps across on hover */}
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full" />
      <span className="relative inline-flex items-center justify-center gap-2">
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
      </span>
    </>
  );

  if (to) {
    return (
      <Link ref={ref} to={to} className={cls} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
});

export default Button;
