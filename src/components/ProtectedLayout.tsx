import { Navigate, Outlet } from 'react-router-dom';
import { useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
import { useAuth } from '@/context/AuthContext';

/**
 * Three states matter here:
 *   1) Clerk + /me still resolving → loading screen
 *   2) Clerk says signed-out → /sign-in
 *   3) Clerk signed-in but no local user row → explicit error (NOT /sign-in,
 *      because Clerk would just redirect right back to / and we'd loop)
 */
export function ProtectedLayout() {
  const { user, isLoading } = useAuth();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();

  if (isLoading || !isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] px-4">
        <div className="max-w-md w-full rounded-xl border border-[#2A2A2A] bg-[#121212] p-8 text-center">
          <h1 className="text-xl font-semibold text-white mb-3">No QMS account linked</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            Your sign-in succeeded, but this Clerk identity isn&apos;t linked to a QMS user.
            An administrator needs to invite you (the QMS user&apos;s email must match the
            email on your Clerk account).
          </p>
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
            className="mt-6 h-10 px-4 rounded-md bg-[#007AFF] hover:bg-[#0056B3] text-white text-sm font-medium"
          >
            Sign out and use a different account
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
