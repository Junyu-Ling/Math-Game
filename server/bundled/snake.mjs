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
  if (action.type === "boost") {
    return {
      ...state,
      players: state.players.map(
        (p) => p.id === actorId ? { ...p, boosting: Boolean(action.on) && p.alive } : p
      )
    };
  }
  let angle = null;
  if (action.type === "aim" && Number.isFinite(action.angle)) angle = action.angle;
  else if (action.type === "dir") angle = aimFromDir(action.x, action.y);
  if (angle == null) return state;
  return {
    ...state,
    players: state.players.map((p) => p.id === actorId ? { ...p, aim: angle } : p)
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
  return { ...fresh, score: 0, energy: ENERGY_START, hue: p.hue, boosting: false, shieldUntil: now + SHIELD_MS };
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
    for (const f of foods) {
      if (dist2({ x: p.x, y: p.y }, f) <= (HEAD_R + FOOD_R) * (HEAD_R + FOOD_R)) {
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
function reconcileSnake(server, local, youId) {
  if (!local || !youId) return server;
  const mine = local.players.find((p) => p.id === youId);
  const theirs = server.players.find((p) => p.id === youId);
  if (!mine || !theirs) return server;
  const lifeChanged = mine.alive !== theirs.alive;
  let self;
  if (lifeChanged) {
    self = {
      ...theirs,
      aim: mine.aim,
      boosting: mine.boosting && theirs.alive
    };
  } else if (!theirs.alive) {
    self = { ...theirs, aim: mine.aim, boosting: false };
  } else {
    self = {
      ...mine,
      id: theirs.id,
      name: theirs.name,
      human: theirs.human,
      hue: theirs.hue,
      score: theirs.score,
      shieldUntil: theirs.shieldUntil,
      energy: Math.abs(mine.energy - theirs.energy) > 30 ? theirs.energy : mine.energy,
      aim: mine.aim,
      boosting: mine.boosting && mine.alive,
      alive: true,
      respawnAt: null
    };
  }
  const prevById = new Map(local.players.map((p) => [p.id, p]));
  const serverIds = new Set(server.players.map((p) => p.id));
  const players = server.players.map((p) => {
    if (p.id === youId) return self;
    const prev = prevById.get(p.id);
    if (!prev || !prev.alive || !p.alive) return p;
    if (!p.path.length && prev.path.length) {
      return { ...prev, name: p.name, hue: p.hue, score: p.score, alive: p.alive };
    }
    const t = 0.22;
    const x = prev.x + (p.x - prev.x) * t;
    const y = prev.y + (p.y - prev.y) * t;
    const angle = lerpAngle(prev.angle, p.angle, t);
    const path = p.path.length ? [{ x, y }, ...p.path.slice(1)] : prev.path;
    return { ...p, x, y, angle, path };
  });
  const foods = server.foods.length ? server.foods : local.foods;
  return {
    ...server,
    foods,
    tick: Math.max(server.tick, local.tick),
    players: players.filter((p) => p.id === youId || serverIds.has(p.id))
  };
}
function stepSelfPredict(state, youId, now = Date.now()) {
  const tick = state.tick + 1;
  const me = state.players.find((p) => p.id === youId);
  if (!me) return { ...state, tick };
  if (!me.alive) {
    if (me.respawnAt && now >= me.respawnAt) {
      const idx = state.players.findIndex((p) => p.id === youId);
      const fresh = respawnNow(me, Math.max(0, idx), now);
      return {
        ...state,
        tick,
        players: state.players.map((p) => p.id === youId ? fresh : p)
      };
    }
    return { ...state, tick, players: state.players.map((p) => p.id === youId ? { ...p, boosting: false } : p) };
  }
  let energy = me.energy;
  const boosting = Boolean(me.boosting) && canBoost(me);
  const spd = boosting ? SPEED * BOOST_MULT : SPEED;
  const angle = turnToward(me.angle, me.aim, turnRateFor({ ...me, boosting }));
  let x = me.x + Math.cos(angle) * spd;
  let y = me.y + Math.sin(angle) * spd;
  let path = [{ x, y }, ...me.path];
  let score = me.score;
  if (boosting && tick % BOOST_DRAIN_EVERY === 0) energy = Math.max(0, energy - BOOST_DRAIN);
  const maxPts = START_LEN + Math.floor(score * 2.2);
  if (path.length > maxPts) path = path.slice(0, maxPts);
  const shielded = isShielded({ ...me, shieldUntil: me.shieldUntil }, now);
  if (x < HEAD_R || y < HEAD_R || x > WORLD - HEAD_R || y > WORLD - HEAD_R) {
    if (shielded) {
      x = clamp(x, HEAD_R, WORLD - HEAD_R);
      y = clamp(y, HEAD_R, WORLD - HEAD_R);
    } else {
      const killed = killSnake({ ...me, x, y, angle, path, energy, score, boosting: false }, now);
      return {
        ...state,
        tick,
        foods: state.foods.concat(killed.drops),
        players: state.players.map((p) => p.id === youId ? killed.player : p)
      };
    }
  }
  for (const other of state.players) {
    if (other.id === youId || !other.alive || !other.path.length) continue;
    if (shielded || isShielded(other, now)) continue;
    if (segmentHit({ x, y }, other.path, 0, HEAD_R * 0.95)) {
      const killed = killSnake({ ...me, x, y, angle, path, energy, score, boosting: false }, now);
      return {
        ...state,
        tick,
        foods: state.foods.concat(killed.drops),
        players: state.players.map((p) => p.id === youId ? killed.player : p)
      };
    }
  }
  let foods = state.foods;
  const kept = [];
  for (const f of foods) {
    if (dist2({ x, y }, f) <= (HEAD_R + FOOD_R) * (HEAD_R + FOOD_R)) {
      score += 1;
      energy = Math.min(ENERGY_MAX, energy + ENERGY_PER_FOOD);
      const tip = path[path.length - 1] ?? { x, y };
      path = [...path, { x: tip.x, y: tip.y }];
    } else kept.push(f);
  }
  foods = kept;
  const nextMe = {
    ...me,
    x,
    y,
    angle,
    path,
    score,
    energy,
    boosting: boosting && energy > 0
  };
  return {
    ...state,
    tick,
    foods,
    players: state.players.map((p) => p.id === youId ? nextMe : p)
  };
}
function viewSnake(state, viewerId) {
  const me = state.players.find((p) => p.id === viewerId);
  const focus = me ? { x: me.x, y: me.y } : { x: WORLD / 2, y: WORLD / 2 };
  const r2 = VIEW_RADIUS * VIEW_RADIUS * 1.6;
  return {
    ...state,
    foods: state.foods.filter((f) => dist2(f, focus) <= r2),
    players: state.players.map((p) => {
      if (p.id === viewerId) return p;
      if (dist2({ x: p.x, y: p.y }, focus) > r2 && !p.path.some((c) => dist2(c, focus) <= r2)) {
        return { ...p, path: [], aim: p.angle };
      }
      return { ...p, aim: p.angle };
    })
  };
}
var AI_LOOK = 14;
var AI_WALL_MARGIN = 16;
var AI_BODY_CLEAR = 11;
function foodNearThreat(state, food, selfId) {
  for (const p of state.players) {
    if (p.id === selfId || !p.alive) continue;
    if (dist2(food, { x: p.x, y: p.y }) < 9 * 9) return true;
    for (let i = 0; i < p.path.length; i += 3) {
      if (dist2(food, p.path[i]) < 7 * 7) return true;
    }
  }
  return false;
}
function scoreAiHeading(state, me, aim) {
  let x = me.x;
  let y = me.y;
  let angle = me.angle;
  let score = 0;
  for (let step = 0; step < AI_LOOK; step++) {
    angle = turnToward(angle, aim, turnRateFor(me));
    x += Math.cos(angle) * SPEED;
    y += Math.sin(angle) * SPEED;
    if (x < HEAD_R || y < HEAD_R || x > WORLD - HEAD_R || y > WORLD - HEAD_R) {
      return -1e7 + step;
    }
    if (x < AI_WALL_MARGIN) score -= (AI_WALL_MARGIN - x) * 18;
    if (y < AI_WALL_MARGIN) score -= (AI_WALL_MARGIN - y) * 18;
    if (x > WORLD - AI_WALL_MARGIN) score -= (x - (WORLD - AI_WALL_MARGIN)) * 18;
    if (y > WORLD - AI_WALL_MARGIN) score -= (y - (WORLD - AI_WALL_MARGIN)) * 18;
    for (const p of state.players) {
      if (p.id === me.id || !p.alive) continue;
      const headDist = Math.sqrt(dist2({ x, y }, { x: p.x, y: p.y }));
      if (headDist < AI_BODY_CLEAR) score -= (AI_BODY_CLEAR - headDist) * 55;
      if (headDist < 16) {
        const closing = Math.cos(p.angle) * (x - p.x) + Math.sin(p.angle) * (y - p.y);
        if (closing > 0) score -= closing * 1.4;
      }
      if (segmentHit({ x, y }, p.path, 0, HEAD_R * 2.4)) score -= 800;
      for (let i = 0; i < p.path.length; i += 4) {
        const d = Math.sqrt(dist2({ x, y }, p.path[i]));
        if (d < AI_BODY_CLEAR) score -= (AI_BODY_CLEAR - d) * 22;
      }
    }
    for (const f of state.foods) {
      if (foodNearThreat(state, f, me.id)) continue;
      const d = Math.sqrt(dist2({ x, y }, f));
      if (d < 18) score += (18 - d) * 0.28;
    }
  }
  const cx = WORLD / 2;
  const cy = WORLD / 2;
  score -= Math.hypot(x - cx, y - cy) * 0.015;
  return score;
}
function aiSnake(state, cpuId) {
  const me = state.players.find((p) => p.id === cpuId);
  if (!me || !me.alive) return { type: "aim", angle: 0 };
  const candidates = [];
  for (let k = -7; k <= 7; k++) candidates.push(normAngle(me.angle + k * 0.2));
  candidates.push(Math.atan2(WORLD / 2 - me.y, WORLD / 2 - me.x));
  if (me.x < AI_WALL_MARGIN) candidates.push(0);
  if (me.x > WORLD - AI_WALL_MARGIN) candidates.push(Math.PI);
  if (me.y < AI_WALL_MARGIN) candidates.push(Math.PI / 2);
  if (me.y > WORLD - AI_WALL_MARGIN) candidates.push(-Math.PI / 2);
  for (const p of state.players) {
    if (p.id === me.id || !p.alive) continue;
    const d = Math.sqrt(dist2({ x: me.x, y: me.y }, { x: p.x, y: p.y }));
    if (d < 22) {
      candidates.push(Math.atan2(me.y - p.y, me.x - p.x));
      const away = Math.atan2(me.y - p.y, me.x - p.x);
      candidates.push(normAngle(away + Math.PI / 2));
      candidates.push(normAngle(away - Math.PI / 2));
    }
  }
  let safestFood = null;
  let safestD = Infinity;
  for (const f of state.foods) {
    if (foodNearThreat(state, f, me.id)) continue;
    const d = dist2({ x: me.x, y: me.y }, f);
    if (d < safestD) {
      safestD = d;
      safestFood = f;
    }
  }
  if (safestFood) {
    candidates.push(Math.atan2(safestFood.y - me.y, safestFood.x - me.x));
  }
  let bestAngle = me.angle;
  let bestScore = -Infinity;
  for (const aim of candidates) {
    const s = scoreAiHeading(state, me, aim);
    if (s > bestScore) {
      bestScore = s;
      bestAngle = aim;
    }
  }
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
  reconcileSnake,
  scatterCorpse,
  startSnakeDuel,
  startSnakeLobby,
  startSnakePractice,
  stepSelfPredict,
  stepSnake,
  stepSnakeWorld,
  turnRateFor,
  viewSnake
};
