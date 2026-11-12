import { uid } from "../../lib/shuffle";

/** Full arena — larger than the on-screen window; the camera pans with your head. */
export const COLS = 48;
export const ROWS = 32;
/** Visible window size (cells). */
export const VIEW_COLS = 24;
export const VIEW_ROWS = 16;
export const TICK_MS = 160;
export const COUNTDOWN_MS = 3000;
export const START_LEN = 3;
export const GOAL = 8;

export type Point = { x: number; y: number };
export type Dir = { x: number; y: number };

export type SnakePlayer = {
  id: string;
  name: string;
  human: boolean;
  body: Point[];
  dir: Dir;
  pending: Dir;
  alive: boolean;
  score: number;
  hue: number;
};

export type SnakeState = {
  players: SnakePlayer[];
  food: Point;
  phase: "lobby" | "countdown" | "play" | "over";
  winnerId: string | null;
  tick: number;
  log: Array<{ id: string; text: string }>;
};

export type SnakeAction =
  | { type: "start" }
  | { type: "ready" }
  | { type: "dir"; x: number; y: number };

const DIRS: Dir[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function same(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y;
}

function opposite(a: Dir, b: Dir) {
  return a.x + b.x === 0 && a.y + b.y === 0 && (a.x !== 0 || a.y !== 0);
}

function legalDir(dir: Dir): dir is Dir {
  return DIRS.some((d) => d.x === dir.x && d.y === dir.y);
}

const STARTS: Array<{ body: Point[]; dir: Dir }> = [
  { body: [{ x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }], dir: { x: 1, y: 0 } },
  { body: [{ x: COLS - 4, y: ROWS - 5 }, { x: COLS - 3, y: ROWS - 5 }, { x: COLS - 2, y: ROWS - 5 }], dir: { x: -1, y: 0 } },
  { body: [{ x: COLS - 4, y: 4 }, { x: COLS - 3, y: 4 }, { x: COLS - 2, y: 4 }], dir: { x: -1, y: 0 } },
  { body: [{ x: 3, y: ROWS - 5 }, { x: 2, y: ROWS - 5 }, { x: 1, y: ROWS - 5 }], dir: { x: 1, y: 0 } },
];

const HUES = [150, 12, 210, 48];

function occupied(players: SnakePlayer[], skipId?: string): Set<string> {
  const set = new Set<string>();
  for (const p of players) {
    if (!p.alive || p.id === skipId) continue;
    for (const cell of p.body) set.add(`${cell.x},${cell.y}`);
  }
  return set;
}

function spawnFood(players: SnakePlayer[], avoid?: Point): Point {
  const taken = occupied(players);
  if (avoid) taken.add(`${avoid.x},${avoid.y}`);
  for (let n = 0; n < 240; n++) {
    const x = Math.floor(Math.random() * COLS);
    const y = Math.floor(Math.random() * ROWS);
    if (!taken.has(`${x},${y}`)) return { x, y };
  }
  const free: Point[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!taken.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  return free[Math.floor(Math.random() * Math.max(1, free.length))] ?? { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
}

/** Top-left of the camera window, clamped so the view stays inside the arena. */
export function cameraOrigin(focus: Point): { ox: number; oy: number } {
  const ox = Math.max(0, Math.min(COLS - VIEW_COLS, focus.x - Math.floor(VIEW_COLS / 2)));
  const oy = Math.max(0, Math.min(ROWS - VIEW_ROWS, focus.y - Math.floor(VIEW_ROWS / 2)));
  return { ox, oy };
}

function seatPlayers(people: Array<{ id: string; name: string; human?: boolean }>): SnakePlayer[] {
  return people.slice(0, 4).map((p, i) => {
    const start = STARTS[i] ?? STARTS[0]!;
    const body = start.body.slice(0, START_LEN).map((c) => ({ ...c }));
    return {
      id: p.id,
      name: p.name,
      human: p.human !== false,
      body,
      dir: { ...start.dir },
      pending: { ...start.dir },
      alive: true,
      score: 0,
      hue: HUES[i] ?? 150,
    };
  });
}

function lobbyOf(people: Array<{ id: string; name: string; human?: boolean }>): SnakeState {
  const players = seatPlayers(people);
  return {
    players,
    food: { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) },
    phase: "lobby",
    winnerId: null,
    tick: 0,
    log: [
      {
        id: uid("l"),
        text: `Table ${players.length}/4. Open a table, add CPUs or invite, then start. Large ${COLS}×${ROWS} map — camera follows your head. Last snake alive — or first to ${GOAL} apples — wins.`,
      },
    ],
  };
}

function beginMatch(people: Array<{ id: string; name: string; human?: boolean }>): SnakeState {
  const players = seatPlayers(people);
  return {
    players,
    food: spawnFood(players),
    phase: "countdown",
    winnerId: null,
    tick: 0,
    log: [{ id: uid("l"), text: "Ready. Move with arrows or WASD. Do not hit a wall, yourself, or another snake." }],
  };
}

export function startSnakeLobby(people: Array<{ id: string; name: string; human?: boolean }>): SnakeState {
  return lobbyOf(people);
}

export function startSnakeDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): SnakeState {
  return beginMatch([a, b]);
}

export function startSnakePractice(seats = 2): SnakeState {
  const n = Math.max(2, Math.min(4, Math.floor(seats) || 2));
  const names = ["YOU", "CPU", "CPU 2", "CPU 3"];
  const people = Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? "you" : i === 1 ? "cpu" : `cpu-${i}`,
    name: names[i]!,
    human: i === 0,
  }));
  return beginMatch(people);
}

