import { Link } from 'react-router-dom';

/**
 * Wordmark lockup. Deliberately type-only — no icon — so the brand reads the
 * same at any size and never competes with the amber accent used for actions.
 */
export default function Logo({ to = '/', className = '' }) {
  return (
    <Link
      to={to}
      aria-label="HapticEV — home"
      className={`group inline-flex items-baseline gap-[1px] ${className}`}
    >
      <span className="font-display text-[17px] font-bold uppercase leading-none tracking-[0.16em] text-bone transition-colors duration-300">
        Haptic
      </span>
      <span className="font-display text-[17px] font-bold uppercase leading-none tracking-[0.16em] text-amber-300 transition-colors duration-300">
        EV
      </span>
      <span className="ml-0.5 size-1.5 shrink-0 rounded-full bg-amber-400 transition-transform duration-500 group-hover:scale-150" />
    </Link>
  );
}
