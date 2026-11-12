import { uid } from "../../lib/shuffle";

/** Continuous world size (units). */
export const WORLD = 200;
export const TICK_MS = 40;
export const VIEW_RADIUS = 42;
export const START_LEN = 18;
export const FOOD_COUNT = 80;
export const FOOD_SOFT_CAP = FOOD_COUNT + 180;
export const CORPSE_STRIDE = 2;
export const CORPSE_MAX = 52;
export const SPEED = 0.58;
export const BOOST_MULT = 1.85;
export const BOOST_DRAIN_EVERY = 4;
export const BOOST_DRAIN = 2.5;
export const ENERGY_MAX = 100;
export const ENERGY_PER_FOOD = 14;
export const ENERGY_START = 24;
export const TURN_RATE = 0.65;
export const HEAD_R = 1.35;
export const FOOD_R = 0.85;
export const PATH_STEP = 0.55;
export const RESPAWN_MS = 700;
export const SHIELD_MS = 5000;
export const SNAKE_WORLD_ID = "snake-world";

export type Point = { x: number; y: number };

export type SnakePlayer = {
  id: string;
  name: string;
  human: boolean;
  x: number;
  y: number;
  angle: number;
  /** Desired facing angle (radians). */
  aim: number;
  path: Point[];
  alive: boolean;
  score: number;
  /** Boost resource 0..ENERGY_MAX. Eating fills it; boost drains it only. */
  energy: number;
  hue: number;
  respawnAt: number | null;
  boosting: boolean;
  /** Invulnerable until this timestamp (ms). */
  shieldUntil: number | null;
};

export type Food = { id: string; x: number; y: number; hue?: number };

export type SnakeState = {
  mode: "world" | "practice";
  players: SnakePlayer[];
  foods: Food[];
  phase: "play" | "over";
  tick: number;
  log: Array<{ id: string; text: string }>;
};

export type SnakeAction =
  | { type: "aim"; angle: number }
  | { type: "dir"; x: number; y: number }
  | { type: "boost"; on: boolean }
  | { type: "join" }
  | { type: "leave" };

const HUES = [150, 12, 210, 48, 280, 30, 190, 330];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function normAngle(a: number) {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
}

function turnToward(current: number, target: number, maxDelta: number) {
  const diff = normAngle(target - current);
  if (Math.abs(diff) <= maxDelta) return target;
  return normAngle(current + Math.sign(diff) * maxDelta);
}

function dist2(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function hueFor(id: string, index: number) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return HUES[index % HUES.length] ?? h % 360;
}

function randomPoint(pad = 8): Point {
  return {
    x: pad + Math.random() * (WORLD - pad * 2),
    y: pad + Math.random() * (WORLD - pad * 2),
  };
}

function buildPath(x: number, y: number, angle: number, len: number): Point[] {
  const path: Point[] = [{ x, y }];
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

export function canBoost(p: Pick<SnakePlayer, "alive" | "energy">): boolean {
  return Boolean(p.alive && p.energy > 0);
}

export function isShielded(p: Pick<SnakePlayer, "alive" | "shieldUntil">, now = Date.now()): boolean {
  return Boolean(p.alive && p.shieldUntil != null && now < p.shieldUntil);
}

function spawnPlayer(
  person: { id: string; name: string; human?: boolean },
  index: number,
  now = Date.now(),
): SnakePlayer {
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
    shieldUntil: now + SHIELD_MS,
  };
}

function seedFoods(n = FOOD_COUNT): Food[] {
  return Array.from({ length: n }, () => {
    const p = randomPoint(4);
    return { id: uid("f"), x: p.x, y: p.y };
  });
}

function emptyWorld(mode: SnakeState["mode"] = "world"): SnakeState {
  return {
    mode,
    players: [],
    foods: seedFoods(),
    phase: "play",
    tick: 0,
    log: [{ id: uid("l"), text: "Global snake arena. Steer to twist. Hold Space to boost." }],
  };
}

export function createSnakeWorld(): SnakeState {
  return emptyWorld("world");
}

