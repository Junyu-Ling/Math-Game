// A valid token stays signed in even when the account row is missing.
// An expired or garbage token is the only "Not signed in".
delete process.env.REDIS_URL;
delete process.env.JWT_SECRET;

const jwt = (await import("jsonwebtoken")).default;
const { handle } = await import("../server/vercel-api.mjs");

function res() {
  return {
    statusCode: 0,
    body: "",
    setHeader() {},
    end(payload) {
      this.body = String(payload || "");
    },
  };
}

async function hit(token) {
  const out = res();
  await handle(
    { method: "GET", headers: { authorization: token ? `Bearer ${token}` : "" }, url: "/api/me" },
    out,
    "me",
  );
  return { status: out.statusCode, body: out.body ? JSON.parse(out.body) : null };
}

const secret = "dev-secret";
const token = jwt.sign({ id: "u_keep", email: "keep@test.local", name: "Keep" }, secret, { expiresIn: "2h" });
const ok = await hit(token);
if (ok.status !== 200) throw new Error(`valid token status ${ok.status} ${ok.body?.error}`);
if (ok.body.user.id !== "u_keep") throw new Error("user id was not kept");
if (!ok.body.token) throw new Error("a short-lived token should be refreshed");
const refreshed = jwt.verify(ok.body.token, secret);
if (String(refreshed.id) !== "u_keep") throw new Error("refreshed token lost the id");

const expired = jwt.sign({ id: "u_old", email: "old@test.local" }, secret, { expiresIn: "-10s" });
const dead = await hit(expired);
if (dead.status !== 401) throw new Error(`expired token status ${dead.status}`);

const junk = await hit("not-a-jwt");
if (junk.status !== 401) throw new Error(`junk token status ${junk.status}`);

console.log("auth session: valid token stays signed in, expired token does not");
