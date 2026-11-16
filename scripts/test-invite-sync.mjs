import assert from "node:assert/strict";
import {
  createInvite,
  respondInvite,
  enqueueMatch,
  leaveQueue,
  leaveRoom,
  snapshot,
  watchLobby,
  touchPresence,
  joinSnakeWorld,
} from "../server/lobby.mjs";
import { loadMods } from "../server/game-mods.mjs";

const mods = await loadMods();
const a = { id: "sync_a", name: "Ada", email: "sync_a@test.local", login: "sync_a" };
const b = { id: "sync_b", name: "Bea", email: "sync_b@test.local", login: "sync_b" };

async function reset(u) {
  await leaveQueue(u.id);
  await leaveRoom(u.id);
  await touchPresence(u);
}

await reset(a);
await reset(b);

// Accept must wake the host with the new room already seated (not invites:[] + room:null).
{
  const inv = await createInvite(a, b.id, "uno");
  const hostWatch = watchLobby(a, 0, 1, "", 8000, 0);
  await new Promise((r) => setTimeout(r, 40));
  const accepted = await respondInvite(b, inv.id, true, mods);
  assert.ok(accepted.room, "joiner gets a room");
  const hostSnap = await hostWatch;
  assert.equal(hostSnap.room?.id, accepted.room.id, "host wake includes the new table");
  assert.deepEqual(hostSnap.room?.seats?.slice().sort(), [a.id, b.id].sort());
  await leaveRoom(a.id);
  await leaveRoom(b.id);
}

// Leaving an old snake seat must not cancel a match queue / wipe a newer seat.
{
  await reset(a);
  await reset(b);
  await joinSnakeWorld(a);
  const queued = await enqueueMatch(a, "c4");
  assert.equal(queued.queue?.game, "c4");
  assert.equal(queued.room, null);
  // Client still thinks it is leaving snake-world after navigating away.
  const left = await leaveRoom(a.id, "snake-world");
  assert.equal(left.queue?.game, "c4", "match queue survives leaving a vacated snake seat");
  const matched = await enqueueMatch(b, "c4");
  assert.ok(matched.room, "second player should pair");
  const aNow = await snapshot(a.id);
  assert.equal(aNow.room?.id, matched.room.id);
  await leaveRoom(a.id);
  await leaveRoom(b.id);
}

// Stale leave targeting snake must not vacate a freshly matched table.
{
  await reset(a);
  await reset(b);
  await joinSnakeWorld(a);
  await enqueueMatch(a, "ttt");
  const matched = await enqueueMatch(b, "ttt");
  assert.ok(matched.room);
  const wiped = await leaveRoom(a.id, "snake-world");
  assert.equal(wiped.room?.id, matched.room.id, "expected-room leave must not drop the new seat");
  await leaveRoom(a.id, matched.room.id);
  await leaveRoom(b.id, matched.room.id);
}

await reset(a);
await reset(b);
console.log("invite/match sync: host wakes with seat; snake leave no longer cancels queue");
