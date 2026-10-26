import assert from "node:assert/strict";
import {
  applyHoldemAction,
  raiseBounds,
  startHoldemPractice,
} from "../server/bundled/holdem.mjs";

function you(s) {
  return applyHoldemAction.bind(null, s, "you");
}

let s = startHoldemPractice();
assert.equal(s.currentBet, 10);
assert.equal(s.lastRaise, 10);
assert.equal(s.players[0].id, "you");
assert.equal(s.turn, 0);

const pre = raiseBounds(s, "you");
assert.equal(pre.minFull, 20);
assert.equal(pre.max, 1000);
assert.equal(pre.canRaise, true);

assert.throws(() => you(s)({ type: "raise", amount: 15 }), /Min raise is 20/);

s = you(s)({ type: "raise", amount: 40 });
assert.equal(s.players[0].bet, 40);
assert.equal(s.currentBet, 40);
assert.equal(s.lastRaise, 30);
assert.match(s.message, /raises to 40/);

s = applyHoldemAction(s, "cpu", { type: "allin" });
assert.equal(s.players[1].allIn, true);
assert.ok(s.players[1].bet > 40);
assert.equal(s.currentBet, s.players[1].bet);
assert.equal(s.lastRaise, s.players[1].bet - 40);

s = startHoldemPractice();
s = you(s)({ type: "call" });
s = applyHoldemAction(s, "cpu", { type: "check" });
assert.equal(s.street, "flop");
assert.equal(s.currentBet, 0);
assert.equal(s.lastRaise, 10);

const flop = raiseBounds(s, s.players[s.turn].id);
assert.equal(flop.minFull, 10);
assert.equal(s.turn, 1);

s = applyHoldemAction(s, "cpu", { type: "raise", amount: 10 });
assert.match(s.message, /bets 10/);
assert.equal(s.currentBet, 10);
assert.equal(s.lastRaise, 10);

s = you(s)({ type: "allin" });
assert.equal(s.players[0].allIn, true);
assert.equal(s.currentBet, s.players[0].bet);

console.log("holdem NL ok");
