import { useContext } from 'react';
import { ThemeContext } from '@/context/theme-context';

/** Current theme plus setters. Safe to call anywhere under <ThemeProvider>. */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
