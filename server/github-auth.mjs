import { randomBytes, timingSafeEqual } from "node:crypto";

const GITHUB_UA = "AXIOM-Math-Game";
const TOEFL_CLIENT_ID = "Ov23li2dm43mGcix56sF";
const NEW_APP_CLIENT_ID = "Ov231ijfLsR5fwRzdTxg";
const STATE_COOKIE = "axiom_gh_state";

export function githubConfig() {
  const raw = process.env.GITHUB_CLIENT_ID || TOEFL_CLIENT_ID;
  return {
    clientId: raw === NEW_APP_CLIENT_ID ? TOEFL_CLIENT_ID : raw,
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    callbackUrl: process.env.GITHUB_CALLBACK_URL || "",
    frontend: (process.env.FRONTEND_ORIGIN || "").replace(/\/$/, ""),
  };
}

export function githubReady() {
  const { clientId, clientSecret } = githubConfig();
  return Boolean(clientId && clientSecret);
}

export function requestOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  if (!host) return githubConfig().frontend || "http://localhost:5173";
  return `${proto}://${host}`;
}

export function oauthUrls(req) {
  const origin = requestOrigin(req);
  const cfg = githubConfig();
  return {
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    callbackUrl: cfg.callbackUrl || `${origin}/api/auth/github/callback`,
    frontend: cfg.frontend || origin,
  };
}

export function createOauthState() {
  return randomBytes(16).toString("hex");
}

function readCookie(req, name) {
  const raw = String(req.headers?.cookie || "");
  for (const part of raw.split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index) === name) {
      try {
        return decodeURIComponent(part.slice(index + 1));
      } catch {
        return part.slice(index + 1);
      }
    }
  }
  return "";
}

export function setOauthStateCookie(req, res, state) {
  const secure = requestOrigin(req).startsWith("https:");
  const parts = [
    `${STATE_COOKIE}=${encodeURIComponent(state)}`,
    "Path=/",
    "Max-Age=600",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  const prev = res.getHeader?.("Set-Cookie");
  const cookie = parts.join("; ");
  if (!prev) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  res.setHeader("Set-Cookie", [...(Array.isArray(prev) ? prev : [prev]), cookie]);
}

export function verifyOauthState(req, state) {
  const expected = readCookie(req, STATE_COOKIE);
  const a = String(state || "");
  const b = String(expected || "");
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function githubAuthorizeUrl(state, callbackUrl) {
  const { clientId } = githubConfig();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGithubCode(code, callbackUrl) {
  const { clientId, clientSecret } = githubConfig();
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": GITHUB_UA,
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw new Error("GitHub token 交换失败");
  return data.access_token;
}

export async function fetchGithubIdentity(accessToken) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": GITHUB_UA,
  };
  const [userRes, emailRes] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }),
  ]);
  const profile = await userRes.json().catch(() => ({}));
  const emailList = await emailRes.json().catch(() => []);
  if (!profile.id) throw new Error("无法读取 GitHub 资料");
  const emails = Array.isArray(emailList)
    ? emailList.filter((item) => item?.email).map((item) => item)
    : [];
  const primary =
    emails.find((item) => item.primary && item.verified) ||
    emails.find((item) => item.verified) ||
    emails[0];
  const email = String(primary?.email || profile.email || "").trim().toLowerCase();
  return {
    githubId: `gh_${profile.id}`,
    email: email || `${profile.login}@users.noreply.github.com`,
    login: profile.login || "",
    name: profile.name || profile.login || "",
    avatar: profile.avatar_url || "",
  };
}
