import {
  createOauthState,
  githubConfig,
  requestOrigin,
  setOauthStateCookie,
  verifyOauthState,
} from "./github-auth.mjs";

const STATE_COOKIE = "axiom_google_state";

export function googleConfig() {
  return {
    clientId: String(process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || "").trim(),
  };
}

export function googleReady() {
  const { clientId, clientSecret } = googleConfig();
  return Boolean(clientId && clientSecret);
}

export function googleUrls(req) {
  const origin = requestOrigin(req);
  const frontend = (githubConfig().frontend || origin).replace(/\/$/, "");
  return {
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || `${origin}/api/auth/google/callback`,
    frontend,
  };
}

export function beginGoogleLogin(req, res) {
  const { callbackUrl } = googleUrls(req);
  const state = createOauthState();
  setOauthStateCookie(req, res, state, STATE_COOKIE);
  const { clientId } = googleConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function googleStateOk(req, state) {
  return verifyOauthState(req, state, STATE_COOKIE);
}

export async function fetchGoogleIdentity(code, callbackUrl) {
  const { clientId, clientSecret } = googleConfig();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: "authorization_code",
    }),
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!token.access_token) throw new Error("Google token 交换失败");
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = await profileRes.json().catch(() => ({}));
  const email = String(profile.email || "").trim().toLowerCase();
  if (!profile.sub || !email) throw new Error("无法读取 Google 邮箱");
  if (profile.email_verified === false) throw new Error("Google 邮箱未验证");
  return {
    googleId: `g_${profile.sub}`,
    email,
    login: email.split("@")[0],
    name: profile.name || email.split("@")[0],
    avatar: profile.picture || "",
  };
}