export function finishCountdown(state: SnakeState): SnakeState {
  if (state.phase !== "countdown") return state;
  return { ...state, phase: "play", log: [...state.log, { id: uid("l"), text: "Go." }] };
}

function setDir(player: SnakePlayer, dir: Dir): SnakePlayer {
  if (!legalDir(dir)) return player;
  if (opposite(dir, player.dir)) return player;
  return { ...player, pending: dir };
}

export function applySnakeAction(state: SnakeState, actorId: string, action: SnakeAction): SnakeState {
  if (state.phase === "over") return state;
  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      return beginMatch(state.players);
    }
    return state;
  }
  if (action.type !== "dir") return state;
  const dir = { x: action.x, y: action.y };
  if (!legalDir(dir)) return state;
  return {
    ...state,
    players: state.players.map((p) => (p.id === actorId && p.alive ? setDir(p, dir) : p)),
  };
}

function nextHead(p: SnakePlayer): Point {
  const head = p.body[0] ?? { x: 0, y: 0 };
  return { x: head.x + p.dir.x, y: head.y + p.dir.y };
}

function inBounds(pt: Point) {
  return pt.x >= 0 && pt.x < COLS && pt.y >= 0 && pt.y < ROWS;
}

export function stepSnake(state: SnakeState): SnakeState {
  if (state.phase !== "play") return state;
  const steered = state.players.map((p) => {
    if (!p.alive) return p;
    const dir = opposite(p.pending, p.dir) ? p.dir : p.pending;
    return { ...p, dir, pending: dir };
  });
  const heads = steered.map((p) => (p.alive ? nextHead(p) : null));
  const headHits = new Map<string, number>();
  for (const h of heads) {
    if (!h) continue;
    const key = `${h.x},${h.y}`;
    headHits.set(key, (headHits.get(key) ?? 0) + 1);
  }

  let food = state.food;
  let ate = false;
  const nextPlayers = steered.map((p, i) => {
    if (!p.alive) return p;
    const head = heads[i]!;
    if (!inBounds(head) || (headHits.get(`${head.x},${head.y}`) ?? 0) > 1) {
      return { ...p, alive: false };
    }
    for (let j = 0; j < steered.length; j++) {
      const other = steered[j]!;
      if (!other.alive) continue;
      const body = j === i ? other.body.slice(0, -1) : other.body;
      if (body.some((c) => same(c, head))) return { ...p, alive: false };
    }
    const grow = same(head, food);
    if (grow) ate = true;
    const body = grow ? [head, ...p.body] : [head, ...p.body.slice(0, -1)];
    return { ...p, body, score: p.score + (grow ? 1 : 0), alive: true };
  });

  if (ate) food = spawnFood(nextPlayers);

  const living = nextPlayers.filter((p) => p.alive);
  const reached = nextPlayers.find((p) => p.alive && p.score >= GOAL);
  let phase: SnakeState["phase"] = state.phase;
  let winnerId = state.winnerId;
  const log = [...state.log];
  if (reached) {
    phase = "over";
    winnerId = reached.id;
    log.push({ id: uid("l"), text: `${reached.name} eats ${GOAL} apples and wins.` });
  } else if (living.length === 1) {
    phase = "over";
    winnerId = living[0]!.id;
    log.push({ id: uid("l"), text: `${living[0]!.name} is the last snake standing.` });
  } else if (living.length === 0) {
    phase = "over";
    winnerId = null;
    log.push({ id: uid("l"), text: "Draw — every snake crashed." });
  }

  return {
    ...state,
    players: nextPlayers,
    food,
    phase,
    winnerId,
    tick: state.tick + 1,
    log,
  };
}

export function viewSnake(state: SnakeState, viewerId: string): SnakeState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === viewerId ? p : { ...p, pending: { ...p.dir } })),
  };
}

function danger(state: SnakeState, me: SnakePlayer, pt: Point): boolean {
  if (!inBounds(pt)) return true;
  for (const p of state.players) {
    if (!p.alive) continue;
    const body = p.id === me.id ? p.body.slice(0, -1) : p.body;
    if (body.some((c) => same(c, pt))) return true;
  }
  return false;
}

export function aiSnake(state: SnakeState, cpuId: string): SnakeAction {
  const me = state.players.find((p) => p.id === cpuId);
  if (!me || !me.alive) return { type: "dir", x: 1, y: 0 };
  const head = me.body[0] ?? { x: 0, y: 0 };
  const food = state.food;
  const ranked = DIRS.slice().sort((a, b) => {
    const ha = { x: head.x + a.x, y: head.y + a.y };
    const hb = { x: head.x + b.x, y: head.y + b.y };
    const da = danger(state, me, ha) ? 1000 : Math.abs(ha.x - food.x) + Math.abs(ha.y - food.y);
    const db = danger(state, me, hb) ? 1000 : Math.abs(hb.x - food.x) + Math.abs(hb.y - food.y);
    return da - db;
  });
  for (const dir of ranked) {
    if (opposite(dir, me.dir)) continue;
    const nxt = { x: head.x + dir.x, y: head.y + dir.y };
    if (!danger(state, me, nxt)) return { type: "dir", x: dir.x, y: dir.y };
  }
  return { type: "dir", x: me.dir.x, y: me.dir.y };
}
