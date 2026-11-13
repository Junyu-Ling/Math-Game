// Online (lobby-level) bot tests: human bots play through the real lobby API (memory store),
// against each other and against server CPUs, on a fake clock so 5s arrange windows are instant.
//   node scripts/test-online-bots.mjs            all checks
//   QUICK=1 node scripts/test-online-bots.mjs    skip the real-time latency probe
//   LOBBY_PATH=server/lobby-old.tmp.mjs ...      run the same checks against another lobby build
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const lobbyUrl = process.env.LOBBY_PATH ? pathToFileURL(path.resolve(process.env.LOBBY_PATH)).href : "../server/lobby.mjs";
const L = await import(lobbyUrl);
const coda = await import("../server/bundled/coda.mjs");

// ---- fake clock -------------------------------------------------------------------------
const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;
const advance = (ms) => {
  skew += ms;
};

// ---- seeded rng -------------------------------------------------------------------------
let seed = Number(process.env.SEED || 1337);
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

let userN = 0;
const mkUser = (tag) => ({ id: `hu_${tag}_${++userN}`, name: `Tester${userN}`, email: `tester${userN}@test.local` });

async function reset(users) {
  for (const u of users) {
    await L.leaveQueue(u.id);
    await L.leaveRoom(u.id);
    await L.touchPresence(u);
  }
}

const touch = (users) => Promise.all(users.map((u) => L.touchPresence(u)));
const view = async (u) => (await L.snapshot(u.id, true)).room;

// ---- coda bot (sees only its own masked view) -----------------------------------------
function hiddenTargets(v, meId) {
  const out = [];
  for (const p of v.players) {
    if (p.id === meId || p.out) continue;
    p.tiles.forEach((t, i) => {
      if (!t.revealed) out.push({ playerId: p.id, index: i });
    });
  }
  return out;
}

function codaBot(v, meId, memo) {
  const mine = v.players.find((p) => p.id === meId);
  if (!mine) return null;
  const cur = v.players[v.turn];
  const myTurn = cur?.id === meId;
  switch (v.phase) {
    case "lobby":
      return mine.ready ? null : { type: "ready" };
    case "rps":
      return v.rpsThrows?.[meId] || v.rpsReveal ? null : { type: "rps", throw: pick(["rock", "paper", "scissors"]) };
    case "arrange": {
      if (v.resume === "draw") {
        if (!mine.stash || rnd() < 0.25) return null; // sometimes leave leftovers for the drain
        return { type: "slot", index: pick(coda.insertIndices(mine.tiles, mine.stash)) };
      }
      if (!myTurn || !v.pending || memo.arrangeId === v.arrangeId) return null;
      memo.arrangeId = v.arrangeId;
      const row = v.humanDraft ?? mine.tiles;
      return { type: "slot", index: pick(coda.insertIndices(row, v.pending)) };
    }
    case "draw": {
      if (!myTurn) return null;
      const left = v.leftByColor ?? { black: 1, white: 1 };
      const colors = ["black", "white"].filter((c) => left[c] > 0);
      return colors.length ? { type: "draw", color: pick(colors) } : null;
    }
    case "guess": {
      if (!myTurn) return null;
      if (!v.selected) {
        const t = pick(hiddenTargets(v, meId));
        return t ? { type: "select", playerId: t.playerId, index: t.index } : null;
      }
      const owner = v.players.find((p) => p.id === v.selected.playerId);
      const tile = owner?.tiles[v.selected.index];
      const tried = new Set((v.tried?.[tile?.id] ?? []).map(String));
      const values = [...Array.from({ length: 12 }, (_, i) => i), ...(v.useJokers ? ["joker"] : [])].filter(
        (x) => !tried.has(String(x)),
      );
      return values.length ? { type: "guess", value: pick(values) } : null;
    }
    case "continue":
      return myTurn ? { type: rnd() < 0.5 ? "continue" : "stay" } : null;
    case "penalty": {
      if (!myTurn) return null;
      const hidden = mine.tiles.map((t, i) => [t, i]).filter(([t]) => !t.revealed);
      return hidden.length ? { type: "penalty", index: pick(hidden)[1] } : null;
    }
    default:
      return null;
  }
}

