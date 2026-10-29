import { useCallback, useEffect, useMemo, useState } from 'react';
import { endpoints, onUnauthorized, session } from '@/lib/api';
import { AuthContext, HOME_FOR_ROLE } from './auth-context';

export { HOME_FOR_ROLE };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => session.getUser());
  const [booting, setBooting] = useState(true);

  const logout = useCallback(() => {
    session.clear();
    setUser(null);
  }, []);

  // Backend rejected the token anywhere in the app -> drop the session once.
  useEffect(() => onUnauthorized(() => setUser(null)), []);

  // Revalidate the cached profile against the server on first paint.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!session.getAccess()) {
        setBooting(false);
        return;
      }
      try {
        const fresh = await endpoints.me();
        if (!alive) return;
        session.saveUser(fresh);
        setUser(fresh);
      } catch {
        /* onUnauthorized already cleared the session when it was a 401 */
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await endpoints.login(credentials);
    const tokens = data.tokens || { access: data.access, refresh: data.refresh };
    session.save(tokens, data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await endpoints.register(payload);
    // Some deployments return tokens on register, others expect a follow-up login.
    const tokens = data.tokens || (data.access ? { access: data.access, refresh: data.refresh } : null);
    if (tokens?.access) {
      session.save(tokens, data.user);
      setUser(data.user);
      return data.user;
    }
    return null;
  }, []);

  const value = useMemo(
    () => ({
      user,
      booting,
      login,
      register,
      logout,
      isAuthenticated: !!user,
      role: user?.role || null,
      homePath: HOME_FOR_ROLE[user?.role] || '/app',
    }),
    [user, booting, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
