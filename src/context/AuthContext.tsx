import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthInvalid, authApi, type User } from "../lib/api";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  live: boolean;
  login: (email: string, password: string) => Promise<void>;
  requestEmailCode: (email: string) => Promise<{ needCode: boolean; hint?: string; cooldownSec?: number }>;
  loginWithCode: (email: string, code: string) => Promise<void>;
  register: (email: string, password: string) => Promise<{ needCode: boolean; hint?: string; cooldownSec?: number }>;
  verify: (email: string, code: string) => Promise<void>;
  logout: () => void;
  acceptToken: (token: string) => Promise<void>;
  setChips: (chips: number) => Promise<void>;
  githubStartUrl: string;
  googleStartUrl: string;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = authApi.getStored();
  const [user, setUser] = useState<User | null>(stored?.user ?? null);
  const [token, setToken] = useState<string | null>(stored?.token ?? null);
  const [loading, setLoading] = useState(Boolean(stored));

  useEffect(() => {
    const snap = authApi.getStored();
    if (!snap) {
      setLoading(false);
      return;
    }
    let cancel = false;
    authApi
      .me(snap.token)
      .then((u) => {
        if (cancel) return;
        const nextToken = authApi.getStored()?.token || snap.token;
        setUser(u);
        setToken(nextToken);
        authApi.persist({ token: nextToken, user: u });
      })
      .catch((err) => {
        if (cancel) return;
        // Only a dead token logs the player out. A slow or failed refresh keeps the saved session.
        if (!(err instanceof AuthInvalid)) return;
        if (authApi.getStored()?.token !== snap.token) return;
        authApi.clear();
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      loading,
      live: authApi.live,
      async login(email, password) {
        const payload = await authApi.login(email, password);
        authApi.persist(payload);
        setUser(payload.user);
        setToken(payload.token);
      },
      requestEmailCode: (email) => authApi.requestEmailCode(email),
      async loginWithCode(email, code) {
        const payload = await authApi.loginWithCode(email, code);
        authApi.persist(payload);
        setUser(payload.user);
        setToken(payload.token);
      },
      register: (email, password) => authApi.register(email, password),
      async verify(email, code) {
        const payload = await authApi.verify(email, code);
        authApi.persist(payload);
        setUser(payload.user);
        setToken(payload.token);
      },
      logout() {
        authApi.clear();
        setUser(null);
        setToken(null);
      },
      async acceptToken(nextToken: string) {
        const u = await authApi.me(nextToken);
        authApi.persist({ token: nextToken, user: u });
        setUser(u);
        setToken(nextToken);
      },
      githubStartUrl: authApi.githubStartUrl(),
      googleStartUrl: authApi.googleStartUrl(),
      async setChips(chips) {
        if (!token) return;
        const next = await authApi.updateChips(token, chips);
        setUser(next);
        authApi.persist({ token, user: next });
      },
    }),
    [user, token, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