export function startSnakePractice(cpus = 2): SnakeState {
  const n = Math.max(0, Math.min(6, Math.floor(cpus) || 0));
  const people = [
    { id: "you", name: "YOU", human: true },
    ...Array.from({ length: n }, (_, i) => ({
      id: i === 0 ? "cpu" : `cpu-${i + 1}`,
      name: i === 0 ? "CPU" : `CPU ${i + 1}`,
      human: false,
    })),
  ];
  const state = emptyWorld("practice");
  state.players = people.map((p, i) => spawnPlayer(p, i));
  state.log = [{ id: uid("l"), text: "Practice arena. Same physics as the global map." }];
  return state;
}

/** @deprecated table lobby — maps to empty world for old callers */
export function startSnakeLobby(_people: Array<{ id: string; name: string; human?: boolean }>): SnakeState {
  return createSnakeWorld();
}

/** @deprecated */
export function startSnakeDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): SnakeState {
  const state = createSnakeWorld();
  state.mode = "practice";
  state.players = [spawnPlayer(a, 0), spawnPlayer(b, 1)];
  return state;
}

/** @deprecated countdown no longer used */
export function finishCountdown(state: SnakeState): SnakeState {
  return { ...state, phase: "play" };
}

export function joinSnake(state: SnakeState, person: { id: string; name: string; human?: boolean }): SnakeState {
  const id = String(person.id);
  if (state.players.some((p) => p.id === id)) return state;
  const player = spawnPlayer(person, state.players.length);
  return {
    ...state,
    phase: "play",
    players: [...state.players, player],
    log: [...state.log, { id: uid("l"), text: `${person.name} entered the arena.` }].slice(-40),
  };
}

export function leaveSnake(state: SnakeState, playerId: string): SnakeState {
  const id = String(playerId);
  const gone = state.players.find((p) => p.id === id);
  if (!gone) return state;
  return {
    ...state,
    players: state.players.filter((p) => p.id !== id),
    log: [...state.log, { id: uid("l"), text: `${gone.name} left.` }].slice(-40),
  };
}

function aimFromDir(x: number, y: number): number | null {
  if (!x && !y) return null;
  return Math.atan2(y, x);
}

export function applySnakeAction(state: SnakeState, actorId: string, action: SnakeAction): SnakeState {
  if (action.type === "join") {
    const existing = state.players.find((p) => p.id === actorId);
    if (existing) return state;
    return joinSnake(state, { id: actorId, name: actorId, human: true });
  }
  if (action.type === "leave") return leaveSnake(state, actorId);
  const me = state.players.find((p) => p.id === actorId);
  if (!me || (!me.alive && !me.respawnAt)) return state;

  if (action.type === "boost") {
    return {
      ...state,
      players: state.players.map((p) =>
        p.id === actorId ? { ...p, boosting: Boolean(action.on) && p.alive } : p,
      ),
    };
  }

  let angle: number | null = null;
  if (action.type === "aim" && Number.isFinite(action.angle)) angle = action.angle;
  else if (action.type === "dir") angle = aimFromDir(action.x, action.y);
  if (angle == null) return state;
  return {
    ...state,
    players: state.players.map((p) => (p.id === actorId ? { ...p, aim: angle! } : p)),
  };
}

function segmentHit(head: Point, path: Point[], skip: number, radius: number): boolean {
  const r2 = radius * radius;
  for (let i = skip; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
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

function respawnNow(p: SnakePlayer, index: number, now: number): SnakePlayer {
  const fresh = spawnPlayer({ id: p.id, name: p.name, human: p.human }, index, now);
  return { ...fresh, score: 0, energy: ENERGY_START, hue: p.hue, boosting: false, shieldUntil: now + SHIELD_MS };
}

/** Scatter edible remains along the dead snake's body. */
export function scatterCorpse(path: Point[], hue: number): Food[] {
  if (!path.length) return [];
  const stride = path.length > 60 ? 3 : CORPSE_STRIDE;
  const drops: Food[] = [];
  for (let i = 0; i < path.length && drops.length < CORPSE_MAX; i += stride) {
    const pt = path[i]!;
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
        hue,
      });
    }
  }
  return drops.slice(0, CORPSE_MAX);
}

