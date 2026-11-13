// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/snake/engine.ts
var WORLD = 200;
var TICK_MS = 33;
var VIEW_RADIUS = 42;
var START_LEN = 18;
var FOOD_COUNT = 80;
var FOOD_SOFT_CAP = FOOD_COUNT + 180;
var CORPSE_STRIDE = 2;
var CORPSE_MAX = 52;
var SPEED = 0.58;
var BOOST_MULT = 1.85;
var BOOST_DRAIN_EVERY = 4;
var BOOST_DRAIN = 2.5;
var ENERGY_MAX = 100;
var ENERGY_PER_FOOD = 7;
var ENERGY_START = 24;
var TURN_RATE_MAX = 0.92;
var TURN_RATE_MIN = 0.2;
var TURN_MASS_HALF = 48;
var TURN_RATE = TURN_RATE_MAX;
var HEAD_R = 1.35;
var FOOD_R = 0.85;
var PATH_STEP = 0.55;
var FOOD_PICK = HEAD_R + FOOD_R;
var FOOD_PICK_HUMAN = FOOD_PICK * 1.8;
var FOOD_PICK_SURE = FOOD_PICK * 0.6;
var RESPAWN_MS = 700;
var SHIELD_MS = 5e3;
var SNAKE_WORLD_ID = "snake-world";
var HUES = [150, 12, 210, 48, 280, 30, 190, 330];
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function normAngle(a) {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
}
function turnToward(current, target, maxDelta) {
  const diff = normAngle(target - current);
  if (Math.abs(diff) <= maxDelta) return target;
  return normAngle(current + Math.sign(diff) * maxDelta);
}
function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
function hueFor(id, index) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = h * 31 + id.charCodeAt(i) >>> 0;
  return HUES[index % HUES.length] ?? h % 360;
}
function randomPoint(pad = 8) {
  return {
    x: pad + Math.random() * (WORLD - pad * 2),
    y: pad + Math.random() * (WORLD - pad * 2)
  };
}
function buildPath(x, y, angle, len) {
  const path = [{ x, y }];
  let px = x;
  let py = y;
  const back = angle + Math.PI;
  for (let i = 1; i < len; i++) {
    px += Math.cos(back) * PATH_STEP;
    py += Math.sin(back) * PATH_STEP;
    path.push({ x: px, y: py });
  }
  return path;
}
function canBoost(p) {
  return Boolean(p.alive && p.energy > 0);
}
function turnRateFor(p) {
  const mass = Math.max(START_LEN, p.path.length) + Math.max(0, p.score) * 1.6;
  const agility = 1 / (1 + (mass - START_LEN) / TURN_MASS_HALF);
  let rate = TURN_RATE_MIN + (TURN_RATE_MAX - TURN_RATE_MIN) * agility;
  if (p.boosting) rate *= 0.86;
  return rate;
}
function isShielded(p, now = Date.now()) {
  return Boolean(p.alive && p.shieldUntil != null && now < p.shieldUntil);
}
function spawnPlayer(person, index, now = Date.now()) {
  const pt = randomPoint(12);
  const angle = Math.random() * Math.PI * 2;
  return {
    id: person.id,
    name: person.name,
    human: person.human !== false,
    x: pt.x,
    y: pt.y,
    angle,
    aim: angle,
    path: buildPath(pt.x, pt.y, angle, START_LEN),
    alive: true,
    score: 0,
    energy: ENERGY_START,
    hue: hueFor(person.id, index),
    respawnAt: null,
    boosting: false,
    shieldUntil: now + SHIELD_MS
  };
}
function seedFoods(n = FOOD_COUNT) {
  return Array.from({ length: n }, () => {
    const p = randomPoint(4);
    return { id: uid("f"), x: p.x, y: p.y };
  });
}
function emptyWorld(mode = "world") {
  return {
    mode,
    players: [],
    foods: seedFoods(),
    phase: "play",
    tick: 0,
    log: [{ id: uid("l"), text: "Global snake arena. Steer to twist. Hold Space to boost." }]
  };
}
function createSnakeWorld() {
  return emptyWorld("world");
}
function startSnakePractice(cpus = 2) {
  const n = Math.max(0, Math.min(6, Math.floor(cpus) || 0));
  const people = [
    { id: "you", name: "YOU", human: true },
    ...Array.from({ length: n }, (_, i) => ({
      id: i === 0 ? "cpu" : `cpu-${i + 1}`,
      name: i === 0 ? "CPU" : `CPU ${i + 1}`,
      human: false
    }))
  ];
  const state = emptyWorld("practice");
  state.players = people.map((p, i) => spawnPlayer(p, i));
  state.log = [{ id: uid("l"), text: "Practice arena. Same physics as the global map." }];
  return state;
}
function startSnakeLobby(_people) {
  return createSnakeWorld();
}
function startSnakeDuel(a, b) {
  const state = createSnakeWorld();
  state.mode = "practice";
  state.players = [spawnPlayer(a, 0), spawnPlayer(b, 1)];
  return state;
}
function finishCountdown(state) {
  return { ...state, phase: "play" };
}
function joinSnake(state, person) {
  const id = String(person.id);
  if (state.players.some((p) => p.id === id)) return state;
  const player = spawnPlayer(person, state.players.length);
  return {
    ...state,
    phase: "play",
    players: [...state.players, player],
    log: [...state.log, { id: uid("l"), text: `${person.name} entered the arena.` }].slice(-40)
  };
}
function leaveSnake(state, playerId) {
  const id = String(playerId);
  const gone = state.players.find((p) => p.id === id);
  if (!gone) return state;
  return {
    ...state,
    players: state.players.filter((p) => p.id !== id),
    log: [...state.log, { id: uid("l"), text: `${gone.name} left.` }].slice(-40)
  };
}
function aimFromDir(x, y) {
  if (!x && !y) return null;
  return Math.atan2(y, x);
}
function applySnakeAction(state, actorId, action) {
  if (action.type === "join") {
    const existing = state.players.find((p) => p.id === actorId);
    if (existing) return state;
    return joinSnake(state, { id: actorId, name: actorId, human: true });
  }
  if (action.type === "leave") return leaveSnake(state, actorId);
  const me = state.players.find((p) => p.id === actorId);
  if (!me || !me.alive && !me.respawnAt) return state;
  const seq = typeof action.n === "number" && Number.isFinite(action.n) ? action.n : void 0;
  if (seq !== void 0 && me.an !== void 0 && seq <= me.an) return state;
  if (action.type === "boost") {
    return {
      ...state,
      players: state.players.map(
        (p) => p.id === actorId ? { ...p, boosting: Boolean(action.on) && p.alive, an: seq ?? p.an } : p
      )
    };
  }
  let angle = null;
  if (action.type === "aim" && Number.isFinite(action.angle)) angle = action.angle;
  else if (action.type === "dir") angle = aimFromDir(action.x, action.y);
  if (angle == null) return state;
  return {
    ...state,
    players: state.players.map((p) => p.id === actorId ? { ...p, aim: angle, an: seq ?? p.an } : p)
  };
}
function segmentHit(head, path, skip, radius) {
  const r2 = radius * radius;
  for (let i = skip; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((head.x - a.x) * dx + (head.y - a.y) * dy) / len2;
    t = clamp(t, 0, 1);
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    if (dist2(head, { x: cx, y: cy }) <= r2) return true;
  }
  return false;
}
function respawnNow(p, index, now) {
  const fresh = spawnPlayer({ id: p.id, name: p.name, human: p.human }, index, now);
  return { ...fresh, score: 0, energy: ENERGY_START, hue: p.hue, boosting: false, shieldUntil: now + SHIELD_MS, an: p.an };
}
function scatterCorpse(path, hue) {
  if (!path.length) return [];
  const stride = path.length > 60 ? 3 : CORPSE_STRIDE;
  const drops = [];
  for (let i = 0; i < path.length && drops.length < CORPSE_MAX; i += stride) {
    const pt = path[i];
    const x = clamp(pt.x + (Math.random() - 0.5) * 1.4, FOOD_R, WORLD - FOOD_R);
    const y = clamp(pt.y + (Math.random() - 0.5) * 1.4, FOOD_R, WORLD - FOOD_R);
    drops.push({ id: uid("c"), x, y, hue });
  }
  if (drops.length < 3) {
    for (const pt of path.slice(0, 3)) {
      drops.push({
        id: uid("c"),
        x: clamp(pt.x, FOOD_R, WORLD - FOOD_R),
        y: clamp(pt.y, FOOD_R, WORLD - FOOD_R),
        hue
      });
    }
  }
  return drops.slice(0, CORPSE_MAX);
}
function killSnake(p, now) {
  return {
    drops: scatterCorpse(p.path, p.hue),
    player: {
      ...p,
      alive: false,
      boosting: false,
      score: 0,
      energy: 0,
      respawnAt: now + RESPAWN_MS,
      path: p.path.slice(0, 3),
      shieldUntil: null
    }
  };
}
function stepSnake(state, now = Date.now()) {
  if (state.phase === "over" && state.mode === "world") {
    state = { ...state, phase: "play" };
  }
  let foods = state.foods.slice();
  const tick = state.tick + 1;
  const players = state.players.map((p, index) => {
    if (!p.alive) {
      if (p.respawnAt && now >= p.respawnAt) return respawnNow(p, index, now);
      return { ...p, boosting: false };
    }
    let energy = p.energy;
    const boosting = Boolean(p.boosting) && canBoost(p);
    const spd = boosting ? SPEED * BOOST_MULT : SPEED;
    const angle = turnToward(p.angle, p.aim, turnRateFor({ ...p, boosting }));
    const x = p.x + Math.cos(angle) * spd;
    const y = p.y + Math.sin(angle) * spd;
    let path = [{ x, y }, ...p.path];
    const score = p.score;
    if (boosting && tick % BOOST_DRAIN_EVERY === 0) {
      energy = Math.max(0, energy - BOOST_DRAIN);
    }
    const maxPts = START_LEN + Math.floor(score * 2.2);
    if (path.length > maxPts) path = path.slice(0, maxPts);
    return { ...p, x, y, angle, path, score, energy, boosting: boosting && energy > 0 };
  });
  const next = players.map((p, i) => {
    if (!p.alive) return p;
    const shielded = isShielded(p, now);
    let dead = false;
    if (p.x < HEAD_R || p.y < HEAD_R || p.x > WORLD - HEAD_R || p.y > WORLD - HEAD_R) {
      if (shielded) {
        return {
          ...p,
          x: clamp(p.x, HEAD_R, WORLD - HEAD_R),
          y: clamp(p.y, HEAD_R, WORLD - HEAD_R)
        };
      }
      dead = true;
    }
    if (!dead) {
      for (let j = 0; j < players.length; j++) {
        if (j === i) continue;
        const other = players[j];
        if (!other.alive) continue;
        if (isShielded(other, now) || shielded) continue;
        if (segmentHit({ x: p.x, y: p.y }, other.path, 0, HEAD_R * 0.95)) {
          dead = true;
          break;
        }
      }
    }
    if (dead) {
      const killed = killSnake(p, now);
      foods = foods.concat(killed.drops);
      return killed.player;
    }
    let score = p.score;
    let energy = p.energy;
    let path = p.path;
    const kept = [];
    const reachR = p.human ? FOOD_PICK_HUMAN : FOOD_PICK;
    const reach2 = reachR * reachR;
    for (const f of foods) {
      if (dist2({ x: p.x, y: p.y }, f) <= reach2) {
        score += 1;
        energy = Math.min(ENERGY_MAX, energy + ENERGY_PER_FOOD);
        const tip = path[path.length - 1] ?? { x: p.x, y: p.y };
        path = [...path, { x: tip.x, y: tip.y }];
      } else kept.push(f);
    }
    foods = kept;
    return {
      ...p,
      score,
      energy,
      path,
      boosting: p.boosting && canBoost({ alive: p.alive, energy })
    };
  });
  while (foods.length < FOOD_COUNT) {
    const pt = randomPoint(4);
    foods.push({ id: uid("f"), x: pt.x, y: pt.y });
  }
  if (foods.length > FOOD_SOFT_CAP) foods = foods.slice(foods.length - FOOD_SOFT_CAP);
  return {
    ...state,
    players: next,
    foods,
    phase: "play",
    tick
  };
}
var stepSnakeWorld = stepSnake;
function lerpAngle(a, b, t) {
  return normAngle(a + normAngle(b - a) * t);
}
function newNetMemo() {
  return { eaten: /* @__PURE__ */ new Map(), peers: /* @__PURE__ */ new Map(), revived: /* @__PURE__ */ new Set() };
}
var SELF_LEAD_MAX = 5.5;
var EATEN_TTL_MS = 1800;
function shiftPlayer(p, dx, dy) {
  return { ...p, x: p.x + dx, y: p.y + dy, path: p.path.map((c) => ({ x: c.x + dx, y: c.y + dy })) };
}
function reconcileSnake(server, local, youId, memo) {
  const now = Date.now();
  if (memo) {
    memo.peers.clear();
    for (const p of server.players) if (p.id !== youId) memo.peers.set(p.id, p);
  }
  if (!local || !youId) return server;
  const mine = local.players.find((p) => p.id === youId);
  const theirs = server.players.find((p) => p.id === youId);
  let foods = server.foods;
  let pending = 0;
  if (memo && memo.eaten.size) {
    const live = new Set(server.foods.map((f) => f.id));
    for (const [id, t] of memo.eaten) {
      if (!live.has(id)) memo.eaten.delete(id);
      else if (now - t > EATEN_TTL_MS) {
        memo.eaten.delete(id);
        memo.revived.add(id);
      } else pending++;
    }
    if (memo.eaten.size) foods = server.foods.filter((f) => !memo.eaten.has(f.id));
  }
  if (!mine || !theirs) return { ...server, foods, tick: Math.max(server.tick, local.tick) };
  let self;
  if (mine.alive !== theirs.alive || !theirs.alive) {
    self = { ...theirs, aim: mine.aim, boosting: Boolean(mine.boosting && theirs.alive) };
  } else {
    self = {
      ...mine,
      id: theirs.id,
      name: theirs.name,
      human: theirs.human,
      hue: theirs.hue,
      score: theirs.score + pending,
      shieldUntil: theirs.shieldUntil,
      energy: Math.abs(mine.energy - theirs.energy) > 30 ? theirs.energy : mine.energy,
      aim: mine.aim,
      boosting: mine.boosting && mine.alive,
      alive: true,
      respawnAt: null
    };
    const dx = self.x - theirs.x;
    const dy = self.y - theirs.y;
    const err = Math.hypot(dx, dy);
    const lead = mine.boosting ? SELF_LEAD_MAX * 1.8 : SELF_LEAD_MAX;
    if (err > lead * 3) {
      self = { ...self, x: theirs.x, y: theirs.y, angle: theirs.angle, path: theirs.path.length ? theirs.path : self.path };
    } else if (err > lead) {
      const pull = (err - lead) * 0.25 / err;
      self = shiftPlayer(self, -dx * pull, -dy * pull);
    }
  }
  const prevById = new Map(local.players.map((p) => [p.id, p]));
  const players = server.players.map((p) => {
    if (p.id === youId) return self;
    const prev = prevById.get(p.id);
    if (!prev || !prev.alive || !p.alive || !prev.path.length) return p;
    if (!p.path.length) return { ...prev, name: p.name, hue: p.hue, score: p.score, alive: p.alive };
    return {
      ...p,
      x: prev.x,
      y: prev.y,
      angle: prev.angle,
      path: prev.path
    };
  });
  return { ...server, foods, tick: Math.max(server.tick, local.tick), players };
}
function smoothPeers(state, memo, youId, k = 0.3) {
  if (!memo.peers.size) return state;
  let changed = false;
  const players = state.players.map((p) => {
    if (p.id === youId) return p;
    const t = memo.peers.get(p.id);
    if (!t || !t.alive || !p.alive || !t.path.length || !p.path.length) return p;
    const off = Math.hypot(t.x - p.x, t.y - p.y);
    if (off < 0.02 && p.path.length === t.path.length) return p;
    changed = true;
    if (off > 25) return { ...p, x: t.x, y: t.y, angle: t.angle, path: t.path };
    const path = t.path.map((tp, i) => {
      const dp = p.path[i];
      return dp ? { x: dp.x + (tp.x - dp.x) * k, y: dp.y + (tp.y - dp.y) * k } : tp;
    });
    const head = path[0];
    return { ...p, x: head.x, y: head.y, angle: lerpAngle(p.angle, t.angle, k), path };
  });
  return changed ? { ...state, players } : state;
}
function stepSelfPredict(state, youId, now = Date.now(), memo) {
  const tick = state.tick + 1;
  const me = state.players.find((p) => p.id === youId);
  if (!me) return { ...state, tick };
  if (!me.alive) {
    return { ...state, tick, players: state.players.map((p) => p.id === youId ? { ...p, boosting: false } : p) };
  }
  let energy = me.energy;
  const boosting = Boolean(me.boosting) && canBoost(me);
  const spd = boosting ? SPEED * BOOST_MULT : SPEED;
  const angle = turnToward(me.angle, me.aim, turnRateFor({ ...me, boosting }));
  const x = clamp(me.x + Math.cos(angle) * spd, HEAD_R * 0.5, WORLD - HEAD_R * 0.5);
  const y = clamp(me.y + Math.sin(angle) * spd, HEAD_R * 0.5, WORLD - HEAD_R * 0.5);
  let path = [{ x, y }, ...me.path];
  let score = me.score;
  if (boosting && tick % BOOST_DRAIN_EVERY === 0) energy = Math.max(0, energy - BOOST_DRAIN);
  const maxPts = START_LEN + Math.floor(score * 2.2);
  if (path.length > maxPts) path = path.slice(0, maxPts);
  const kept = [];
  const reach2 = FOOD_PICK_SURE * FOOD_PICK_SURE;
  for (const f of state.foods) {
    if (dist2({ x, y }, f) <= reach2) {
      score += 1;
      energy = Math.min(ENERGY_MAX, energy + ENERGY_PER_FOOD);
      const tip = path[path.length - 1] ?? { x, y };
      path = [...path, { x: tip.x, y: tip.y }];
      memo?.eaten.set(f.id, now);
    } else kept.push(f);
  }
  const nextMe = { ...me, x, y, angle, path, score, energy, boosting: boosting && energy > 0 };
  return {
    ...state,
    tick,
    foods: kept.length === state.foods.length ? state.foods : kept,
    players: state.players.map((p) => p.id === youId ? nextMe : p)
  };
}
var VIEW_CULL = 100;
var r2d = (n) => Math.round(n * 100) / 100;
function viewSnake(state, viewerId) {
  const me = state.players.find((p) => p.id === viewerId);
  const focus = me ? { x: me.x, y: me.y } : { x: WORLD / 2, y: WORLD / 2 };
  const r2 = VIEW_CULL * VIEW_CULL;
  return {
    ...state,
    foods: state.foods.filter((f) => dist2(f, focus) <= r2).map((f) => f.hue == null ? { id: f.id, x: r2d(f.x), y: r2d(f.y) } : { id: f.id, x: r2d(f.x), y: r2d(f.y), hue: f.hue }),
    players: state.players.map((p) => {
      if (p.id === viewerId) return p;
      if (dist2({ x: p.x, y: p.y }, focus) > r2 && !p.path.some((c) => dist2(c, focus) <= r2)) {
        return { ...p, path: [], aim: p.angle };
      }
      return { ...p, aim: p.angle, x: r2d(p.x), y: r2d(p.y), path: p.path.map((c) => ({ x: r2d(c.x), y: r2d(c.y) })) };
    })
  };
}
var AI_LOOK = 26;
var AI_HARD_BODY = HEAD_R * 2.05;
var AI_SOFT_BODY = 8;
var AI_WALL_SOFT = 7;
var AI_SCAN = 46;
var aiMemory = /* @__PURE__ */ new Map();
function aiMem(id, tick) {
  let m = aiMemory.get(id);
  if (!m || tick < m.tick - 5) {
    m = { tick, foodId: null, bad: /* @__PURE__ */ new Map(), wander: null, wanderUntil: 0, samples: [], lastAim: 0 };
    aiMemory.set(id, m);
  }
  m.tick = tick;
  return m;
}
function resetSnakeAi() {
  aiMemory.clear();
}
function gatherObstacles(state, me) {
  const bodies = [];
  const heads = [];
  const r2 = (AI_SCAN + 30) * (AI_SCAN + 30);
  for (const p of state.players) {
    if (p.id === me.id || !p.alive) continue;
    if (dist2(p, me) > r2) continue;
    heads.push({ x: p.x, y: p.y, dx: Math.cos(p.angle), dy: Math.sin(p.angle) });
    for (let i = 0; i < p.path.length; i += 2) {
      const c = p.path[i];
      if (dist2(c, me) <= r2) bodies.push(c);
    }
  }
  return { bodies, heads };
}
function foodRisk(f, obs) {
  let risk = 0;
  for (const h of obs.heads) {
    const d2 = dist2(f, h);
    if (d2 < 10 * 10) risk += (10 - Math.sqrt(d2)) * 3;
  }
  for (const b of obs.bodies) {
    const d2 = dist2(f, b);
    if (d2 < 4.5 * 4.5) {
      risk += 12;
      break;
    }
  }
  const edge = Math.min(f.x, f.y, WORLD - f.x, WORLD - f.y);
  if (edge < 3) risk += (3 - edge) * 2;
  return risk;
}
function pickTarget(me, state, obs, mem) {
  if (mem.wander && mem.wanderUntil > state.tick) {
    if (dist2(me, mem.wander) < 7 * 7) {
      mem.wander = null;
      mem.wanderUntil = 0;
    } else return mem.wander;
  }
  let best = null;
  let bestCost = Infinity;
  for (const f of state.foods) {
    const badUntil = mem.bad.get(f.id);
    if (badUntil != null && badUntil > state.tick) continue;
    const d = Math.sqrt(dist2(me, f));
    const diff = Math.abs(normAngle(Math.atan2(f.y - me.y, f.x - me.x) - me.angle));
    let cost = d + diff * 5 + foodRisk(f, obs);
    if (f.id === mem.foodId) cost -= 9;
    if (cost < bestCost) {
      bestCost = cost;
      best = f;
    }
  }
  mem.foodId = best ? best.id : null;
  return best ? { x: best.x, y: best.y } : null;
}
function nearbyFoods(state, me) {
  const out = [];
  const r2 = AI_SCAN * AI_SCAN;
  for (const f of state.foods) if (dist2(f, me) <= r2) out.push(f);
  return out;
}
function scoreAiHeading(me, aim, obs, foods, target, turn) {
  let x = me.x;
  let y = me.y;
  let angle = me.angle;
  let score = 0;
  const pick2 = (HEAD_R + FOOD_R) * (HEAD_R + FOOD_R);
  const hard2 = AI_HARD_BODY * AI_HARD_BODY;
  const soft2 = AI_SOFT_BODY * AI_SOFT_BODY;
  let taken = null;
  for (let step = 0; step < AI_LOOK; step++) {
    angle = turnToward(angle, aim, turn);
    x += Math.cos(angle) * SPEED;
    y += Math.sin(angle) * SPEED;
    const edge = Math.min(x, y, WORLD - x, WORLD - y);
    if (edge < HEAD_R + 0.4) return -1e6 + step * 1e3 + score;
    if (edge < AI_WALL_SOFT) score -= (AI_WALL_SOFT - edge) * (AI_WALL_SOFT - edge) * 0.9;
    for (const b of obs.bodies) {
      const dx = x - b.x;
      const dy = y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < hard2) return -1e6 + step * 1e3 + score;
      if (d2 < soft2) score -= AI_SOFT_BODY - Math.sqrt(d2);
    }
    if (step < 12) {
      for (const h of obs.heads) {
        const hx = h.x + h.dx * SPEED * step;
        const hy = h.y + h.dy * SPEED * step;
        const dx = x - hx;
        const dy = y - hy;
        const d2 = dx * dx + dy * dy;
        if (d2 < hard2 * 1.6) return -1e6 + step * 1e3 + score;
        if (d2 < soft2 * 1.5) score -= (AI_SOFT_BODY * 1.2 - Math.sqrt(d2)) * 2;
      }
    }
    for (const f of foods) {
      const dx = x - f.x;
      const dy = y - f.y;
      if (dx * dx + dy * dy <= pick2) {
        if (!taken) taken = /* @__PURE__ */ new Set();
        if (taken.has(f.id)) continue;
        taken.add(f.id);
        score += 14 - step * 0.2;
      }
    }
  }
  if (target) score -= Math.hypot(x - target.x, y - target.y) * 1.3;
  return score;
}
function aiSnake(state, cpuId) {
  const me = state.players.find((p) => p.id === cpuId);
  if (!me || !me.alive) return { type: "aim", angle: 0 };
  const mem = aiMem(cpuId, state.tick);
  let salt = 0;
  for (let i = 0; i < cpuId.length; i++) salt += cpuId.charCodeAt(i);
  if ((state.tick + salt) % 2 !== 0 && mem.samples.length) return { type: "aim", angle: mem.lastAim };
  const last = mem.samples[mem.samples.length - 1];
  if (!last || state.tick - last.tick >= 20) {
    mem.samples.push({ tick: state.tick, x: me.x, y: me.y });
    if (mem.samples.length > 6) mem.samples.shift();
    if (mem.samples.length >= 5) {
      const first = mem.samples[0];
      if (Math.hypot(me.x - first.x, me.y - first.y) < 11) {
        if (mem.foodId) mem.bad.set(mem.foodId, state.tick + 240);
        const pad = 26;
        mem.wander = {
          x: pad + Math.random() * (WORLD - pad * 2),
          y: pad + Math.random() * (WORLD - pad * 2)
        };
        mem.wanderUntil = state.tick + 150;
        mem.foodId = null;
        mem.samples = [];
      }
    }
  }
  if (mem.bad.size > 40) {
    for (const [k, v] of mem.bad) if (v <= state.tick) mem.bad.delete(k);
  }
  const obs = gatherObstacles(state, me);
  const foods = nearbyFoods(state, me);
  const target = pickTarget(me, state, obs, mem) ?? { x: WORLD / 2, y: WORLD / 2 };
  const turn = turnRateFor(me);
  const candidates = [];
  for (let k = 0; k < 24; k++) candidates.push(normAngle(k * (Math.PI / 12)));
  for (let k = -3; k <= 3; k++) candidates.push(normAngle(me.angle + k * 0.12));
  candidates.push(Math.atan2(target.y - me.y, target.x - me.x));
  candidates.push(Math.atan2(WORLD / 2 - me.y, WORLD / 2 - me.x));
  let bestAngle = me.angle;
  let bestScore = -Infinity;
  for (const aim of candidates) {
    let s = scoreAiHeading(me, aim, obs, foods, target, turn);
    s -= Math.abs(normAngle(aim - me.angle)) * 0.4;
    if (s > bestScore) {
      bestScore = s;
      bestAngle = aim;
    }
  }
  mem.lastAim = bestAngle;
  return { type: "aim", angle: bestAngle };
}
function cameraOrigin(focus, view = VIEW_RADIUS) {
  const ox = clamp(focus.x - view / 2, 0, Math.max(0, WORLD - view));
  const oy = clamp(focus.y - view / 2, 0, Math.max(0, WORLD - view));
  return { ox, oy };
}
var COLS = WORLD;
var ROWS = WORLD;
var VIEW_COLS = Math.floor(VIEW_RADIUS);
var VIEW_ROWS = Math.floor(VIEW_RADIUS);
var COUNTDOWN_MS = 0;
var GOAL = 999;
export {
  BOOST_DRAIN,
  BOOST_DRAIN_EVERY,
  BOOST_MULT,
  COLS,
  CORPSE_MAX,
  CORPSE_STRIDE,
  COUNTDOWN_MS,
  ENERGY_MAX,
  ENERGY_PER_FOOD,
  ENERGY_START,
  FOOD_COUNT,
  FOOD_PICK,
  FOOD_PICK_HUMAN,
  FOOD_PICK_SURE,
  FOOD_R,
  FOOD_SOFT_CAP,
  GOAL,
  HEAD_R,
  PATH_STEP,
  RESPAWN_MS,
  ROWS,
  SHIELD_MS,
  SNAKE_WORLD_ID,
  SPEED,
  START_LEN,
  TICK_MS,
  TURN_MASS_HALF,
  TURN_RATE,
  TURN_RATE_MAX,
  TURN_RATE_MIN,
  VIEW_COLS,
  VIEW_CULL,
  VIEW_RADIUS,
  VIEW_ROWS,
  WORLD,
  aiSnake,
  applySnakeAction,
  cameraOrigin,
  canBoost,
  createSnakeWorld,
  finishCountdown,
  isShielded,
  joinSnake,
  leaveSnake,
  newNetMemo,
  reconcileSnake,
  resetSnakeAi,
  scatterCorpse,
  smoothPeers,
  startSnakeDuel,
  startSnakeLobby,
  startSnakePractice,
  stepSelfPredict,
  stepSnake,
  stepSnakeWorld,
  turnRateFor,
  viewSnake
};
