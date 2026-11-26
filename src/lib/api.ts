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
  gender?: "" | "male" | "female" | "private";
  githubId?: string;
  googleId?: string;
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

/** Round-trip to the API, in milliseconds. Throws when the network or the server is down. */
export async function pingServer(ms = 4000): Promise<number> {
  const started = performance.now();
  const res = await fetch(`${apiBase}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error("down");
  return Math.round(performance.now() - started);
}

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export class AuthInvalid extends Error {
  status = 401;
  constructor() {
    super("Not signed in");
    this.name = "AuthInvalid";
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function requestSignal(ms: number, parent?: AbortSignal | null): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" && !parent) {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  parent?.addEventListener("abort", () => ctrl.abort(), { once: true });
  ctrl.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return ctrl.signal;
}

async function request<T>(path: string, init: RequestInit, ms = 12000): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, { ...init, signal: init.signal || requestSignal(ms) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new HttpError(res.status, data.error || `Request failed (${res.status})`);
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

function jwtPayload(token: string): (User & { exp?: number }) | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const pad = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(pad.padEnd(Math.ceil(pad.length / 4) * 4, "="));
    return JSON.parse(json) as User & { exp?: number };
  } catch {
    return null;
  }
}

function userFromJwt(token: string): User | null {
  const payload = jwtPayload(token);
  if (!payload?.id) return null;
  return {
    id: String(payload.id),
    email: payload.email || "",
    chips: payload.chips ?? 1000,
    createdAt: payload.createdAt || new Date().toISOString(),
    provider: payload.provider,
    login: payload.login,
    name: payload.name,
    avatar: payload.avatar,
    gender: payload.gender === "male" || payload.gender === "female" || payload.gender === "private" ? payload.gender : "",
    githubId: payload.githubId,
    googleId: payload.googleId,
  };
}

/** A token we can still trust locally. Expired or garbage tokens are not. */
function jwtUsable(token: string): boolean {
  const payload = jwtPayload(token);
  if (!payload?.id) return false;
  if (payload.exp && payload.exp * 1000 < Date.now() - 30_000) return false;
  return true;
}

export const authApi = {
  live: liveApi,

  getStored(): AuthPayload | null {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    let user: User | null = null;
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      try {
        user = JSON.parse(raw) as User;
      } catch {
        user = null;
      }
    }
    if (!user?.id) user = userFromJwt(token);
    if (!user?.id || !jwtUsable(token)) return null;
    return { token, user: { ...user, id: String(user.id) } };
  },

  persist(payload: AuthPayload) {
    localStorage.setItem(TOKEN_KEY, payload.token);
    localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  },

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  async register(email: string, password: string): Promise<{ needCode: boolean; hint?: string; cooldownSec?: number }> {
    if (liveApi) {
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
    return { needCode: true, hint: "Local code: 000000", cooldownSec: 60 };
  },

  async verify(email: string, code: string): Promise<AuthPayload> {
    if (liveApi) {
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

  async requestEmailCode(email: string): Promise<{ needCode: boolean; hint?: string; cooldownSec?: number }> {
    if (liveApi) {
      return request("/api/auth/email-code", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email }),
      });
    }
    sessionStorage.setItem("axiom.loginCode", JSON.stringify({ email, code: "000000" }));
    return { needCode: true, hint: "Local code: 000000", cooldownSec: 60 };
  },

  async loginWithCode(email: string, code: string): Promise<AuthPayload> {
    if (liveApi) {
      return request("/api/auth/email-login", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, code }),
      });
    }
    const pending = JSON.parse(sessionStorage.getItem("axiom.loginCode") || "null") as
      | { email: string; code: string }
      | null;
    if (!pending || pending.email !== email) throw new Error("No code requested");
    if (code !== pending.code) throw new Error("Wrong code");
    const users = readMockUsers();
    let found = users.find((u) => u.email === email);
    if (!found) {
      found = {
        id: `u_${Date.now()}`,
        email,
        chips: 1000,
        createdAt: new Date().toISOString(),
        provider: "email",
        name: email.split("@")[0],
        password: "",
      };
      users.push(found);
      writeMockUsers(users);
    }
    sessionStorage.removeItem("axiom.loginCode");
    const { password: _pw, ...user } = found;
    void _pw;
    return { token: mockToken(email), user };
  },

  async login(email: string, password: string): Promise<AuthPayload> {
    if (liveApi) {
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
        const data = await request<{ user: User; token?: string }>("/api/me", {
          method: "GET",
          headers: headers(token),
        });
        const user = data.user?.id ? { ...data.user, id: String(data.user.id) } : userFromJwt(token);
        if (!user?.id) throw new AuthInvalid();
        if (data.token && data.token !== token) this.persist({ token: data.token, user });
        return user;
      } catch (err) {
        // A slow or dropped /api/me used to wipe the session. Keep it unless the token itself is dead.
        const rejected = err instanceof HttpError && err.status === 401;
        const cached = userFromJwt(token);
        if (cached && jwtUsable(token)) return cached;
        if (rejected || !jwtUsable(token)) throw new AuthInvalid();
        throw err;
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

  async updateProfile(
    token: string,
    patch: { name?: string; avatar?: string; gender?: User["gender"] },
  ): Promise<AuthPayload> {
    if (liveApi) {
      return request("/api/profile", {
        method: "PATCH",
        headers: headers(token),
        body: JSON.stringify(patch),
      });
    }
    const stored = this.getStored();
    if (!stored || stored.token !== token) throw new Error("Not signed in");
    const users = readMockUsers();
    const idx = users.findIndex((u) => u.email === stored.user.email);
    if (idx < 0) throw new Error("User not found");
    const current = users[idx];
    if (!current) throw new Error("User not found");
    if (patch.name != null) {
      const name = patch.name.replace(/\s+/g, " ").trim();
      if (name.length < 1 || name.length > 24) throw new Error("Name must be 1 to 24 characters");
      current.name = name;
    }
    if (patch.gender != null) current.gender = patch.gender;
    if (patch.avatar != null) current.avatar = patch.avatar;
    writeMockUsers(users);
    const { password: _pw, ...user } = current;
    void _pw;
    return { token, user };
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

  googleStartUrl() {
    return liveApi ? `${apiBase}/api/auth/google/start` : "";
  },
};