function killSnake(p: SnakePlayer, now: number): { player: SnakePlayer; drops: Food[] } {
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
      shieldUntil: null,
    },
  };
}

export function stepSnake(state: SnakeState, now = Date.now()): SnakeState {
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
    const angle = turnToward(p.angle, p.aim, TURN_RATE);
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

  const next: SnakePlayer[] = players.map((p, i) => {
    if (!p.alive) return p;
    const shielded = isShielded(p, now);
    let dead = false;
    if (p.x < HEAD_R || p.y < HEAD_R || p.x > WORLD - HEAD_R || p.y > WORLD - HEAD_R) {
      if (shielded) {
        return {
          ...p,
          x: clamp(p.x, HEAD_R, WORLD - HEAD_R),
          y: clamp(p.y, HEAD_R, WORLD - HEAD_R),
        };
      }
      dead = true;
    }
    if (!dead) {
      for (let j = 0; j < players.length; j++) {
        if (j === i) continue; // self-collision does not kill
        const other = players[j]!;
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
    const kept: Food[] = [];
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
      boosting: p.boosting && canBoost({ alive: p.alive, energy }),
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
    tick,
  };
}

/** Alias used by lobby tick. */
export const stepSnakeWorld = stepSnake;

/** Prefer server snapshot; keep unsent local aim/boost on yourself. */
export function reconcileSnake(server: SnakeState, local: SnakeState | null, youId?: string): SnakeState {
  if (!local || !youId) return server;
  const mine = local.players.find((p) => p.id === youId);
  if (!mine) return server;
  return {
    ...server,
    players: server.players.map((p) =>
      p.id === youId ? { ...p, aim: mine.aim, boosting: mine.boosting && p.alive } : p,
    ),
  };
}

/** Visual-only short prediction of your own snake between server ticks. */
export function predictSelf(state: SnakeState, youId: string, ticks: number): SnakeState {
  const n = Math.max(0, Math.min(4, Math.floor(ticks)));
  if (!n || !youId) return state;
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id !== youId || !p.alive) return p;
      let { x, y, angle, path, score, energy } = p;
      let boosting = Boolean(p.boosting);
      for (let i = 0; i < n; i++) {
        boosting = boosting && canBoost({ alive: true, energy });
        const spd = boosting ? SPEED * BOOST_MULT : SPEED;
        angle = turnToward(angle, p.aim, TURN_RATE);
        x += Math.cos(angle) * spd;
        y += Math.sin(angle) * spd;
        path = [{ x, y }, ...path];
        if (boosting && (state.tick + i + 1) % BOOST_DRAIN_EVERY === 0) {
          energy = Math.max(0, energy - BOOST_DRAIN);
        }
        const maxPts = START_LEN + Math.floor(score * 2.2);
        if (path.length > maxPts) path = path.slice(0, maxPts);
        boosting = boosting && energy > 0;
      }
      return { ...p, x, y, angle, path, score, energy, boosting };
    }),
  };
}

export function viewSnake(state: SnakeState, viewerId: string): SnakeState {
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
    }),
  };
}

export function aiSnake(state: SnakeState, cpuId: string): SnakeAction {
  const me = state.players.find((p) => p.id === cpuId);
  if (!me || !me.alive) return { type: "aim", angle: 0 };
  let best: Food | null = null;
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

/** Camera top-left for a discrete cell UI (compat). */
export function cameraOrigin(focus: Point, view = VIEW_RADIUS): { ox: number; oy: number } {
  const ox = clamp(focus.x - view / 2, 0, Math.max(0, WORLD - view));
  const oy = clamp(focus.y - view / 2, 0, Math.max(0, WORLD - view));
  return { ox, oy };
}

// Compat exports for old constants referenced elsewhere
export const COLS = WORLD;
export const ROWS = WORLD;
export const VIEW_COLS = Math.floor(VIEW_RADIUS);
export const VIEW_ROWS = Math.floor(VIEW_RADIUS);
export const COUNTDOWN_MS = 0;
export const GOAL = 999;
