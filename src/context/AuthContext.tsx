import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';
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
  const { signOut } = useClerk();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [meLoading, setMeLoading] = useState(false);

  // Keep a fresh-ish Clerk token in state so existing call sites that read
  // `auth.token` synchronously continue to work. Clerk session tokens are
  // short-lived JWTs; a 30s refresh keeps them valid for typical flows.
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
  }, [isLoaded, isSignedIn, getToken]);

  // Load the local user profile (role, permissions) from /api/auth/me as soon
  // as we have a Clerk token. The local DB is the source of truth for role.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !token) {
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
  }, [isLoaded, isSignedIn, token, userId]);

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

  const value: AuthContextValue = {
    token,
    user,
    isAuthenticated: !!isSignedIn && !!user,
    isLoading: !isLoaded || meLoading,
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
