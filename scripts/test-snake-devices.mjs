// Several devices join one snake world: they must share the map, see each other, and
// a steer from one device must show up on the others. A join during a tick must not erase anyone.
//   node scripts/test-snake-devices.mjs
delete process.env.REDIS_URL;

import assert from "node:assert/strict";
import { applyRoomAction, enqueueMatch, leaveRoom, peekRoomRecord, snapshot } from "../server/lobby.mjs";

const VIEW = 42;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const users = [
  { id: 88001, name: "Phone" },
  { id: "snake_b", name: "Laptop" },
  { id: "snake_c", name: "Tablet" },
];

for (const u of users) await leaveRoom(u.id);

for (const u of users) {
  const snap = await enqueueMatch(u, "snake");
  assert.equal(snap.room?.game, "snake", `${u.name} did not enter the world`);
  assert.equal(snap.room.id, "snake-world");
  const me = snap.room.view.players.find((p) => String(p.id) === String(u.id));
  assert.ok(me?.alive, `${u.name} has no living snake`);
  assert.ok(me.path?.length > 4, `${u.name} snake has no body`);
}

function humans(view) {
  return (view?.players || []).filter((p) => p.human !== false);
}

const first = await snapshot(String(users[0].id));
const roster = humans(first.room.view);
for (const u of users) {
  assert.ok(roster.some((p) => String(p.id) === String(u.id)), `missing ${u.name}`);
}
for (let i = 0; i < roster.length; i++) {
  for (let j = i + 1; j < roster.length; j++) {
    const d = Math.hypot(roster[i].x - roster[j].x, roster[i].y - roster[j].y);
    assert.ok(d < VIEW, `${roster[i].name} and ${roster[j].name} spawned ${d.toFixed(1)} apart — outside the camera`);
    assert.ok(roster[j].path?.length > 4, `${roster[j].name} path was culled`);
  }
}

const aim = 1.2;
await applyRoomAction(users[1], "snake-world", { type: "aim", angle: aim, n: Date.now() });
await sleep(120);
const steered = await snapshot(String(users[0].id));
const peer = humans(steered.room.view).find((p) => String(p.id) === "snake_b");
assert.ok(peer, "laptop snake disappeared after an aim");
assert.ok(peer.path?.length > 4, "the other device stopped receiving the steered snake");
const raw = await peekRoomRecord("snake-world");
const rawPeer = (raw?.state?.players || []).find((p) => String(p.id) === "snake_b");
assert.ok(Math.abs(rawPeer.aim - aim) < 0.08, `aim did not reach the shared world (aim=${rawPeer?.aim})`);

const fourth = { id: "snake_d", name: "Desktop" };
await Promise.all([
  snapshot(String(users[0].id)),
  snapshot("snake_b"),
  snapshot("snake_c"),
  enqueueMatch(fourth, "snake"),
]);
const joined = await snapshot("snake_d");
const ids = humans(joined.room.view).map((p) => String(p.id));
for (const id of ["88001", "snake_b", "snake_c", "snake_d"]) {
  assert.ok(ids.includes(id), `join during a tick dropped ${id}; have ${ids.join(",")}`);
}
const newbie = humans(joined.room.view).find((p) => String(p.id) === "snake_d");
const near = humans(joined.room.view).some(
  (p) => String(p.id) !== "snake_d" && Math.hypot(p.x - newbie.x, p.y - newbie.y) < VIEW,
);
assert.ok(near, "the fourth device spawned out of sight");

await leaveRoom("snake_b");
const left = await snapshot("88001");
const leftIds = humans(left.room.view).map((p) => String(p.id));
assert.ok(!leftIds.includes("snake_b"), "leaving one device removed the wrong snake, or failed to remove it");
assert.ok(leftIds.includes("88001") && leftIds.includes("snake_c") && leftIds.includes("snake_d"));

for (const u of [...users, fourth]) await leaveRoom(u.id);
console.log("snake devices share one world, see each other, and a steer arrives on the other screen");
