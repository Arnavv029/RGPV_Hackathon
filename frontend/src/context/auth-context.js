import { createContext } from 'react';

/**
 * The context object lives in its own module on purpose.
 *
 * Vite's Fast Refresh replaces a module when it changes, and a file that
 * exports both a component (<AuthProvider>) and a context would hand consumers
 * a *new* context object while the mounted provider still holds the old one —
 * which surfaces as "useAuth must be used inside <AuthProvider>" after an edit.
 * Keeping the context here means its identity is stable across hot updates.
 */
export const AuthContext = createContext(null);

/** Where each role belongs after signing in. */
export const HOME_FOR_ROLE = {
  owner: '/owner',
  mechanic: '/mechanic',
  user: '/app',
};
