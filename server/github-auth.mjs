const GITHUB_UA = "AXIOM-Math-Game";

export function githubConfig() {
  return {
    clientId: process.env.GITHUB_CLIENT_ID || "",
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
