import jwt from "jsonwebtoken";
import {
  exchangeGithubCode,
  fetchGithubIdentity,
  githubAuthorizeUrl,
  githubReady,
  oauthUrls,
} from "../server/github-auth.mjs";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const users = new Map();

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    chips: u.chips ?? 1000,
    createdAt: u.createdAt,
    provider: u.provider || (u.githubId ? "github" : "email"),
    login: u.login || "",
    name: u.name || "",
    avatar: u.avatar || "",
    githubId: u.githubId || "",
  };
}

function signUser(user) {
  return jwt.sign(publicUser(user), JWT_SECRET, { expiresIn: "7d" });
}

function upsertGithubUser(identity) {
  const existing =
    [...users.values()].find((u) => u.githubId === identity.githubId) ||
    [...users.values()].find((u) => u.email && u.email === identity.email);
  const user = existing
    ? {
        ...existing,
        githubId: identity.githubId,
        login: identity.login || existing.login,
        name: identity.name || existing.name,
        avatar: identity.avatar || existing.avatar,
        provider: existing.provider || "github",
        email: existing.email || identity.email,
      }
    : {
        id: identity.githubId,
        email: identity.email,
        githubId: identity.githubId,
        login: identity.login,
        name: identity.name,
        avatar: identity.avatar,
        provider: "github",
        chips: 1000,
        createdAt: new Date().toISOString(),
      };
  users.set(user.id, user);
  return user;
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function apiPath(req) {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw.join("/");
  if (raw) return String(raw);
  try {
    return new URL(req.url || "/", "http://n").pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  } catch {
    return "";
  }
}

function query(req, key) {
  const v = req.query?.[key];
  if (Array.isArray(v)) return String(v[0] || "");
  if (v != null && String(v) !== "") return String(v);
  try {
    return new URL(req.url || "/", "http://n").searchParams.get(key) || "";
  } catch {
    return "";
  }
}

export default async function handler(req, res) {
  const path = apiPath(req);

  if (path === "health" || path === "") {
    send(res, 200, { ok: true, github: githubReady(), match: false, vercel: true });
    return;
  }

  if (path === "auth/github/start") {
    if (!githubReady()) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("未配置 GitHub 登录。请在 Vercel 环境变量填写 GITHUB_CLIENT_ID 和 GITHUB_CLIENT_SECRET。");
      return;
    }
    const { callbackUrl } = oauthUrls(req);
    const state = jwt.sign({ gh: 1, n: Date.now() }, JWT_SECRET, { expiresIn: "10m" });
    res.statusCode = 302;
    res.setHeader("Location", githubAuthorizeUrl(state, callbackUrl));
    res.end();
    return;
  }

  if (path === "auth/github/callback") {
    const { frontend, callbackUrl } = oauthUrls(req);
    const fail = (code) => {
      res.statusCode = 302;
      res.setHeader("Location", `${frontend}/login?gh_error=${encodeURIComponent(code)}`);
      res.end();
    };
    if (!githubReady()) return fail("config");
    if (query(req, "error")) return fail(query(req, "error") === "access_denied" ? "denied" : "server");
    const code = query(req, "code");
    const state = query(req, "state");
    if (!code) return fail("missing_code");
    try {
      jwt.verify(state, JWT_SECRET);
    } catch {
      return fail("bad_state");
    }
    try {
      const access = await exchangeGithubCode(code, callbackUrl);
      const identity = await fetchGithubIdentity(access);
      const user = upsertGithubUser(identity);
      const token = signUser(user);
      res.statusCode = 302;
      res.setHeader("Location", `${frontend}/auth/callback#token=${encodeURIComponent(token)}`);
      res.end();
    } catch (err) {
      console.error("[auth/github]", err.message);
      return fail("server");
    }
    return;
  }

  if (path === "me") {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const stored = users.get(payload.id);
      send(res, 200, { user: publicUser(stored || payload) });
    } catch {
      send(res, 401, { error: "未登录" });
    }
    return;
  }

  send(res, 404, { error: "Not found" });
}
