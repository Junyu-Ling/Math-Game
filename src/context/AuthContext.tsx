import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, type User } from "../lib/api";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  live: boolean;
  login: (email: string, password: string) => Promise<void>;
  requestEmailCode: (email: string) => Promise<{ needCode: boolean; hint?: string }>;
  loginWithCode: (email: string, code: string) => Promise<void>;
  register: (email: string, password: string) => Promise<{ needCode: boolean; hint?: string }>;
  verify: (email: string, code: string) => Promise<void>;
  logout: () => void;
  acceptToken: (token: string) => Promise<void>;
  setChips: (chips: number) => Promise<void>;
  githubStartUrl: string;
  googleStartUrl: string;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = authApi.getStored();
    if (!stored) {
      setLoading(false);
      return;
    }
    authApi
      .me(stored.token)
      .then((u) => {
        setUser(u);
        setToken(stored.token);
        authApi.persist({ token: stored.token, user: u });
      })
      .catch(() => authApi.clear())
      .finally(() => setLoading(false));
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
