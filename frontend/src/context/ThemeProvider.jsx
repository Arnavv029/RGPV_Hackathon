import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_THEME, readStoredTheme, THEME_KEY, ThemeContext } from './theme-context';

/**
 * Light/dark theming.
 *
 * The whole palette is CSS variables (see index.css), so switching themes is
 * just a `data-theme` attribute on <html> — no per-component class juggling.
 * The initial value is also applied by an inline script in index.html so the
 * first paint never flashes the wrong theme.
 */
export default function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.dataset.theme || readStoredTheme()
      : DEFAULT_THEME,
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* private mode — the theme just won't persist */
    }
  }, [theme]);

  const setTheme = useCallback((next) => setThemeState(next === 'dark' ? 'dark' : 'light'), []);
  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, isDark: theme === 'dark' }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
