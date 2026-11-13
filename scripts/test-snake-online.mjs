// Real-time snake world test: headless clients run the same predict/reconcile loop as SnakePage
// against the real lobby (memory store) with simulated network latency, and we measure what a
// player would *see*: own-snake teleports, food that vanishes/reappears, tail twitches, peers
// that blink or jump.
//   node scripts/test-snake-online.mjs
//   SECONDS=20 LAT=90 JITTER=40 CLIENTS=2 node scripts/test-snake-online.mjs
import * as S from "../server/bundled/snake.mjs";

const L = await import("../server/lobby.mjs");

const SECONDS = Number(process.env.SECONDS || 20);
const LAT = Number(process.env.LAT || 60); // one-way ms
const JITTER = Number(process.env.JITTER || 30);
const CLIENTS = Number(process.env.CLIENTS || 2);
const VIEW = Number(process.env.VIEW || 70); // draw radius a wide window can show
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lat = () => LAT + Math.random() * JITTER;

class Client {
  constructor(i) {
    this.user = { id: `hu_snake_${i}`, name: `Snaker${i}`, email: `snaker${i}@test.local` };
    this.id = this.user.id;
    this.live = null;
    this.lastTick = -1;
    this.memo = S.newNetMemo();
    this.stepAt = performance.now();
    this.running = true;
    this.m = {
      frames: 0,
      ownJumps: 0,
      worstJump: 0,
      foodReappear: 0,
      foodVanish: 0, // food in draw range vanished while we were not eating it
      tailTwitch: 0,
      peerJumps: 0,
      peerBlink: 0,
      deaths: 0,
      drift: [],
      aimsSent: 0,
    };
    this.prev = null;
    this.seenFoods = new Map(); // id -> {inView, lastSeenFrame}
    this.gone = new Map(); // id -> frame removed
    this.lastAimSent = null;
    this.lastAimAt = 0;
  }

  async start() {
    await L.touchPresence(this.user);
    await L.leaveRoom(this.id);
    await L.joinSnakeWorld(this.user);
    void this.pollLoop();
    this.timer = setInterval(() => this.pump(), 16);
  }

  async pollLoop() {
    let seq = 0;
    while (this.running) {
      await sleep(lat() / 2); // request travels up
      let snap;
      try {
        snap = await L.watchLobby(this.user, seq, -1, "", 1500);
      } catch {
        continue;
      }
      await sleep(lat() / 2 + LAT / 2); // response travels down
      if (!this.running) return;
      const room = snap.room && JSON.parse(JSON.stringify(snap.room));
      if (!room || room.game !== "snake") continue;
      if (room.seq < seq) continue;
      seq = room.seq;
      this.onView(room.view);
    }
  }

  onView(view) {
    if (view.tick <= this.lastTick && this.live) return;
    this.lastTick = view.tick;
    this.live = S.reconcileSnake(view, this.live, this.id, this.memo);
  }

  /** Same fixed-timestep accumulator as SnakePage: timer jitter must not change game speed. */
  pump() {
    const t = performance.now();
    let steps = Math.floor((t - this.stepAt) / S.TICK_MS);
    if (steps <= 0) return;
    steps = Math.min(steps, 3);
    this.stepAt += steps * S.TICK_MS;
    if (t - this.stepAt > 200) this.stepAt = t;
    for (let i = 0; i < steps; i++) this.frame();
  }

  frame() {
    let cur = this.live;
    if (!cur) return;
    const me0 = cur.players.find((p) => p.id === this.id);
    if (me0?.alive) {
      const act = process.env.SUICIDE ? { type: "aim", angle: this.swerve ?? 0.3 } : S.aiSnake(cur, this.id);
      cur = S.applySnakeAction(cur, this.id, act);
      this.sendAim(act.angle);
    }
    cur = S.stepSelfPredict(cur, this.id, Date.now(), this.memo);
    this.everEaten ??= new Set();
    for (const k of this.memo.eaten.keys()) this.everEaten.add(k);
    cur = S.smoothPeers(cur, this.memo, this.id);
    this.live = cur;
    this.measure(cur);
  }

