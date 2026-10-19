import assert from "node:assert/strict";
import { applyForfeit, forfeitMessage, isLiveMatchState, isMatchOver } from "../server/forfeit.mjs";

const players = [
  { id: "a", name: "Ann", human: true },
  { id: "b", name: "Ben", human: true },
  { id: "c", name: "Cara", human: true },
  { id: "cpu-1", name: "CPU", human: false },
];

const live = { phase: "play", players, log: [] };
assert.equal(isLiveMatchState("uno", live), true);
assert.equal(isLiveMatchState("uno", { phase: "lobby", players }), false);
assert.equal(isLiveMatchState("uno", { phase: "over", players }), false);
assert.equal(isLiveMatchState("roulette", { phase: "bet" }), false);
assert.equal(isLiveMatchState("holdem", { street: "flop", players }), true);
assert.equal(isMatchOver("holdem", { street: "showdown", players }), false);
assert.equal(isMatchOver("holdem", { street: "over", players }), true);

const one = applyForfeit({ phase: "play", street: "flop", players: players.slice(0, 2), log: [] }, "holdem", "a");
assert.equal(one.phase, "over");
assert.equal(one.street, "over");
assert.equal(one.forfeit, true);
assert.equal(one.forfeitId, "a");
assert.equal(one.winnerId, "b");
assert.equal(forfeitMessage(one, "a"), "You left. You lose.");
assert.equal(forfeitMessage(one, "b"), "Ann left. You win.");

const many = applyForfeit({ phase: "play", players, winner: "wolves", log: [] }, "werewolf", "b");
assert.equal(many.winner, null);
assert.equal(many.winnerId, null);
assert.deepEqual(many.winnerIds, ["a", "c"]);
assert.equal(forfeitMessage(many, "a"), "Ben left. You win.");
assert.equal(forfeitMessage(many, "c"), "Ben left. You win.");
assert.equal(forfeitMessage(many, "b"), "You left. You lose.");
assert.equal(many.winnerIds.includes("cpu-1"), false);

const solo = applyForfeit({ phase: "play", players: [players[0], players[3]] }, "ludo", "a");
assert.deepEqual(solo.winnerIds, []);
assert.equal(forfeitMessage(solo, "a"), "You left. You lose.");

console.log("forfeit ok");
