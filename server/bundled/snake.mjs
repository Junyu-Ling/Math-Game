// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/snake/engine.ts
var WORLD = 200;
var TICK_MS = 60;
var VIEW_RADIUS = 42;
var START_LEN = 18;
var FOOD_COUNT = 80;
var SPEED = 0.55;
var TURN_RATE = 0.14;
var HEAD_R = 1.35;
var FOOD_R = 0.85;
var PATH_STEP = 0.55;
var RESPAWN_MS = 900;
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
function spawnPlayer(person, index) {
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
    hue: hueFor(person.id, index),
    respawnAt: null
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
    log: [{ id: uid("l"), text: "Global snake arena. Steer to twist. Crash and respawn." }]
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
function respawnNow(p, index) {
  const fresh = spawnPlayer({ id: p.id, name: p.name, human: p.human }, index);
  return { ...fresh, score: 0, hue: p.hue };
}
function stepSnake(state, now = Date.now()) {
  if (state.phase === "over" && state.mode === "world") {
    state = { ...state, phase: "play" };
  }
  let foods = state.foods.slice();
  const players = state.players.map((p, index) => {
    if (!p.alive) {
      if (p.respawnAt && now >= p.respawnAt) return respawnNow(p, index);
      return p;
    }
    const angle = turnToward(p.angle, p.aim, TURN_RATE);
    const x = p.x + Math.cos(angle) * SPEED;
    const y = p.y + Math.sin(angle) * SPEED;
    let path = [{ x, y }, ...p.path];
    const maxPts = START_LEN + Math.floor(p.score * 2.2);
    if (path.length > maxPts) path = path.slice(0, maxPts);
    return { ...p, x, y, angle, path };
  });
  const next = players.map((p, i) => {
    if (!p.alive) return p;
    if (p.x < HEAD_R || p.y < HEAD_R || p.x > WORLD - HEAD_R || p.y > WORLD - HEAD_R) {
      return { ...p, alive: false, respawnAt: now + RESPAWN_MS, path: p.path.slice(0, 4) };
    }
    for (let j = 0; j < players.length; j++) {
      const other = players[j];
      if (!other.alive) continue;
      const skip = j === i ? 8 : 0;
      if (segmentHit({ x: p.x, y: p.y }, other.path, skip, HEAD_R * 0.95)) {
        return { ...p, alive: false, respawnAt: now + RESPAWN_MS, path: p.path.slice(0, 4) };
      }
    }
    let score = p.score;
    let path = p.path;
    const kept = [];
    for (const f of foods) {
      if (dist2({ x: p.x, y: p.y }, f) <= (HEAD_R + FOOD_R) * (HEAD_R + FOOD_R)) {
        score += 1;
        const tip = path[path.length - 1] ?? { x: p.x, y: p.y };
        path = [...path, { x: tip.x, y: tip.y }];
      } else kept.push(f);
    }
    foods = kept;
    return { ...p, score, path };
  });
  while (foods.length < FOOD_COUNT) {
    const pt = randomPoint(4);
    foods.push({ id: uid("f"), x: pt.x, y: pt.y });
  }
  return {
    ...state,
    players: next,
    foods,
    phase: "play",
    tick: state.tick + 1
  };
}
var stepSnakeWorld = stepSnake;
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
function aiSnake(state, cpuId) {
  const me = state.players.find((p) => p.id === cpuId);
  if (!me || !me.alive) return { type: "aim", angle: 0 };
  let best = null;
  let bestD = Infinity;
  for (const f of state.foods) {
    const d = dist2({ x: me.x, y: me.y }, f);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  if (!best) return { type: "aim", angle: me.angle };
  const angle = Math.atan2(best.y - me.y, best.x - me.x);
  for (const p of state.players) {
    if (p.id === me.id || !p.alive) continue;
    const d = Math.sqrt(dist2({ x: me.x, y: me.y }, { x: p.x, y: p.y }));
    if (d < 10) {
      const away = Math.atan2(me.y - p.y, me.x - p.x);
      return { type: "aim", angle: away };
    }
  }
  return { type: "aim", angle };
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
  COLS,
  COUNTDOWN_MS,
  FOOD_COUNT,
  FOOD_R,
  GOAL,
  HEAD_R,
  PATH_STEP,
  RESPAWN_MS,
  ROWS,
  SNAKE_WORLD_ID,
  SPEED,
  START_LEN,
  TICK_MS,
  TURN_RATE,
  VIEW_COLS,
  VIEW_RADIUS,
  VIEW_ROWS,
  WORLD,
  aiSnake,
  applySnakeAction,
  cameraOrigin,
  createSnakeWorld,
  finishCountdown,
  joinSnake,
  leaveSnake,
  startSnakeDuel,
  startSnakeLobby,
  startSnakePractice,
  stepSnake,
  stepSnakeWorld,
  viewSnake
};
