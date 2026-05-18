import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth as useClerkAuth, useClerk, useOrganization, useOrganizationList } from '@clerk/clerk-react';
import { apiUrl } from '@/lib/api';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
  permissions?: string[];
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True while the active Clerk org is being resolved / auto-selected. */
  orgLoading: boolean;
  /** The active Clerk organization id (org_…), or null if none active yet. */
  activeOrgId: string | null;
  /** Clerk sign-in is fully resolved and there is no organization to switch to. */
  noOrgAvailable: boolean;
  /** Clerk owns the login UI now. This is a no-op kept for source compatibility. */
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  /** Always returns a fresh Clerk session token. Prefer this over `token` for mutating requests. */
  getFreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_REFRESH_MS = 30_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, userId } = useClerkAuth();
  const { signOut, setActive } = useClerk();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { userMemberships, isLoaded: listLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [autoSelectDone, setAutoSelectDone] = useState(false);

  // ── Org auto-selection ──────────────────────────────────────────────────────
  // When a user signs in but no org is active, silently pick their first org.
  // This covers: single-org users, and new users who just joined via Clerk invite.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!orgLoaded || !listLoaded) return;
    if (organization) {
      // Org already active — nothing to do.
      setAutoSelectDone(true);
      return;
    }
    const memberships = userMemberships?.data ?? [];
    if (memberships.length === 0) {
      // User has no orgs — can't auto-select. Surface the error in ProtectedLayout.
      setAutoSelectDone(true);
      return;
    }
    // Auto-select the first (or only) org.
    const first = memberships[0].organization;
    setActive({ organization: first.id }).then(() => {
      setAutoSelectDone(true);
    }).catch(() => {
      setAutoSelectDone(true);
    });
  }, [isLoaded, isSignedIn, orgLoaded, listLoaded, organization, userMemberships, setActive]);

  // ── Token refresh ───────────────────────────────────────────────────────────
  // Keep a fresh-ish Clerk token in state. Refresh whenever org changes so the
  // new JWT contains the updated org_id claim.
  const activeOrgId = organization?.id ?? null;
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setToken(null);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const t = await getToken();
        if (!cancelled) setToken(t);
      } catch {
        if (!cancelled) setToken(null);
      }
    };
    refresh();
    const id = setInterval(refresh, TOKEN_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isLoaded, isSignedIn, getToken, activeOrgId]); // re-run when org changes

  // ── /api/auth/me ────────────────────────────────────────────────────────────
  // Load the local user profile (role, permissions) from /api/auth/me as soon
  // as we have a Clerk token that includes an org_id claim.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !token || !activeOrgId) {
      setUser(null);
      return;
    }
    let cancelled = false;
    setMeLoading(true);
    fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.user) setUser(data.user as AuthUser);
        else setUser(null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setMeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, token, userId, activeOrgId]);

  const login = useCallback(async () => {
    return {
      ok: false,
      error: 'Sign in via Clerk at /sign-in. Email + password is no longer accepted by this endpoint.',
    };
  }, []);

  const logout = useCallback(() => {
    signOut({ redirectUrl: '/sign-in' });
  }, [signOut]);

  const getFreshToken = useCallback(async () => {
    try {
      return await getToken();
    } catch {
      return null;
    }
  }, [getToken]);

  const orgLoading = !orgLoaded || !listLoaded || (!organization && !autoSelectDone);
  const noOrgAvailable = autoSelectDone && !organization && (userMemberships?.data?.length ?? 0) === 0;

  const value: AuthContextValue = {
    token,
    user,
    isAuthenticated: !!isSignedIn && !!user,
    isLoading: !isLoaded || meLoading || orgLoading,
    orgLoading,
    activeOrgId,
    noOrgAvailable,
    login,
    logout,
    getFreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
