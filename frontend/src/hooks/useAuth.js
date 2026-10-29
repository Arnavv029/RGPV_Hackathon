import { useContext } from 'react';
import { AuthContext } from '@/context/auth-context';

/** Access the signed-in user, role and auth actions. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
