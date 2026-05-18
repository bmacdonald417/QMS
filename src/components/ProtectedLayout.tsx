import { Navigate, Outlet } from 'react-router-dom';
import { useAuth as useClerkAuth, useClerk, useOrganizationList, OrganizationSwitcher } from '@clerk/clerk-react';
import { ShieldAlert, Building2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Four states matter here:
 *   1) Clerk + /me still resolving → loading screen
 *   2) Clerk says signed-out → /sign-in
 *   3) Signed in, no active org (and has orgs) → org switcher
 *   4) Signed in, no org, no memberships → error (not a member of any org)
 *   5) Signed in + org active, but no local user row → explicit error
 *   6) All good → render children
 */
export function ProtectedLayout() {
  const { user, isLoading, orgLoading, activeOrgId, noOrgAvailable } = useAuth();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const { userMemberships } = useOrganizationList({ userMemberships: { infinite: true } });

  // Still resolving Clerk session, org selection, or /me
  if (isLoading || !isLoaded || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  // Signed in but no org available (user isn't in any Clerk org)
  if (noOrgAvailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div
              className="brand-mark-chip mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5"
              aria-hidden
            >
              <Building2 />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-3">
              No organization found
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your account isn&apos;t a member of any organization. Contact your administrator
              to be added to your company&apos;s QMS organization.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => signOut({ redirectUrl: '/sign-in' })}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Signed in, has orgs, but none is currently active — show org switcher.
  // (Auto-selection is still in progress or user has multiple orgs and needs to pick.)
  if (!activeOrgId) {
    const memberships = userMemberships?.data ?? [];
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div
              className="brand-mark-chip mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5"
              aria-hidden
            >
              <Building2 />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-3">
              Select your organization
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {memberships.length > 1
                ? 'You belong to multiple organizations. Select the one you want to access.'
                : 'Please select your organization to continue.'}
            </p>
            <div className="flex justify-center">
              <OrganizationSwitcher
                hidePersonal
                afterSelectOrganizationUrl="/"
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    organizationSwitcherTrigger: 'w-full justify-between border rounded-md px-3 py-2 text-sm',
                  },
                }}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 text-muted-foreground"
              onClick={() => signOut({ redirectUrl: '/sign-in' })}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Org is active but no local QMS user row linked
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
