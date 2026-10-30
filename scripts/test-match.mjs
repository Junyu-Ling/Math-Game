import assert from "node:assert/strict";
import { enqueueMatch, leaveQueue, snapshot } from "../server/lobby.mjs";

const a = { id: "match_a", name: "Ada", email: "ada@test.local" };
const b = { id: "match_b", name: "Bea", email: "bea@test.local" };

await leaveQueue(a.id);
await leaveQueue(b.id);

const first = await enqueueMatch(a, "uno");
assert.equal(first.room, null);
assert.equal(first.queue?.game, "uno");
assert.equal(first.queue?.waiting, 1);

const second = await enqueueMatch(b, "uno");
assert.ok(second.room, "second player should sit at a table");
assert.equal(second.room.game, "uno");
assert.equal(second.queue, null);
assert.notEqual(second.room.view?.phase, "lobby");
assert.equal(second.room.seats.length, 2);

const other = await snapshot(a.id);
assert.equal(other.room?.id, second.room.id);
assert.notEqual(other.room?.view?.phase, "lobby");

console.log("match queue pairs two UNO players and starts the table");
