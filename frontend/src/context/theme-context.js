import { createContext } from 'react';

/** Kept in its own module so its identity survives Vite hot updates. */
export const ThemeContext = createContext(null);

export const THEME_KEY = 'hev_theme';

/** Bright by default — the light theme is the product's primary look. */
export const DEFAULT_THEME = 'light';

/** Reads the stored choice, falling back to the default. */
export function readStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' || saved === 'light' ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
