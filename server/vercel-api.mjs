import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createOauthState,
  exchangeGithubCode,
  fetchGithubIdentity,
  githubAuthorizeUrl,
  githubReady,
  githubSecretLooksLikeUrl,
  oauthUrls,
  setOauthStateCookie,
  verifyOauthState,
} from "./github-auth.mjs";
import {
  applyRoomAction,
  createInvite,
  findAccountByEmail,
  findAccountById,
  heartbeat,
  leaveRoom,
  lobbyStoreKind,
  rememberPlayer,
  respondInvite,
  saveAccount,
  stashVerify,
  takeVerify,
  clearVerify,
} from "./lobby.mjs";
import { loadMods } from "./game-mods.mjs";

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

async function upsertGithubUser(identity) {
  const fromRedis = identity.email ? await findAccountByEmail(identity.email) : null;
  const existing =
    fromRedis ||
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
  await saveAccount(user);
  return user;
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
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

function authUser(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const payload = jwt.verify(token, JWT_SECRET);
  return { ...payload, id: String(payload.id) };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

export async function handle(req, res, path) {
  if (path === "health" || path === "") {
    const matchWs = String(process.env.MATCH_WS_URL || "").trim();
    send(res, 200, {
      ok: true,
      github: githubReady(),
      githubSecretIsUrl: githubSecretLooksLikeUrl(),
      match: false,
      lobby: true,
      lobbyStore: lobbyStoreKind(),
      vercel: true,
      ws: matchWs,
    });
    return;
  }

  if (path === "auth/github/start") {
    if (!githubReady()) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(
        githubSecretLooksLikeUrl()
          ? "GITHUB_CLIENT_SECRET 填成了网址。请到 GitHub OAuth App 点 Generate a new client secret，把那一串字符填进 Vercel，不要填 authorize 链接。"
          : "未配置 GitHub 登录。请在 Vercel 环境变量填写 GITHUB_CLIENT_ID 和 GITHUB_CLIENT_SECRET。",
      );
      return;
    }
    const { callbackUrl } = oauthUrls(req);
    const state = createOauthState();
    setOauthStateCookie(req, res, state);
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
    if (!verifyOauthState(req, state)) return fail("bad_state");
    try {
      const access = await exchangeGithubCode(code, callbackUrl);
      const identity = await fetchGithubIdentity(access);
      const user = await upsertGithubUser(identity);
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

  if (path === "lobby") {
    try {
      const user = authUser(req);
      if (req.method === "GET" || req.method === "HEAD") {
        send(res, 200, await heartbeat(user, query(req, "href"), query(req, "light") === "1"));
        return;
      }
      const body = await readBody(req);
      const op = String(body.op || "");
      if (op === "invite") {
        const invite = await createInvite(user, String(body.toId || ""), String(body.game || ""), body.meta || {});
        send(res, 200, { invite, ...(await heartbeat(user)) });
        return;
      }
      if (op === "respond") {
        const mods = await loadMods();
        const result = await respondInvite(user, String(body.id || ""), Boolean(body.accept), mods);
        send(res, 200, { ...(await heartbeat(user)), ...result });
        return;
      }
      if (op === "action") {
        const room = await applyRoomAction(user, String(body.roomId || ""), body.action);
        send(res, 200, { room });
        return;
      }
      if (op === "leave") {
        send(res, 200, await leaveRoom(user.id));
        return;
      }
      send(res, 400, { error: "Unknown operation" });
    } catch (err) {
      const msg = String(err.message || "Failed");
      send(res, /jwt|token|Not signed in|未登录/i.test(msg) ? 401 : 400, { error: /jwt|token/i.test(msg) ? "Not signed in" : msg });
    }
    return;
  }

  if (path === "auth/register") {
    try {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        send(res, 400, { error: "Invalid email" });
        return;
      }
      if (password.length < 6) {
        send(res, 400, { error: "Password must be at least 6 characters" });
        return;
      }
      if (await findAccountByEmail(email)) {
        send(res, 400, { error: "That email is already registered" });
        return;
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await stashVerify(email, { hash: bcrypt.hashSync(password, 10), code });
      send(res, 200, {
        needCode: true,
        hint: process.env.SMTP_HOST
          ? "A code was sent to your email. It expires in 10 minutes."
          : `Your verification code is ${code}. It expires in 10 minutes.`,
      });
    } catch (err) {
      send(res, 400, { error: String(err.message || "Registration failed") });
    }
    return;
  }

  if (path === "auth/verify") {
    try {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const code = String(body.code || "");
      const pending = await takeVerify(email);
      if (!pending) {
        send(res, 400, { error: "Code missing or expired" });
        return;
      }
      if (pending.code !== code) {
        send(res, 400, { error: "Wrong code" });
        return;
      }
      const user = {
        id: `u_${Date.now()}`,
        email,
        passwordHash: pending.hash,
        chips: 1000,
        createdAt: new Date().toISOString(),
        provider: "email",
        name: email.split("@")[0],
      };
      await saveAccount(user);
      await clearVerify(email);
      users.set(user.id, user);
      send(res, 200, { token: signUser(user), user: publicUser(user) });
    } catch (err) {
      send(res, 400, { error: String(err.message || "Verification failed") });
    }
    return;
  }

  if (path === "auth/login") {
    try {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = await findAccountByEmail(email);
      if (!user) {
        send(res, 400, { error: "Wrong email or password" });
        return;
      }
      if (!user.passwordHash) {
        send(res, 400, { error: "Use GitHub to sign in to this account" });
        return;
      }
      if (!bcrypt.compareSync(password, user.passwordHash)) {
        send(res, 400, { error: "Wrong email or password" });
        return;
      }
      await rememberPlayer(user);
      users.set(user.id, user);
      send(res, 200, { token: signUser(user), user: publicUser(user) });
    } catch (err) {
      send(res, 400, { error: String(err.message || "Login failed") });
    }
    return;
  }

  if (path === "me") {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const stored = users.get(payload.id) || (await findAccountById(payload.id));
      send(res, 200, { user: publicUser(stored || payload) });
    } catch {
      send(res, 401, { error: "Not signed in" });
    }
    return;
  }

  send(res, 404, { error: "Not found" });
}
