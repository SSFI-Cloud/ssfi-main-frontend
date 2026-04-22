'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api/client'; // Assuming api export exists in client.ts
import { UserRole } from '@/types/dashboard';

interface User {
    id: string;
    uid: string;
    role: UserRole;
    email?: string;
    phone: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    profile_photo?: string;
    // Add other fields as needed
}

export const useAuth = () => {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [token, setToken] = useState<string | null>(null);
    const router = useRouter();
    const pathname = usePathname();

    // D3 Phase 2 auth verification.
    //
    // Previously this function checked `accessToken` in localStorage as the
    // sole truth. That meant (a) the token was JS-readable and exfiltrable
    // via any XSS, (b) a valid HttpOnly session would be missed if the
    // localStorage cache was cleared.
    //
    // New flow:
    //   1. Read the cached user display from localStorage for instant UI
    //      (first-paint latency matters; hitting /auth/me on every mount
    //      would flash an unauthenticated state).
    //   2. Regardless of the cache outcome, do a background /auth/me hit.
    //      The cookie-backed session is validated server-side and the
    //      response is the new source of truth for user data.
    //   3. If /auth/me 200s, reconcile: update the user cache.
    //      If it 401s, clear everything — cache + any legacy localStorage
    //      token — and render unauthenticated.
    //
    // This means even if localStorage is completely empty (fresh browser,
    // cookie still valid from a previous session), we recover the session
    // via the cookie alone. Conversely, a stolen localStorage cache with
    // no matching cookie can't forge a session — the /auth/me check
    // rejects it.
    const verifyAuth = useCallback(async () => {
        try {
            const legacyToken = localStorage.getItem('accessToken');
            const storedUser = localStorage.getItem('user');

            // 1. Optimistic hydration from cache — purely for instant UI.
            if (storedUser) {
                try {
                    setUser(JSON.parse(storedUser));
                    setIsAuthenticated(true);
                    if (legacyToken) setToken(legacyToken);
                } catch {
                    localStorage.removeItem('user');
                    localStorage.removeItem('accessToken');
                }
            }

            // 2. Authoritative check. Relies on the HttpOnly cookie being
            //    sent automatically via axios `withCredentials: true`. If
            //    the server says we're logged in, use that response; if it
            //    says 401, we're not — doesn't matter what localStorage said.
            try {
                const me = await api.get<User>('/auth/me');
                const freshUser = (me.data as any)?.data ?? me.data;
                if (freshUser) {
                    setUser(freshUser);
                    setIsAuthenticated(true);
                    // Update display cache only — token stays out of JS.
                    localStorage.setItem('user', JSON.stringify(freshUser));
                }
            } catch (meErr: any) {
                // 401 means the cookie session is dead. Drop everything —
                // legacy accessToken included — so the next request doesn't
                // ride a stale Bearer header into another 401.
                if (meErr?.response?.status === 401) {
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('user');
                    setUser(null);
                    setToken(null);
                    setIsAuthenticated(false);
                }
                // Network errors: leave the cached state in place; user
                // keeps seeing the dashboard until the network recovers.
            }
        } catch (error) {
            console.error('Auth verification failed', error);
            setIsAuthenticated(false);
            setUser(null);
            setToken(null);
            localStorage.removeItem('accessToken');
            localStorage.removeItem('user');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        verifyAuth();
    }, [verifyAuth]);

    // D3 Phase 2: the `accessToken` argument is kept in the signature for
    // source compatibility with the login page and any tests, but we no
    // longer persist it. The HttpOnly cookie set by the backend is the
    // only authoritative credential. Only the user's display data is
    // cached locally — losing that cache just triggers an /auth/me
    // round-trip, it doesn't log anyone out.
    const login = async (_accessToken: string, userData: User) => {
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        setIsAuthenticated(true);
        toast.success('Logged in successfully');
        router.push('/dashboard');
    };

    const logout = async () => {
        // Tell the backend to clear both HttpOnly cookies (accessToken +
        // refreshToken). Fire-and-continue so a network blip doesn't
        // strand the user on a logged-in UI.
        try {
            await api.post('/auth/logout');
        } catch {
            // Best-effort — even if the call fails, still clear local state.
        }
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('renewal-banner-dismissed');
        // Clear any registration draft data
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('registration-') || key.startsWith('reg-draft-'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        setUser(null);
        setToken(null);
        setIsAuthenticated(false);
        toast.success('Logged out successfully');
        router.push('/auth/login');
    };

    return {
        user,
        token,
        isAuthenticated,
        isLoading,
        login,
        logout,
        refreshAuth: verifyAuth
    };
};
