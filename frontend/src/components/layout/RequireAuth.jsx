import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/Feedback';

/**
 * Route guard. Unauthenticated visitors go to /login (and come back after);
 * signed-in users on the wrong role's area are sent to their own home.
 */
export default function RequireAuth({ roles }) {
  const { isAuthenticated, role, homePath, booting } = useAuth();
  const location = useLocation();

  if (booting && !isAuthenticated) return <Spinner label="Checking your session…" className="min-h-[60vh]" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(role)) {
    return <Navigate to={homePath} replace />;
  }
  return <Outlet />;
}
