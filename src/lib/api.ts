const TOKEN_KEY = "axiom.token";
const USER_KEY = "axiom.user";
const MOCK_USERS_KEY = "axiom.mockUsers";

export type User = {
  id: string;
  email: string;
  chips: number;
  createdAt: string;
  provider?: string;
  login?: string;
  name?: string;
  avatar?: string;
  githubId?: string;
};

export type AuthPayload = {
  token: string;
  user: User;
};

const isProd = import.meta.env.PROD;
const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const liveApi = Boolean(apiBase) || isProd;

export type HealthInfo = {
  ok: boolean;
  github?: boolean;
  match?: boolean;
  vercel?: boolean;
  ws?: string;
};

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch(`${apiBase}/api/health`);
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return (await res.json()) as HealthInfo;
}

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function readMockUsers(): Array<User & { password: string }> {
  try {
    return JSON.parse(localStorage.getItem(MOCK_USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeMockUsers(users: Array<User & { password: string }>) {
  localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
}

function mockToken(email: string) {
  return `mock.${btoa(unescape(encodeURIComponent(email)))}.${Date.now()}`;
}

function userFromJwt(token: string): User | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const pad = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(pad.padEnd(Math.ceil(pad.length / 4) * 4, "="));
    const payload = JSON.parse(json) as User & { id?: string };
    if (!payload.id) return null;
    return {
      id: payload.id,
      email: payload.email || "",
      chips: payload.chips ?? 1000,
      createdAt: payload.createdAt || new Date().toISOString(),
      provider: payload.provider,
      login: payload.login,
      name: payload.name,
      avatar: payload.avatar,
      githubId: payload.githubId,
    };
  } catch {
    return null;
  }
}

export const authApi = {
  live: liveApi,

  getStored(): AuthPayload | null {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(USER_KEY);
    if (!token || !raw) return null;
    try {
      return { token, user: JSON.parse(raw) as User };
    } catch {
      return null;
    }
  },

  persist(payload: AuthPayload) {
    localStorage.setItem(TOKEN_KEY, payload.token);
    localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  },

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  async register(email: string, password: string): Promise<{ needCode: boolean; hint?: string }> {
    if (apiBase) {
      return request("/api/auth/register", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, password }),
      });
    }
    const users = readMockUsers();
    if (users.some((u) => u.email === email)) throw new Error("That email is already registered");
    sessionStorage.setItem(
      "axiom.pending",
      JSON.stringify({ email, password, code: "000000" }),
    );
    return { needCode: true, hint: "Local code: 000000" };
  },

  async verify(email: string, code: string): Promise<AuthPayload> {
    if (apiBase) {
      return request("/api/auth/verify", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, code }),
      });
    }
    const pending = JSON.parse(sessionStorage.getItem("axiom.pending") || "null") as
      | { email: string; password: string; code: string }
      | null;
    if (!pending || pending.email !== email) throw new Error("No pending registration");
    if (code !== pending.code) throw new Error("Wrong code");
    const user: User = {
      id: `u_${Date.now()}`,
      email,
      chips: 1000,
      createdAt: new Date().toISOString(),
    };
    const users = readMockUsers();
    users.push({ ...user, password: pending.password });
    writeMockUsers(users);
    sessionStorage.removeItem("axiom.pending");
    return { token: mockToken(email), user };
  },

  async login(email: string, password: string): Promise<AuthPayload> {
    if (apiBase) {
      return request("/api/auth/login", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, password }),
      });
    }
    const users = readMockUsers();
    const found = users.find((u) => u.email === email && u.password === password);
    if (!found) throw new Error("Wrong email or password");
    const { password: _pw, ...user } = found;
    void _pw;
    return { token: mockToken(email), user };
  },

  async me(token: string): Promise<User> {
    if (liveApi) {
      try {
        const data = await request<{ user: User }>("/api/me", {
          method: "GET",
          headers: headers(token),
        });
        return data.user;
      } catch {
        const fromJwt = userFromJwt(token);
        if (fromJwt) return fromJwt;
        throw new Error("Not signed in");
      }
    }
    const stored = this.getStored();
    if (!stored || stored.token !== token) throw new Error("Not signed in");
    const users = readMockUsers();
    const found = users.find((u) => u.email === stored.user.email);
    if (!found) throw new Error("User not found");
    const { password: _pw, ...user } = found;
    void _pw;
    return user;
  },

  async updateChips(token: string, chips: number): Promise<User> {
    if (liveApi) {
      const data = await request<{ user: User }>("/api/me/chips", {
        method: "PATCH",
        headers: headers(token),
        body: JSON.stringify({ chips }),
      });
      return data.user;
    }
    const stored = this.getStored();
    if (!stored || stored.token !== token) throw new Error("Not signed in");
    const users = readMockUsers();
    const idx = users.findIndex((u) => u.email === stored.user.email);
    if (idx < 0) throw new Error("User not found");
    const current = users[idx];
    if (!current) throw new Error("User not found");
    current.chips = chips;
    writeMockUsers(users);
    const { password: _pw, ...user } = current;
    void _pw;
    return user;
  },

  githubStartUrl() {
    return liveApi ? `${apiBase}/api/auth/github/start` : "";
  },
};
