// Picking a colour before "Enter world" must reach the shared world (needs the local API on :8787).
//   node scripts/test-snake-color.mjs
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
const run = Date.now().toString(36);
const mk = (tag) => {
  const id = `t_${tag}_${run}`;
  const u = { id, name: `Color${tag}`, email: `${id}@test.local` };
  return { ...u, token: jwt.sign(u, env.JWT_SECRET || "dev-secret", { expiresIn: "10m" }) };
};
const post = async (u, body) => {
  const res = await fetch(`${base}/api/lobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${u.token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.status);
  return data;
};

const A = mk("A");
const B = mk("B");
const C = mk("C");
for (const u of [A, B, C]) await post(u, { op: "leave" });

const a = await post(A, { op: "snakeJoin", hue: 325 });
const b = await post(B, { op: "snakeJoin", hue: 95 });
const c = await post(C, { op: "snakeJoin", hue: "not-a-colour" });
const hueOf = (snap, id) => snap.room?.view?.players?.find((p) => p.id === id)?.hue;

assert.equal(hueOf(a, A.id), 325, "A keeps the picked pink");
assert.equal(hueOf(b, B.id), 95, "B keeps the picked lime");
const cHue = hueOf(c, C.id);
assert.ok(Number.isFinite(cHue), "an invalid colour falls back to a normal hue");
// Everyone sees everyone's colour.
const seen = await post(A, { op: "snakeJoin", hue: 325 });
assert.equal(hueOf(seen, B.id), 95, "A sees B's colour");

for (const u of [A, B, C]) await post(u, { op: "leave" });
console.log("snake colour: picked hue reaches the world; bad input falls back");