  nextN() {
    this.n = Math.max((this.n || 0) + 1, Date.now());
    return this.n;
  }

  sendAim(angle) {
    const now = performance.now();
    if (this.lastAimSent != null && now - this.lastAimAt < 20 && Math.abs(angle - this.lastAimSent) < 0.05) return;
    this.lastAimSent = angle;
    this.lastAimAt = now;
    this.m.aimsSent++;
    const d = lat();
    const n = this.nextN();
    setTimeout(() => {
      if (this.running) void L.applyRoomAction(this.user, "snake-world", { type: "aim", angle, n }).catch(() => {});
    }, d);
  }

  measure(cur) {
    const m = this.m;
    m.frames++;
    const me = cur.players.find((p) => p.id === this.id);
    const prev = this.prev;
    if (me && prev?.me && me.alive && prev.me.alive) {
      const j = Math.hypot(me.x - prev.me.x, me.y - prev.me.y);
      m.worstJump = Math.max(m.worstJump, j);
      if (j > 2.2) m.ownJumps++; // max legit step is ~1.07 (boost)
      if (me.path.length < prev.me.path.length - 1 && me.score >= prev.me.score) m.tailTwitch++;
      if (me.path.length < prev.me.path.length && me.score > prev.me.score) m.tailTwitch++;
    }
    if (prev?.me?.alive && me && !me.alive) m.deaths++;
    if (prev?.me && !prev.me.alive && me?.alive) m.respawns = (m.respawns || 0) + 1;

    // food: ids visible now vs previous frame
    if (me?.alive) {
      const ids = new Set();
      for (const f of cur.foods) {
        const d = Math.hypot(f.x - me.x, f.y - me.y);
        if (d > VIEW) continue;
        ids.add(f.id);
        if (this.gone.has(f.id) && m.frames - this.gone.get(f.id) < 120) {
          m.foodReappear++;
          if (process.env.DEBUG) console.log("reappear", f.id, "framesGone", m.frames - this.gone.get(f.id), "wasEaten", this.everEaten?.has(f.id), "distNow", d.toFixed(1));
          this.gone.delete(f.id);
        }
      }
      if (prev?.foodIds) {
        for (const id of prev.foodIds) {
          if (ids.has(id)) continue;
          // vanished: legit only if we are within pickup range of where it was
          const pf = prev.foodPos.get(id);
          const dEat = pf ? Math.hypot(pf.x - me.x, pf.y - me.y) : 99;
          // Food that slid across the edge of the draw window is not a vanish/reappear.
          if (!pf || dEat > VIEW - 6) continue;
          // A rival head right on top of it explains the pickup.
          let rivalAte = false;
          for (const q of prev.peers.values()) if (Math.hypot(q.x - pf.x, q.y - pf.y) < 7) rivalAte = true;
          if (!rivalAte && dEat > 4.8) m.foodVanish++;
          if (!rivalAte) this.gone.set(id, m.frames);
        }
      }
      this.prev = { me, foodIds: ids, foodPos: new Map(cur.foods.filter((f) => ids.has(f.id)).map((f) => [f.id, f])), peers: peerMap(cur, this.id) };
    } else {
      this.prev = { me, foodIds: null, peers: peerMap(cur, this.id) };
    }

    // peers
    const peers = peerMap(cur, this.id);
    if (prev?.peers && me?.alive) {
      for (const [id, p] of peers) {
        const q = prev.peers.get(id);
        if (!q) continue;
        const dNow = Math.hypot(p.x - me.x, p.y - me.y);
        if (dNow > VIEW) continue;
        if (q.visible && !p.visible) m.peerBlink++;
        if (q.visible && p.visible && q.alive && p.alive) {
          const j = Math.hypot(p.x - q.x, p.y - q.y);
          if (j > 3.2) m.peerJumps++;
        }
      }
    }
  }

