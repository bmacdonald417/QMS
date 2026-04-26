import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

/**
 * Gates the app behind a Clerk session. Renders the child routes once we
 * have both a Clerk session and a resolved local user profile.
 */
export function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-gray-400 text-sm">
        Loading…
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace />;
  }
  return <Outlet />;
}
