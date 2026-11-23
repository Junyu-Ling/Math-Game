import assert from "node:assert/strict";
import { adjustCpu, applyRoomAction, dropMatchQueueList, enqueueMatch, leaveQueue, leaveRoom, snapshot, touchPresence } from "../server/lobby.mjs";

const a = { id: "match_a", name: "Ada", email: "ada@test.local" };
const b = { id: "match_b", name: "Bea", email: "bea@test.local" };

await leaveQueue(a.id);
await leaveQueue(b.id);
await leaveRoom(a.id);
await leaveRoom(b.id);

const first = await enqueueMatch(a, "uno");
assert.equal(first.room, null);
assert.equal(first.queue?.game, "uno");
assert.equal(first.queue?.waiting, 1);

const again = await enqueueMatch(a, "uno");
assert.equal(again.room, null);
assert.equal(again.queue?.waiting, 1, "re-queue must not duplicate the same player");

const second = await enqueueMatch(b, "uno");
assert.ok(second.room, "second player should sit at a table");
assert.equal(second.room.game, "uno");
assert.equal(second.queue, null);
assert.equal(second.room.view?.phase, "lobby", "match lands on the open table");
assert.equal(second.room.view?.matched, true);
assert.equal(second.room.seats.length, 2);
assert.deepEqual(second.room.view?.readyIds || [], []);

const other = await snapshot(a.id);
assert.equal(other.room?.id, second.room.id);
assert.equal(other.room?.view?.phase, "lobby");
assert.equal(other.room?.view?.matched, true);

const oneReady = await applyRoomAction(a, second.room.id, { type: "ready" });
assert.equal(oneReady.view?.phase, "lobby", "one Ready must not start");
assert.ok(oneReady.view?.readyIds?.includes(a.id));

const stillLobby = await snapshot(b.id);
assert.equal(stillLobby.room?.view?.phase, "lobby");

const bothReady = await applyRoomAction(b, second.room.id, { type: "ready" });
assert.notEqual(bothReady.view?.phase, "lobby", "game starts when both are ready");
assert.deepEqual(bothReady.view?.readyIds || [], []);

const started = await snapshot(a.id);
assert.notEqual(started.room?.view?.phase, "lobby");
await leaveRoom(a.id);
await leaveRoom(b.id);

const c = { id: "match_c", name: "Cy", email: "cy@test.local" };
await leaveQueue(c.id);
await leaveRoom(c.id);
await enqueueMatch(a, "uno");
const paired = await enqueueMatch(b, "uno");
assert.equal(paired.room?.seats.length, 2);
const third = await enqueueMatch(c, "uno");
assert.equal(third.room, null, "a third player waits instead of joining a full pair");
assert.equal(third.queue?.game, "uno");
await leaveQueue(c.id);
await leaveRoom(a.id);
await leaveRoom(b.id);

const host = { id: "match_host", name: "Host", email: "host@test.local" };
await leaveQueue(host.id);
await leaveRoom(host.id);
await leaveQueue(a.id);
await leaveRoom(a.id);
await leaveQueue(b.id);
await leaveRoom(b.id);
const opened = await adjustCpu(host, "gomoku", "open");
assert.equal(opened.room?.view?.phase, "lobby");
const seeking = await enqueueMatch(host, "gomoku");
assert.equal(seeking.room?.view?.seekingMatch, true);
assert.equal(seeking.room?.view?.matched, false, "an empty search is not a match yet");
const [joinA, joinB] = await Promise.all([enqueueMatch(a, "gomoku"), enqueueMatch(b, "gomoku")]);
const sat = [joinA, joinB].filter((snap) => snap.room?.id === seeking.room.id);
assert.equal(sat.length, 1, "only one player can take the last seat");
assert.equal(sat[0].room.seats.length, 2);
assert.equal(sat[0].room.view.matched, true);
const waiting = [joinA, joinB].find((snap) => snap.room?.id !== seeking.room.id);
assert.equal(waiting.room, null);
assert.equal(waiting.queue?.game, "gomoku");
await leaveQueue(waiting === joinA ? a.id : b.id);
await leaveRoom(host.id);
await leaveRoom(a.id);
await leaveRoom(b.id);

await leaveQueue(a.id);
await leaveRoom(a.id);
await leaveQueue(b.id);
await leaveRoom(b.id);
await enqueueMatch(a, "c4");
await dropMatchQueueList("c4");
await touchPresence(a);
const restored = await enqueueMatch(b, "c4");
assert.ok(restored.room, "a searcher is put back on the list after it expires");
assert.equal((await snapshot(a.id)).room?.id, restored.room.id);
await leaveRoom(a.id);
await leaveRoom(b.id);

console.log("match queue seats two UNO players at an open table; both Ready starts the game");
