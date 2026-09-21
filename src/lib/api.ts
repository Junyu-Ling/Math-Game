import { VIRTUAL_USERS } from "./virtual";

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

export type HealthInfo = {
  ok: boolean;
  github?: boolean;
  match?: boolean;
  vercel?: boolean;
  ws?: string;
};

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch(`${apiBase}/api/health`);
  if (!res.ok) throw new Error(`健康检查失败 (${res.status})`);
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
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
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

function ensureVirtualMockUsers() {
  const users = readMockUsers();
  let changed = false;
  for (const v of VIRTUAL_USERS) {
    if (users.some((u) => u.email === v.email)) continue;
    users.push({
      id: v.accountId,
      email: v.email,
      password: v.password,
      chips: 1000,
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }
  if (changed) writeMockUsers(users);
}

function mockToken(email: string) {
  return `mock.${btoa(unescape(encodeURIComponent(email)))}.${Date.now()}`;
}

export const authApi = {
  live: Boolean(apiBase) || isProd,

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
    if (users.some((u) => u.email === email)) throw new Error("该邮箱已注册");
    sessionStorage.setItem(
      "axiom.pending",
      JSON.stringify({ email, password, code: "000000" }),
    );
    return { needCode: true, hint: "本地模式验证码：000000" };
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
    if (!pending || pending.email !== email) throw new Error("没有待验证的注册");
    if (code !== pending.code) throw new Error("验证码不正确");
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
    ensureVirtualMockUsers();
    const users = readMockUsers();
    const found = users.find((u) => u.email === email && u.password === password);
    if (!found) throw new Error("邮箱或密码错误");
    const { password: _pw, ...user } = found;
    void _pw;
    return { token: mockToken(email), user };
  },

  async me(token: string): Promise<User> {
    if (apiBase) {
      const data = await request<{ user: User }>("/api/me", {
        method: "GET",
        headers: headers(token),
      });
      return data.user;
    }
    const stored = this.getStored();
    if (!stored || stored.token !== token) throw new Error("未登录");
    const users = readMockUsers();
    const found = users.find((u) => u.email === stored.user.email);
    if (!found) throw new Error("用户不存在");
    const { password: _pw, ...user } = found;
    void _pw;
    return user;
  },

  async updateChips(token: string, chips: number): Promise<User> {
    if (apiBase) {
      const data = await request<{ user: User }>("/api/me/chips", {
        method: "PATCH",
        headers: headers(token),
        body: JSON.stringify({ chips }),
      });
      return data.user;
    }
    const stored = this.getStored();
    if (!stored || stored.token !== token) throw new Error("未登录");
    const users = readMockUsers();
    const idx = users.findIndex((u) => u.email === stored.user.email);
    if (idx < 0) throw new Error("用户不存在");
    const current = users[idx];
    if (!current) throw new Error("用户不存在");
    current.chips = chips;
    writeMockUsers(users);
    const { password: _pw, ...user } = current;
    void _pw;
    return user;
  },

  githubStartUrl() {
    return `${apiBase}/api/auth/github/start`;
  },
};
