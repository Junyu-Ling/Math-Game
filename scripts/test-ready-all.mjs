// Two players match, one Ready stays in the lobby, both Ready starts the table.
// Each seat must still be there on the next poll, and each player must see their own cards.
//   node scripts/test-ready-all.mjs
delete process.env.REDIS_URL;

import assert from "node:assert/strict";
import { applyRoomAction, enqueueMatch, leaveQueue, leaveRoom, snapshot } from "../server/lobby.mjs";

const GAMES = ["coda", "uno", "flip7", "gomoku", "ttt", "c4", "ecard", "bj", "holdem"];

function inLobby(view) {
  return view?.phase === "lobby" || view?.street === "lobby";
}

function ownSeat(view, id) {
  return (view?.players || []).find((p) => String(p.id) === String(id));
}

function assertOwnVisible(game, view, id) {
  const me = ownSeat(view, id);
  assert.ok(me, `${game}: ${id} is missing from the started view`);
  if (game === "uno") {
    assert.ok(me.hand?.length >= 7, `${game}: hand not dealt`);
    assert.ok(me.hand.some((c) => !c.hidden), `${game}: own hand is fully masked`);
  }
  if (game === "bj") {
    assert.ok(me.cards?.length >= 2, `${game}: cards not dealt`);
    assert.ok(me.cards.every((c) => !c.hidden), `${game}: own cards are hidden`);
  }
  if (game === "holdem") {
    assert.ok(me.hole?.length >= 2, `${game}: hole cards not dealt`);
    assert.ok(me.hole.every((c) => !c.hidden), `${game}: own hole cards are hidden`);
  }
  if (game === "coda") {
    assert.ok(me.tiles?.length >= 1, `${game}: tiles not dealt`);
    assert.ok(me.tiles.some((t) => !t.masked), `${game}: own tiles are blank`);
  }
}

for (const [index, game] of GAMES.entries()) {
  const a = { id: String(71000 + index * 2), name: "Ada", email: `a-${game}@t.local` };
  const b = { id: String(71001 + index * 2), name: "Bea", email: `b-${game}@t.local` };
  await leaveQueue(a.id);
  await leaveQueue(b.id);
  await leaveRoom(a.id);
  await leaveRoom(b.id);

  const first = await enqueueMatch(a, game);
  assert.equal(first.room, null, `${game}: first player should wait in the queue`);
  const second = await enqueueMatch(b, game);
  assert.ok(second.room, `${game}: second player should open the table`);
  assert.equal(second.room.game, game);
  assert.equal(inLobby(second.room.view), true, `${game}: match should land in the lobby`);
  assert.equal(second.room.view?.matched, true);

  const roomId = second.room.id;
  const one = await applyRoomAction(a, roomId, { type: "ready" });
  assert.equal(inLobby(one.view), true, `${game}: one Ready must not start the game`);

  const both = await applyRoomAction(b, roomId, { type: "ready" });
  assert.equal(inLobby(both.view), false, `${game}: both Ready should leave the lobby (phase=${both.view?.phase} street=${both.view?.street})`);
  assertOwnVisible(game, both.view, b.id);

  const seatA = await snapshot(a.id);
  const seatB = await snapshot(b.id);
  assert.ok(seatA.room, `${game}: A lost the seat the moment the game started`);
  assert.ok(seatB.room, `${game}: B lost the seat the moment the game started`);
  assert.equal(seatA.room.id, roomId);
  assert.equal(seatB.room.id, roomId);
  assert.equal(inLobby(seatA.room.view), false, `${game}: A's poll fell back to the lobby`);
  assert.equal(inLobby(seatB.room.view), false, `${game}: B's poll fell back to the lobby`);
  assertOwnVisible(game, seatA.room.view, a.id);
  assertOwnVisible(game, seatB.room.view, b.id);
  // A numeric user id (GitHub) must still find this string seat. That mismatch painted the white card.
  const numericLookup = String(Number(a.id));
  assert.ok(ownSeat(seatA.room.view, numericLookup), `${game}: string seat does not match String(numeric id)`);

  const again = await snapshot(a.id);
  assert.ok(again.room, `${game}: the follow-up poll returned no room`);
  assert.equal(again.room.id, roomId);
  assert.equal(inLobby(again.room.view), false);

  await leaveRoom(a.id);
  await leaveRoom(b.id);
  console.log("ok", game, both.view?.phase || both.view?.street);
}

console.log("ready-all: every live table starts with both seats still visible");