  async stop() {
    this.running = false;
    clearInterval(this.timer);
    await L.leaveRoom(this.id).catch(() => {});
  }
}

function peerMap(cur, youId) {
  const map = new Map();
  for (const p of cur.players) {
    if (p.id === youId) continue;
    map.set(p.id, { x: p.x, y: p.y, alive: p.alive, visible: p.path.length > 0 });
  }
  return map;
}

const clients = Array.from({ length: CLIENTS }, (_, i) => new Client(i + 1));
for (const c of clients) await c.start();

// drift: compare each client's predicted head with the server's truth
let srvTick0 = null;
let srvTick1 = 0;
const t0 = performance.now();
const driftTimer = setInterval(async () => {
  const rec = await L.peekRoomRecord("snake-world").catch(() => null);
  if (!rec) return;
  if (srvTick0 == null) srvTick0 = { tick: rec.state.tick, at: performance.now() };
  srvTick1 = { tick: rec.state.tick, at: performance.now() };
  for (const c of clients) {
    const sp = rec.state?.players?.find((p) => p.id === c.id);
    const lp = c.live?.players?.find((p) => p.id === c.id);
    if (sp?.alive && lp?.alive) {
      const e = Math.hypot(sp.x - lp.x, sp.y - lp.y);
      c.m.drift.push(e);
      if (process.env.DEBUG && e > 6) console.log(`drift ${e.toFixed(1)} along ${((lp.x - sp.x) * Math.cos(sp.angle) + (lp.y - sp.y) * Math.sin(sp.angle)).toFixed(1)} srv(angle ${sp.angle.toFixed(2)} aim ${sp.aim.toFixed(2)} len ${sp.path.length} score ${sp.score}) loc(angle ${lp.angle.toFixed(2)} aim ${lp.aim.toFixed(2)} len ${lp.path.length} score ${lp.score}) pend ${c.memo.eaten.size}`);
    }
  }
}, 250);

await sleep(SECONDS * 1000);
clearInterval(driftTimer);
if (srvTick0) console.log(`server ticks/s: ${(((srvTick1.tick - srvTick0.tick) * 1000) / (srvTick1.at - srvTick0.at)).toFixed(1)}`);
let failures = 0;
const limits = { ownJumps: 0, foodReappear: 5, foodVanish: 5, tailTwitch: 2, peerJumps: 3, peerBlink: 2 };
for (const c of clients) {
  const m = c.m;
  const d = m.drift.slice().sort((a, b) => a - b);
  const p95 = d.length ? d[Math.floor(d.length * 0.95)] : 0;
  const fps = (m.frames / SECONDS).toFixed(1);
  console.log(
    `client ${c.id}: frames=${m.frames} (${fps}/s) ownJumps=${m.ownJumps} worstJump=${m.worstJump.toFixed(2)} foodReappear=${m.foodReappear} foodVanish=${m.foodVanish} tailTwitch=${m.tailTwitch} peerJumps=${m.peerJumps} peerBlink=${m.peerBlink} deaths=${m.deaths} respawns=${m.respawns || 0} driftP95=${p95.toFixed(1)} aims=${m.aimsSent}`,
  );
  for (const [k, lim] of Object.entries(limits)) {
    if (m[k] > lim) {
      failures++;
      console.log(`  FAIL ${k}=${m[k]} > ${lim}`);
    }
  }
  if (p95 > 9) {
    failures++;
    console.log(`  FAIL drift p95 ${p95.toFixed(1)} > 9 (client position diverges from the server)`);
  }
}
if (process.env.SUICIDE) for (const c of clients) if ((c.m.respawns || 0) < 1 || c.m.deaths < 1) { failures++; console.log(`  FAIL ${c.id}: never died/respawned in suicide mode`); }
for (const c of clients) await c.stop();
console.log(failures ? `\n${failures} failure(s)` : "\nall snake online checks passed");
process.exit(failures ? 1 : 0);