function pubCoda(v) {
  return JSON.stringify({
    phase: v.phase,
    turn: v.turn,
    arrangeId: v.arrangeId,
    winner: v.winnerId,
    selected: v.selected,
    rps: v.rpsReveal,
    deck: v.leftByColor,
    logs: v.log.map((l) => l.text),
    players: v.players.map((p) => ({
      id: p.id,
      out: p.out,
      tiles: p.tiles.map((t) => [t.id, t.color, t.revealed ? t.value : null]),
    })),
  });
}

function checkCodaInvariants(v, meId, label) {
  const mine = v.players.find((p) => p.id === meId);
  const nums = (mine?.tiles ?? []).filter((t) => t.value !== "joker");
  for (let i = 1; i < nums.length; i++) {
    assert.ok(coda.rank(nums[i - 1]) <= coda.rank(nums[i]), `${label}: own row out of order (${v.phase})`);
  }
  if (v.phase !== "arrange" && v.phase !== "lobby") {
    const total = v.players.reduce((n, p) => n + p.tiles.length, 0) + (v.leftByColor.black + v.leftByColor.white) + (v.drawn ? 1 : 0);
    const want = v.useJokers ? 26 : 24;
    assert.equal(total, want, `${label}: tile conservation (${v.phase})`);
  }
}

/** Seat humans (+ CPUs) at a coda table and return the room id. */
async function seatCoda(humans, cpus, useJokers) {
  await reset(humans);
  let roomId;
  if (humans.length === 1) {
    const r = await L.adjustCpu(humans[0], "coda", "open", undefined, { useJokers });
    roomId = r.room.id;
  } else {
    await L.enqueueMatch(humans[0], "coda", { useJokers });
    const r = await L.enqueueMatch(humans[1], "coda", { useJokers });
    roomId = r.room?.id ?? (await view(humans[0])).id;
  }
  const room = await view(humans[0]);
  const host = humans.find((h) => h.id === room.seats[0]) ?? humans[0];
  for (let i = 0; i < cpus; i++) await L.adjustCpu(host, "coda", "add", undefined, {});
  return { roomId, host };
}

