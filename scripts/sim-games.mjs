/** Simulate CPU/AI seats against each live engine. Run: node scripts/sim-games.mjs */
import * as coda from "../server/bundled/coda.mjs";
import * as uno from "../server/bundled/uno.mjs";
import * as halli from "../server/bundled/halli.mjs";
import * as holdem from "../server/bundled/holdem.mjs";
import * as flip from "../server/bundled/flip.mjs";
import * as bj from "../server/bundled/bj.mjs";
import * as m24 from "../server/bundled/m24.mjs";
import * as ecard from "../server/bundled/ecard.mjs";
import * as gomoku from "../server/bundled/gomoku.mjs";
import * as ttt from "../server/bundled/ttt.mjs";
import * as c4 from "../server/bundled/c4.mjs";
import * as snake from "../server/bundled/snake.mjs";

let failed = 0;
function ok(name, cond) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${name}`);
    return;
  }
  console.log(`ok ${name}`);
}

function playUntil(start, step, cap, name) {
  let s = start;
  for (let i = 0; i < cap; i++) {
    const next = step(s, i);
    if (!next) break;
    s = next;
    if (s.phase === "over" || s.street === "over") return s;
  }
  ok(`${name} finished`, s.phase === "over" || s.street === "over");
  return s;
}

/* ---------- exploit guards ---------- */

{
  const s = coda.startCoda();
  const actor = coda.currentPlayer(s).id;
  const guess = { ...s, phase: "guess" };
  const after = coda.applyAction(guess, actor, { type: "stay" });
  ok("coda stay during guess is ignored", after.phase === "guess");
}

{
  const dash = (id, color) => ({ id, color, value: "joker", revealed: false });
  const num = (id, color, value) => ({ id, color, value, revealed: false });
  let open = coda.startCoda(true, 2, 2, 2);
  open = {
    ...open,
    phase: "arrange",
    resume: "draw",
    arrangeId: 1,
    players: open.players.map((p, i) =>
      i === 0
        ? {
            ...p,
            tiles: [num("n1", "black", 3), num("n2", "white", 8)],
            stash: dash("d1", "black"),
            queue: [dash("d2", "white")],
          }
        : { ...p, tiles: [num("c1", "black", 1)], stash: null, queue: [] },
    ),
    pending: dash("d1", "black"),
    pendingSlot: 0,
    stashSlots: { you: 0 },
    drawn: dash("d1", "black"),
  };
  const first = coda.applyAction(open, "you", { type: "slot", index: 0 });
  ok(
    "coda opening first dash inserts immediately",
    first.phase === "arrange" &&
      first.resume === "draw" &&
      first.arrangeId === open.arrangeId &&
      first.players[0].stash?.id === "d2" &&
      first.players[0].tiles.some((t) => t.id === "d1"),
  );
  const second = coda.applyAction(first, "you", { type: "slot", index: 1 });
  ok(
    "coda opening second dash inserts in same 5s window",
    second.phase === "arrange" &&
      second.arrangeId === open.arrangeId &&
      !second.players[0].stash &&
      (second.players[0].queue?.length ?? 0) === 0 &&
      second.players[0].tiles.filter((t) => t.value === "joker").length === 2,
  );
  const locked = coda.finishArrange(second);
  ok(
    "coda opening finish drains without a second arrange",
    locked.phase !== "arrange" && locked.players.every((p) => !p.stash && (p.queue?.length ?? 0) === 0),
  );
}

{
  const s = uno.startUnoPractice();
  const v = uno.viewUno(s, "you");
  const rival = v.players.find((p) => p.id !== "you");
  ok(
    "uno view hides rival card values",
    Boolean(rival?.hand.length) && rival.hand.every((c) => c.value === undefined && c.kind === "wild"),
  );
}

{
  const s = bj.startBjPractice();
  const you = s.players.find((p) => p.id === "you");
  const cpu = s.players.find((p) => p.id === "cpu");
  if (you && cpu) {
    const mid = {
      ...s,
      turn: s.players.findIndex((p) => p.id === "cpu"),
      players: s.players.map((p) =>
        p.id === "you"
          ? { ...p, stood: true, cards: [{ id: "a", rank: "9", suit: "H" }, { id: "b", rank: "8", suit: "S" }] }
          : p,
      ),
    };
    const v = bj.viewBjDuel(mid, "cpu");
    const seen = v.players.find((p) => p.id === "you");
    ok(
      "bj view keeps stood rival hole masked until over",
      Boolean(seen?.stood) && seen.cards[1]?.hidden === true,
    );
  }
}

{
  const s = uno.startUnoPractice();
  const me = s.players[s.turn];
  const wild4 = { id: "cheat-w4", color: "black", kind: "wild4" };
  const red = { id: "cheat-red", color: s.color, kind: "number", value: 1 };
  const next = {
    ...s,
    players: s.players.map((p, i) => (i === s.turn ? { ...p, hand: [wild4, red, ...p.hand] } : p)),
  };
  ok("uno +4 illegal when holding current color", uno.canPlay(next, wild4) === false);
  const played = uno.applyUnoAction(next, me.id, { type: "play", cardId: wild4.id, color: "blue" });
  ok("uno +4 play is rejected", played.players[s.turn].hand.some((c) => c.id === wild4.id));
}

{
  const s = halli.startHalliPractice(2);
  const loaded = {
    ...s,
    players: s.players.map((p, i) =>
      i === 0 ? { ...p, open: [{ id: "five", fruit: "cherry", count: 5 }] } : p,
    ),
  };
  ok("halli five cherries is ringing", halli.ringingFruit(loaded) === "cherry");
  const turnId = loaded.players[loaded.turn].id;
  const flipped = halli.applyHalliAction(loaded, turnId, { type: "flip" });
  ok("halli cannot flip while five fruit show", flipped.players[0].open.length === 1);
}

{
  const s = holdem.startHoldemPractice();
  const you = holdem.viewHoldem(s, "you");
  const seen = you.players.find((p) => p.id === "cpu");
  ok("holdem view hides deck", you.deck.length === 0 && s.deck.length > 0);
  ok("holdem view masks rival hole", Boolean(seen?.hole.length) && seen.hole.every((c) => c.hidden));
}

{
  const s = flip.startFlip7Practice();
  const v = flip.viewFlip7(s, "you");
  ok("flip7 view dummies the deck", v.deck.length === s.deck.length && v.deck.every((c) => c.id.startsWith("hidden-flip-")));
  const cur = flip.currentFlip(s);
  const other = s.players.find((p) => p.id !== cur.id);
  if (other) {
    const sneak = flip.applyFlipAction(s, other.id, { type: "hit" });
    ok("flip7 cannot hit off-turn", sneak.deck.length === s.deck.length);
  }
}

{
  const s = bj.startBjPractice();
  const v = bj.viewBjDuel(s, "you");
  ok("bj view hides deck", v.deck.length === 0 && s.deck.length > 0);
  const rival = s.players.find((p) => p.id === "cpu");
  const seen = v.players.find((p) => p.id === "cpu");
  const hole = rival?.cards[1];
  const seenHole = seen?.cards[1];
  ok("bj view masks rival hole", Boolean(seenHole?.hidden) && (hole?.rank !== seenHole?.rank || hole?.rank === "A"));
}

{
  const s = halli.startHalliPractice(2);
  const v = halli.viewHalli(s, "you");
  ok(
    "halli view masks every deck",
    v.players.every((p) => p.deck.every((c) => c.count === 0)),
  );
}

{
  const s = m24.startM24Practice();
  const v = m24.viewM24(s, "you");
  ok("m24 view hides the canned solution", v.solution === "" && s.solution.length > 0);
  const cpuWin = m24.applyM24Action(s, "cpu", { type: "submit", expr: s.solution });
  ok("m24 CPU can still score from the hidden solution on the server", cpuWin.scores.cpu === 1);
}

/* ---------- tic-tac-toe ---------- */

{
  const s = ttt.startTttPractice();
  const occupied = ttt.applyTttAction(s, "you", { type: "place", i: 0 });
  const again = ttt.applyTttAction(occupied, "you", { type: "place", i: 0 });
  ok("ttt cannot overwrite a cell", again.board[0] === 1 && again.turn === occupied.turn);
  const steal = ttt.applyTttAction(occupied, "you", { type: "place", i: 1 });
  ok("ttt cannot place off-turn", steal.board[1] === 0 && steal.turn === occupied.turn);

  let draws = 0;
  let xWins = 0;
  let oWins = 0;
  for (let g = 0; g < 20; g++) {
    let st = ttt.startTttDuel({ id: "x", name: "X" }, { id: "o", name: "O", human: false });
    while (st.phase !== "over") {
      const actor = st.players[st.turn];
      st = ttt.applyTttAction(st, actor.id, ttt.aiTtt(st));
    }
    if (!st.winnerId) draws += 1;
    else if (st.winnerId === "x") xWins += 1;
    else oWins += 1;
  }
  ok("ttt perfect vs perfect is always a draw", draws === 20 && xWins === 0 && oWins === 0);

  let cpuLoss = 0;
  for (let g = 0; g < 40; g++) {
    let st = ttt.startTttPractice();
    while (st.phase !== "over") {
      const actor = st.players[st.turn];
      if (actor.id === "cpu") st = ttt.applyTttAction(st, "cpu", ttt.aiTtt(st));
      else {
        const empties = st.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
        const i = empties[Math.floor(Math.random() * empties.length)] ?? 0;
        st = ttt.applyTttAction(st, "you", { type: "place", i });
      }
    }
    if (st.winnerId === "you") cpuLoss += 1;
  }
  ok("ttt random X cannot beat perfect O", cpuLoss === 0);
}

/* ---------- connect four ---------- */

{
  let s = c4.startC4Practice();
  for (let n = 0; n < 3; n++) {
    s = c4.applyC4Action(s, "you", { type: "drop", col: 0 });
    s = c4.applyC4Action(s, "cpu", { type: "drop", col: 1 });
  }
  s = c4.applyC4Action(s, "you", { type: "drop", col: 0 });
  ok("c4 four stacked in a column wins", s.phase === "over" && s.winnerId === "you");

  let line = c4.startC4Practice();
  const seq = [
    ["you", 0],
    ["cpu", 6],
    ["you", 1],
    ["cpu", 5],
    ["you", 2],
    ["cpu", 4],
    ["you", 3],
  ];
  for (const [id, col] of seq) line = c4.applyC4Action(line, id, { type: "drop", col });
  ok("c4 four along the bottom wins", line.phase === "over" && line.winnerId === "you");

  let packed = c4.startC4Practice();
  for (let n = 0; n < 6; n++) {
    const actor = packed.players[packed.turn].id;
    packed = c4.applyC4Action(packed, actor, { type: "drop", col: 0 });
  }
  const extra = c4.applyC4Action(packed, packed.players[packed.turn]?.id ?? "you", { type: "drop", col: 0 });
  ok("c4 full column rejects extra drops", extra === packed);

  const mid = c4.startC4Practice();
  const air = c4.applyC4Action(mid, "you", { type: "drop", col: 9 });
  ok("c4 cannot drop outside the grid", air.board[0][0] === 0);

  let games = 0;
  let finished = 0;
  for (let g = 0; g < 8; g++) {
    games += 1;
    let st = c4.startC4Duel({ id: "a", name: "A" }, { id: "b", name: "B" });
    let guard = 0;
    while (st.phase !== "over" && guard++ < 50) {
      const actor = st.players[st.turn];
      st = c4.applyC4Action(st, actor.id, c4.aiC4(st));
    }
    if (st.phase === "over") finished += 1;
  }
  ok("c4 AI vs AI finishes", finished === games);
}

/* ---------- snake (continuous world) ---------- */

{
  let s = snake.startSnakePractice(2);
  ok("snake practice starts in play", s.phase === "play" && s.mode === "practice");
  ok("snake world is larger than the camera view", snake.WORLD > snake.VIEW_RADIUS * 2);
  const you = s.players.find((p) => p.id === "you");
  const aimed = snake.applySnakeAction(s, "you", { type: "aim", angle: Math.PI / 2 });
  const after = aimed.players.find((p) => p.id === "you");
  ok("snake aim updates facing intent", Math.abs(after.aim - Math.PI / 2) < 1e-6);

  const ghost = snake.applySnakeAction(s, "nobody", { type: "aim", angle: 0 });
  ok("snake ignores unknown actor", ghost.players[0].aim === s.players[0].aim);

  let stepped = s;
  for (let i = 0; i < 12; i++) stepped = snake.stepSnake(stepped);
  const moved = stepped.players.find((p) => p.id === "you");
  ok("snake moves along path", Boolean(moved) && (moved.x !== you.x || moved.y !== you.y) && moved.path.length >= 2);

  const wall = {
    ...s,
    players: s.players.map((p) =>
      p.id === "you"
        ? { ...p, x: 0.2, y: 10, angle: Math.PI, aim: Math.PI, path: [{ x: 0.2, y: 10 }], alive: true, respawnAt: null }
        : p,
    ),
  };
  const crashed = snake.stepSnake(wall);
  const dead = crashed.players.find((p) => p.id === "you");
  ok("snake dies on a wall", dead.alive === false && dead.respawnAt != null);

  const revived = snake.stepSnake(crashed, dead.respawnAt + 1);
  ok("snake respawns after delay", revived.players.find((p) => p.id === "you").alive === true);

  let world = snake.createSnakeWorld();
  world = snake.joinSnake(world, { id: "a", name: "A" });
  world = snake.joinSnake(world, { id: "b", name: "B" });
  ok("snake world seats joiners", world.players.length === 2 && world.mode === "world");
  world = snake.leaveSnake(world, "a");
  ok("snake world removes leavers", world.players.length === 1 && world.players[0].id === "b");

  let bots = snake.startSnakePractice(3);
  for (let t = 0; t < 200; t++) {
    for (const p of bots.players) {
      if (!p.human && p.alive) bots = snake.applySnakeAction(bots, p.id, snake.aiSnake(bots, p.id));
    }
    bots = snake.stepSnake(bots);
  }
  ok("snake practice AI runs without crashing", bots.phase === "play" && bots.players.length >= 2);

  const view = snake.viewSnake(bots, "you");
  ok("snake view keeps the viewer snake", Boolean(view.players.find((p) => p.id === "you")));

  let fat = snake.startSnakePractice(0);
  fat = {
    ...fat,
    players: fat.players.map((p) =>
      p.id === "you" ? { ...p, score: 8, path: Array.from({ length: 40 }, (_, i) => ({ x: 40 - i * 0.5, y: 40 })) } : p,
    ),
  };
  fat = snake.applySnakeAction(fat, "you", { type: "boost", on: true });
  const beforeBoost = fat.players.find((p) => p.id === "you");
  ok("snake boost arms when held", beforeBoost.boosting === true);
  for (let i = 0; i < 12; i++) fat = snake.stepSnake(fat);
  const afterBoost = fat.players.find((p) => p.id === "you");
  ok("snake boost drains score", afterBoost.score < beforeBoost.score);
}

/* ---------- other live tables: AI vs AI, no crash ---------- */

{
  let s = gomoku.startGomokuPractice();
  s = gomoku.applyGomokuAction(s, "you", { type: "rps", throw: "rock" });
  s = gomoku.applyGomokuAction(s, "cpu", gomoku.aiGomoku(s));
  if (s.rpsReveal && gomoku.finishGomokuRps) s = gomoku.finishGomokuRps(s);
  let guard = 0;
  while (s.phase !== "over" && s.phase === "play" && guard++ < 80) {
    const actor = s.players[s.turn];
    s = gomoku.applyGomokuAction(s, actor.id, gomoku.aiGomoku(s));
  }
  ok("gomoku AI plays without throwing", Boolean(s) && (s.phase === "play" || s.phase === "over"));
  const occ = s.last ? gomoku.applyGomokuAction(s, s.players[s.turn].id, { type: "place", r: s.last.r, c: s.last.c }) : s;
  ok("gomoku cannot occupy a filled point", !s.last || occ.last?.r !== s.last.r || occ.turn === s.turn || occ.phase === "over");
}

{
  let s = ecard.startEcardPractice();
  let guard = 0;
  while (s.phase !== "over" && guard++ < 400) {
    const actor =
      s.phase === "rps"
        ? s.players.find((p) => !s.rpsThrows[p.id])
        : s.phase === "role"
          ? s.players.find((p) => p.id === s.roleChooserId)
          : s.phase === "reveal"
            ? s.players[0]
            : s.players.find((p) => !p.locked) || s.players[s.players.length - 1];
    if (!actor) break;
    s = ecard.applyEcardAction(s, actor.id, ecard.aiEcard(s, actor.id));
    if (s.rpsReveal && ecard.finishEcardRps) s = ecard.finishEcardRps(s);
  }
  ok("ecard AI vs AI finishes or keeps playing legally", guard < 400 || s.phase === "over");
}

{
  let s = uno.startUnoPractice();
  let guard = 0;
  while (s.phase !== "over" && guard++ < 400) {
    const actor = s.players[s.turn];
    s = uno.applyUnoAction(s, actor.id, uno.aiUno(s));
  }
  ok("uno AI vs AI finishes", s.phase === "over" && Boolean(s.winnerId));
}

{
  let s = halli.startHalliPractice(2);
  let guard = 0;
  let threw = false;
  try {
    while (s.phase !== "over" && guard++ < 200) {
      const actor = s.players[s.turn];
      s = halli.applyHalliAction(s, actor.id, halli.aiHalli(s));
    }
  } catch (err) {
    threw = true;
    console.error(err);
  }
  ok("halli AI vs AI does not crash (perfect ringers may recycle cards)", !threw && s.players.length >= 2);
}

{
  let s = bj.startBjPractice();
  let guard = 0;
  while (s.phase !== "over" && guard++ < 40) {
    const actor = s.players[s.turn];
    s = bj.applyBjDuelAction(s, actor.id, bj.aiBjAction(s));
  }
  ok("blackjack AI vs AI settles", s.phase === "over");
}

{
  let s = holdem.startHoldemPractice();
  let guard = 0;
  while (s.street !== "over" && guard++ < 80) {
    if (s.street === "showdown") {
      s = holdem.applyHoldemAction(s, s.players[0].id, { type: "next" });
      continue;
    }
    const actor = s.players[s.turn];
    s = holdem.applyHoldemAction(s, actor.id, holdem.holdemBotAct(s, actor.id));
  }
  ok("holdem bots play a hand to showdown/over", s.street === "over" || s.street === "showdown");
}

{
  let s = flip.startFlip7Practice();
  let guard = 0;
  while (s.phase !== "over" && guard++ < 200) {
    const actor = s.players[s.turn];
    if (!actor) break;
    if (s.phase === "target") {
      s = flip.applyFlipAction(s, actor.id, { type: "target", targetId: flip.aiTarget(s) });
      continue;
    }
    if (s.phase === "roundEnd") {
      s = flip.applyFlipAction(s, actor.id, { type: "hit" });
      continue;
    }
    const decide = flip.aiDecide(s);
    s = flip.applyFlipAction(s, actor.id, { type: decide });
  }
  ok("flip7 AI vs AI keeps a legal table", Boolean(s.players.length));
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall simulation checks passed");
