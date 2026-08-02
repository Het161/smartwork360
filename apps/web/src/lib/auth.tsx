'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role, UserDTO } from '@smartwork/shared';
import { api, setToken } from './api';

interface AuthValue {
  user: UserDTO | null;
  via: string;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<UserDTO>;
  signInParichay: (userId: string, otp: string) => Promise<UserDTO>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Landing route for each role. */
export const HOME_FOR: Record<Role, string> = {
  EMPLOYEE: '/e/dashboard',
  MANAGER: '/m/dashboard',
  ADMIN: '/a/overview',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [via, setVia] = useState('password');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const hydrate = useCallback(async () => {
    try {
      const res = await api.me();
      setUser(res.user);
      setVia(res.via);
    } catch {
      // No valid access token and no usable refresh cookie — stay signed out.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.accessToken);
    setUser(res.user);
    setVia('password');
    return res.user;
  }, []);

  const signInParichay = useCallback(async (userId: string, otp: string) => {
    const res = await api.parichay(userId, otp);
    setToken(res.accessToken);
    setUser(res.user);
    setVia('parichay');
    return res.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* clearing local state matters more than the server round-trip */
    }
    setToken(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo<AuthValue>(
    () => ({ user, via, loading, signIn, signInParichay, signOut, refresh: hydrate }),
    [user, via, loading, signIn, signInParichay, signOut, hydrate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Route guard. Redirects to /login when signed out, and to the caller's own home
 * when their role does not match the section they landed on.
 */
export function useRequireRole(...roles: Role[]) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (roles.length && !roles.includes(user.role)) {
      router.replace(HOME_FOR[user.role]);
    }
  }, [user, loading, roles, router]);

  return { user, loading };
}
