import assert from "node:assert/strict";
import { applyRoomAction, enqueueMatch, leaveQueue, leaveRoom, snapshot } from "../server/lobby.mjs";

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

console.log("match queue seats two UNO players at an open table; both Ready starts the game");