async function playCoda({ humans, cpus, useJokers, concurrent, label }) {
  const { roomId } = await seatCoda(humans, cpus, useJokers);
  const memos = new Map(humans.map((h) => [h.id, {}]));
  let idle = 0;
  let steps = 0;
  let lastIdleSeq = -1;
  const lastSeq = new Map();
  while (steps++ < 4000) {
    await touch(humans);
    const views = [];
    for (const h of humans) {
      const room = await view(h);
      assert.ok(room, `${label}: lost the room at step ${steps}`);
      const prev = lastSeq.get(h.id) ?? 0;
      assert.ok(room.seq >= prev, `${label}: seq went backwards ${prev} -> ${room.seq}`);
      lastSeq.set(h.id, room.seq);
      views.push({ h, room });
    }
    // Everyone must see the same table at the same seq.
    const first = views[0];
    for (const o of views.slice(1)) {
      assert.equal(o.room.seq, first.room.seq, `${label}: viewers disagree on seq`);
      assert.equal(pubCoda(o.room.view), pubCoda(first.room.view), `${label}: viewers disagree on table at seq ${first.room.seq}`);
    }
    for (const { h, room } of views) checkCodaInvariants(room.view, h.id, label);
    if (first.room.view.phase === "over") return { steps, roomId };

    const acts = [];
    for (const { h, room } of views) {
      const a = codaBot(room.view, h.id, memos.get(h.id));
      if (a) acts.push({ h, a });
    }
    if (acts.length) {
      idle = 0;
      if (concurrent) {
        // everyone taps at the same instant, plus watchers polling
        await Promise.all([
          ...acts.map(({ h, a }) => L.applyRoomAction(h, roomId, a).catch(() => null)),
          ...humans.map((h) => L.watchLobby(h, -1, -1, "", 50)),
        ]);
      } else {
        for (const { h, a } of shuffle(acts)) await L.applyRoomAction(h, roomId, a).catch(() => null);
      }
      continue;
    }
    if (first.room.seq !== lastIdleSeq) {
      lastIdleSeq = first.room.seq;
      idle = 0; // a CPU / the clock moved the table forward
    }
    idle++;
    if (idle >= 40 && L.peekRoomRecord && process.env.STACK) {
      const rec = await L.peekRoomRecord(roomId);
      const s = rec.state;
      console.log("STALL STATE phase", s.phase, "turn", s.turn, "selected", JSON.stringify(s.selected), "drawn", JSON.stringify(s.drawn), "cpuReadyAt", rec.cpuReadyAt, "endsAt", rec.endsAt);
      for (const p of s.players) console.log(" ", p.id, p.human, p.out ? "OUT" : "", p.tiles.map((t) => `${t.color[0]}${t.value}${t.revealed ? "!" : ""}`).join(" "));
      console.log("  aiGuess:", JSON.stringify(coda.aiGuess(s)), "now", Date.now(), "seat", await L.snapshot(humans[0].id, true).then((x) => x.room?.id));
      const w = await L.watchLobby(humans[0], -1, -1, "", 50);
      const rec2 = await L.peekRoomRecord(roomId);
      console.log("  after watch: seq", w.room?.seq, "phase", rec2.state.phase, "turn", rec2.state.turn, "cpuReadyAt", rec2.cpuReadyAt);
    }
    assert.ok(idle < 40, `${label}: stalled in ${first.room.view.phase} (turn ${first.room.view.turn}) at seq ${first.room.seq}`);
    if (first.room.view.phase === "arrange") advance(5200);
    else advance(450);
    // trigger expiry / CPU through a random path
    const h = pick(humans);
    const how = rnd();
    if (how < 0.4) await L.watchLobby(h, -1, -1, "", 50);
    else if (how < 0.7) await L.applyRoomAction(h, roomId, { type: "tick" }).catch(() => null);
    else await Promise.all(humans.map((x) => L.watchLobby(x, -1, -1, "", 50)));
  }
  throw new Error(`${label}: game did not finish in 4000 steps`);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- 1. race: many watchers see the same expired arrange timer at once ----------------
async function raceArrange(rounds) {
  let diverged = 0;
  for (let r = 0; r < rounds; r++) {
    const humans = [mkUser("ra"), mkUser("rb")];
    const { roomId } = await seatCoda(humans, 1, true); // 3 players -> random first drawer
    await touch(humans);
    for (const h of humans) await L.applyRoomAction(h, roomId, { type: "ready" }).catch(() => null);
    const before = await view(humans[0]);
    if (before.view.phase !== "arrange") {
      await L.leaveRoom(humans[0].id);
      await L.leaveRoom(humans[1].id);
      continue;
    }
    advance(5200);
    await touch(humans);
    const out = await Promise.all([
      view(humans[0]),
      view(humans[1]),
      L.watchLobby(humans[0], -1, -1, "", 50).then((s) => s.room),
      L.watchLobby(humans[1], -1, -1, "", 50).then((s) => s.room),
      L.applyRoomAction(humans[0], roomId, { type: "tick" }),
      L.applyRoomAction(humans[1], roomId, { type: "tick" }),
    ]);
    const finals = [await view(humans[0]), await view(humans[1])];
    const keys = new Set([...out, ...finals].filter((x) => x.view.phase !== "arrange").map((x) => pubCoda(x.view)));
    if (keys.size > 1 || finals[0].seq !== finals[1].seq || pubCoda(finals[0].view) !== pubCoda(finals[1].view)) diverged++;
    await L.leaveRoom(humans[0].id);
    await L.leaveRoom(humans[1].id);
  }
  return diverged;
}

// ---- 2. real-time latency of the arrange expiry ---------------------------------------
async function arrangeLatency() {
  skew = 0; // real clock
  const humans = [mkUser("la"), mkUser("lb")];
  const { roomId } = await seatCoda(humans, 0, true);
  await touch(humans);
  for (const h of humans) await L.applyRoomAction(h, roomId, { type: "ready" }).catch(() => null);
  const start = await view(humans[0]);
  assert.equal(start.view.phase, "arrange", "latency probe needs an arrange phase");
  const endsAt = start.endsAt;
  assert.ok(endsAt, "arrange must publish a deadline");
  assert.ok(typeof start.serverNow === "number", "room snapshots carry serverNow");
  const seen = await Promise.all(
    humans.map(async (h) => {
      let seq = start.seq;
      for (;;) {
        const s = await L.watchLobby(h, seq, -1, "", 8000);
        if (!s.room) return realNow();
        seq = s.room.seq;
        if (s.room.view.phase !== "arrange") return realNow();
        if (realNow() > endsAt + 6000) return Infinity;
      }
    }),
  );
  const lag = seen.map((t) => t - endsAt);
  await L.leaveRoom(humans[0].id);
  await L.leaveRoom(humans[1].id);
  return lag;
}

// ---- 3. every other open-table mode: human bots (engine AI on the raw state) vs CPUs / each other ----
const M = {
  uno: await import("../server/bundled/uno.mjs"),
  flip7: await import("../server/bundled/flip.mjs"),
  bj: await import("../server/bundled/bj.mjs"),
  m24: await import("../server/bundled/m24.mjs"),
  holdem: await import("../server/bundled/holdem.mjs"),
  ecard: await import("../server/bundled/ecard.mjs"),
  gomoku: await import("../server/bundled/gomoku.mjs"),
  ttt: await import("../server/bundled/ttt.mjs"),
  c4: await import("../server/bundled/c4.mjs"),
};

const isOver = (s) => s?.phase === "over" || s?.street === "over";

/** The action a (human-controlled) player `id` would take now, or null when it is not their move. */
function humanAction(game, s, id) {
  const cur = s.players?.[s.turn];
  const mineTurn = cur?.id === id;
  switch (game) {
    case "uno":
      return mineTurn ? M.uno.aiUno(s) : null;
    case "flip7": {
      if (!mineTurn) return null;
      if (s.phase === "target") return { type: "target", targetId: M.flip7.aiTarget(s) };
      if (s.phase === "action") return cur.pendingFlip3 > 0 ? { type: "hit" } : { type: M.flip7.aiDecide(s) };
      return null;
    }
    case "bj":
      return mineTurn && s.phase === "play" ? M.bj.aiBjAction(s) : null;
    case "m24":
      return s.phase === "play" && s.solution ? { type: "submit", expr: s.solution } : null;
    case "holdem":
      if (s.street === "showdown") return id === s.players[0]?.id ? { type: "next" } : null;
      return mineTurn && s.street !== "lobby" ? M.holdem.holdemBotAct(s, id) : null;
    case "gomoku": {
      if (s.rpsReveal) return null;
      if (s.phase === "rps") return s.rpsThrows?.[id] ? null : M.gomoku.aiGomoku(s);
      return mineTurn && s.phase === "play" ? M.gomoku.aiGomoku(s) : null;
    }
    case "ttt":
      return mineTurn && s.phase === "play" ? M.ttt.aiTtt(s) : null;
    case "c4":
      return mineTurn && s.phase === "play" ? M.c4.aiC4(s) : null;
    case "ecard": {
      if (s.rpsReveal) return null;
      if (s.phase === "reveal") return { type: "next" };
      if (s.phase === "rps") return s.rpsThrows?.[id] ? null : M.ecard.aiEcard(s, id);
      if (s.phase === "role") return s.roleChooserId === id ? M.ecard.aiEcard(s, id) : null;
      if (s.phase === "pick") {
        const me = s.players.find((p) => p.id === id);
        if (!me || me.locked) return null;
        return me.selectedId ? { type: "lock" } : M.ecard.aiEcard(s, id);
      }
      return null;
    }
    default:
      return null;
  }
}

async function playGeneric(game, humans, cpus, label, cap) {
  await reset(humans);
  let roomId;
  if (humans.length === 1) {
    roomId = (await L.adjustCpu(humans[0], game, "open", undefined, {})).room.id;
  } else {
    await L.enqueueMatch(humans[0], game, {});
    const r = await L.enqueueMatch(humans[1], game, {});
    roomId = r.room?.id ?? (await view(humans[0])).id;
  }
  const room0 = await view(humans[0]);
  const host = humans.find((h) => h.id === room0.seats[0]) ?? humans[0];
  for (let i = 0; i < cpus; i++) await L.adjustCpu(host, game, "add", undefined, {});
  await touch(humans);
  for (const h of humans) await L.applyRoomAction(h, roomId, { type: "ready" });
  let idle = 0;
  let lastSeq = -1;
  let errors = 0;
  for (let step = 0; step < cap; step++) {
    await touch(humans);
    const rec = await L.peekRoomRecord(roomId);
    assert.ok(rec, `${label}: room vanished`);
    const s = rec.state;
    if (isOver(s)) return { steps: step, errors };
    const views = await Promise.all(humans.map((h) => view(h)));
    for (const v of views) assert.ok(v, `${label}: a viewer lost the room`);
    for (const v of views.slice(1)) assert.equal(v.seq, views[0].seq, `${label}: viewers disagree on seq`);
    let acted = false;
    for (const h of shuffle(humans)) {
      let a = null;
      try {
        a = humanAction(game, s, h.id);
      } catch (err) {
        throw new Error(`${label}: bot brain threw in phase ${s.phase ?? s.street}: ${err.message}`);
      }
      if (!a) continue;
      try {
        await L.applyRoomAction(h, roomId, a);
        acted = true;
      } catch (err) {
        errors++;
        assert.ok(errors < 25, `${label}: too many rejected bot actions (${err.message}) in ${s.phase ?? s.street}`);
      }
      break;
    }
    if (acted) {
      idle = 0;
      continue;
    }
    if (views[0].seq !== lastSeq) {
      lastSeq = views[0].seq;
      idle = 0;
    }
    idle++;
    assert.ok(idle < 40, `${label}: stalled in ${s.phase ?? s.street} (turn ${s.turn}) at seq ${views[0].seq}`);
    advance(game === "m24" ? 8200 : s.rpsReveal || s.endsAt ? 3200 : 450);
    await Promise.all(humans.map((h) => L.watchLobby(h, -1, -1, "", 50)));
  }
  return { steps: cap, errors, unfinished: true };
}

const GENERIC = [
  { game: "uno", cpus: [1, 2, 3], humans: [1, 2], cap: 3000 },
  { game: "flip7", cpus: [1, 3], humans: [1, 2], cap: 3000 },
  { game: "gomoku", cpus: [1], humans: [1, 2], cap: 800 },
  { game: "ttt", cpus: [1], humans: [1, 2], cap: 100 },
  { game: "c4", cpus: [1], humans: [1, 2], cap: 200 },
  { game: "ecard", cpus: [1], humans: [1, 2], cap: 1500 },
  { game: "bj", cpus: [1], humans: [1, 2], cap: 1500 },
  { game: "m24", cpus: [1], humans: [1], cap: 600 },
  { game: "holdem", cpus: [1], humans: [1, 2], cap: 6000 },
];
async function runGeneric(games) {
  for (const g of GENERIC.filter((x) => !games || games.includes(x.game))) {
    for (const nh of g.humans) {
      for (const nc of nh === 2 && g.game !== "uno" && g.game !== "flip7" ? [0] : g.cpus) {
        // The gomoku CPU shells out to a real engine (seconds per move) — keep that one short.
        const rounds = g.game === "gomoku" && nc > 0 ? Math.min(GAMES, 2) : GAMES;
        await section(`${g.game} ${nh} human + ${nc} CPU x${rounds}`, async () => {
          let steps = 0;
          let unfinished = 0;
          for (let i = 0; i < rounds; i++) {
            const humans = Array.from({ length: nh }, (_, k) => mkUser(`g${k}`));
            const r = await playGeneric(g.game, humans, nc, `${g.game}/${nh}h${nc}c#${i}`, g.cap);
            steps += r.steps;
            if (r.unfinished) unfinished++;
            for (const h of humans) await L.leaveRoom(h.id);
          }
          return `${steps} steps${unfinished ? `, ${unfinished} hit the step cap` : ""}`;
        });
      }
    }
  }
}

// ---- run -----------------------------------------------------------------------------------
const results = [];
async function section(name, fn) {
  const t0 = realNow();
  try {
    const out = await fn();
    results.push([name, "ok", out]);
    console.log(`ok   ${name}${out !== undefined ? ` (${out})` : ""}  ${realNow() - t0}ms`);
  } catch (err) {
    results.push([name, "FAIL", err]);
    console.log(`FAIL ${name}: ${err?.message || err}`);
    if (process.env.STACK) console.log(err?.stack);
  }
}

const GAMES = Number(process.env.GAMES || 6);
const configs = [
  { name: "1 human + 1 CPU", humans: 1, cpus: 1 },
  { name: "1 human + 2 CPUs", humans: 1, cpus: 2 },
  { name: "1 human + 3 CPUs (4P)", humans: 1, cpus: 3 },
  { name: "2 humans", humans: 2, cpus: 0 },
  { name: "2 humans + 1 CPU", humans: 2, cpus: 1 },
  { name: "2 humans + 2 CPUs (4P)", humans: 2, cpus: 2 },
];
for (const cfg of configs) {
  for (const useJokers of [true, false]) {
    for (const concurrent of [false, true]) {
      await section(`coda ${cfg.name} jokers=${useJokers} ${concurrent ? "concurrent" : "serial"} x${GAMES}`, async () => {
        let steps = 0;
        for (let g = 0; g < GAMES; g++) {
          const humans = Array.from({ length: cfg.humans }, (_, i) => mkUser(`c${i}`));
          const r = await playCoda({
            humans,
            cpus: cfg.cpus,
            useJokers,
            concurrent,
            label: `${cfg.name}/${useJokers ? "J" : "noJ"}/${concurrent ? "conc" : "ser"}#${g}`,
          });
          steps += r.steps;
          for (const h of humans) await L.leaveRoom(h.id);
        }
        return `${steps} steps`;
      });
    }
  }
}

await section("coda arrange expiry is serialised (no divergent tables)", async () => {
  const diverged = await raceArrange(Number(process.env.RACES || 30));
  assert.equal(diverged, 0, `${diverged} races produced different tables for different viewers`);
  return "0 divergences";
});

await runGeneric(process.env.ONLY ? process.env.ONLY.split(",") : undefined);

if (!process.env.QUICK) {
  await section("coda arrange expiry latency (real clock)", async () => {
    const lag = await arrangeLatency();
    for (const ms of lag) assert.ok(ms >= -50 && ms < 400, `viewer saw the insert ${ms}ms after the deadline`);
    return lag.map((x) => `${x}ms`).join(", ");
  });
}

const failed = results.filter((r) => r[1] === "FAIL");
console.log(failed.length ? `\n${failed.length} FAILED` : "\nall online bot checks passed");
process.exit(failed.length ? 1 : 0);
