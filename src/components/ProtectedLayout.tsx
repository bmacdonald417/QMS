import { Navigate, Outlet } from 'react-router-dom';
import { useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div
              className="brand-mark-chip mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5"
              aria-hidden
            >
              <ShieldAlert />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-3">
              No QMS account linked
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your sign-in succeeded, but this Clerk identity isn&apos;t linked to a QMS user.
              An administrator needs to invite you (the QMS user&apos;s email must match the
              email on your Clerk account).
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => signOut({ redirectUrl: '/sign-in' })}
            >
              Sign out and use a different account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
