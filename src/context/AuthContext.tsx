import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

const STORAGE_KEY = 'qms_auth';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStored(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    const data = JSON.parse(raw) as AuthState;
    if (data.token && data.user) return data;
  } catch {
    // ignore
  }
  return { token: null, user: null };
}

function saveStored(state: AuthState) {
  if (state.token && state.user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadStored);

  useEffect(() => {
    saveStored(state);
  }, [state.token, state.user]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || 'Login failed' };
      }
      setState({ token: data.token, user: data.user });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: 'Network error' };
    }
  }, []);

  const logout = useCallback(() => {
    setState({ token: null, user: null });
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    isAuthenticated: !!(state.token && state.user),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
