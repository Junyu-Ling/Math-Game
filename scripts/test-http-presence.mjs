// Two throwaway users against a running local API (http://127.0.0.1:8787):
// each must see the other online right away, and Find match must seat both at one table.
//   node scripts/test-http-presence.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("server/package.json"));
const jwt = require("jsonwebtoken");
const env = Object.fromEntries(
  fs
    .readFileSync("server/.env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const base = process.env.API || "http://127.0.0.1:8787";
const secret = env.JWT_SECRET || "dev-secret";
const run = Date.now().toString(36);
const mk = (tag) => {
  const id = `t_${tag}_${run}`;
  const user = { id, name: `Probe${tag}`, email: `${id}@test.local` };
  return { ...user, token: jwt.sign(user, secret, { expiresIn: "10m" }) };
};
const A = mk("A");
const B = mk("B");

async function call(u, method, p, body) {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${u.token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p}: ${data.error || res.status}`);
  return data;
}
const post = (u, body) => call(u, "POST", "/api/lobby", body);
const sync = (u) => call(u, "GET", "/api/lobby?href=%2F");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const u of [A, B]) await post(u, { op: "leave" });

// A is online first, B shows up later: A must see B on the very next full sync.
await sync(A);
await sleep(300);
const first = await sync(A);
assert.ok(!first.online.some((p) => p.id === B.id && p.online), "B not online yet");
await sync(B);
const second = await sync(A);
const seenB = second.online.find((p) => p.id === B.id);
assert.ok(seenB?.online, "A must see B online immediately after B's first heartbeat");
const seenA = (await sync(B)).online.find((p) => p.id === A.id);
assert.ok(seenA?.online, "B must see A online");

// Matchmaking: both queue the same game; both must end up at one table.
const q1 = await post(A, { op: "queue", game: "ttt" });
assert.equal(q1.room, null);
assert.equal(q1.queue?.game, "ttt");
const bSees = (await sync(B)).online.find((p) => p.id === A.id);
assert.ok(bSees?.matching, "B sees A as Matching");
const q2 = await post(B, { op: "queue", game: "ttt" });
assert.ok(q2.room, "second player is seated at once");
const aSnap = await sync(A);
assert.equal(aSnap.room?.id, q2.room.id, "first player lands at the same table");

for (const u of [A, B]) await post(u, { op: "leave" });
console.log("http: players see each other immediately; Find match seats both at one table");
