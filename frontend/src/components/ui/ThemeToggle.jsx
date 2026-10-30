import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

/**
 * Sun/moon switch. The icon swaps with a rotate-and-scale cross-fade and the
 * knob slides, so the control itself reads as a physical toggle.
 */
export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className={`group relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-line-2 text-neutral-400 transition-colors duration-300 hover:border-amber-400/50 hover:text-amber-500 ${className}`}
    >
      <span className="absolute inset-0 scale-0 rounded-full bg-amber-400/10 transition-transform duration-300 group-hover:scale-100" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/** Labelled variant for the mobile menu, where a bare icon reads as ambiguous. */
export function ThemeToggleRow() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center justify-between rounded-2xl border border-line px-5 py-4 text-left"
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-400">Appearance</span>
      <span className="flex items-center gap-2 text-sm font-semibold text-bone">
        {isDark ? <Moon className="size-4 text-amber-300" /> : <Sun className="size-4 text-amber-500" />}
        {isDark ? 'Dark' : 'Light'}
      </span>
    </button>
  );
}
