import { uid } from "../../lib/shuffle";

export const SIZE = 4;

export type Stone = 0 | 1 | 2;

export type C4Player = {
  id: string;
  name: string;
  human: boolean;
  stone: 1 | 2 | null;
};

export type C4State = {
  /** board[x][y][z], z = 0 is the floor. */
  board: Stone[][][];
  players: C4Player[];
  turn: number;
  phase: "lobby" | "play" | "over";
  winnerId: string | null;
  winLine: Array<{ x: number; y: number; z: number }> | null;
  last: { x: number; y: number; z: number } | null;
  log: Array<{ id: string; text: string }>;
};

export type C4Action = { type: "start" } | { type: "ready" } | { type: "drop"; x: number; y: number };

const DIRS: Array<[number, number, number]> = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, -1, 0],
  [1, 0, 1],
  [1, 0, -1],
  [0, 1, 1],
  [0, 1, -1],
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [1, -1, -1],
];

function inCube(x: number, y: number, z: number) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE && z >= 0 && z < SIZE;
}

function emptyBoard(): Stone[][][] {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0 as Stone)),
  );
}

function seat(p: { id: string; name: string; human?: boolean }, i: number): C4Player {
  return { id: p.id, name: p.name, human: p.human !== false, stone: i === 0 ? 1 : i === 1 ? 2 : null };
}

export function dropZ(board: Stone[][][], x: number, y: number): number {
  if (!inCube(x, y, 0)) return -1;
  for (let z = 0; z < SIZE; z++) {
    if (!board[x]![y]![z]) return z;
  }
  return -1;
}

function walk(board: Stone[][][], x: number, y: number, z: number, dx: number, dy: number, dz: number, stone: Stone) {
  const cells: Array<{ x: number; y: number; z: number }> = [];
  for (let s = -3; s <= 3; s++) {
    const nx = x + dx * s;
    const ny = y + dy * s;
    const nz = z + dz * s;
    if (!inCube(nx, ny, nz) || board[nx]![ny]![nz] !== stone) {
      if (cells.length >= 4) return cells;
      cells.length = 0;
      continue;
    }
    cells.push({ x: nx, y: ny, z: nz });
  }
  return cells.length >= 4 ? cells.slice(0, 4) : null;
}

export function winLineAt(
  board: Stone[][][],
  x: number,
  y: number,
  z: number,
): Array<{ x: number; y: number; z: number }> | null {
  const stone = board[x]![y]![z];
  if (!stone) return null;
  for (const [dx, dy, dz] of DIRS) {
    const line = walk(board, x, y, z, dx, dy, dz, stone);
    if (line) return line;
  }
  return null;
}

function beginMatch(people: Array<{ id: string; name: string; human?: boolean }>): C4State {
  const players = people.slice(0, 2).map(seat);
  return {
    board: emptyBoard(),
    players,
    turn: 0,
    phase: "play",
    winnerId: null,
    winLine: null,
    last: null,
    log: [{ id: uid("l"), text: `${players[0]?.name} drops first. Four in a line through the cube wins.` }],
  };
}

export function startC4Lobby(people: Array<{ id: string; name: string; human?: boolean }>): C4State {
  const players = people.slice(0, 2).map(seat);
  return {
    board: emptyBoard(),
    players,
    turn: 0,
    phase: "lobby",
    winnerId: null,
    winLine: null,
    last: null,
    log: [
      {
        id: uid("l"),
        text: `Table ${players.length}/2. Open a table, add a CPU or invite, then start.`,
      },
    ],
  };
}

export function startC4Duel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): C4State {
  return beginMatch([a, b]);
}

export function startC4Practice(): C4State {
  return startC4Duel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}

function cloneBoard(board: Stone[][][]): Stone[][][] {
  return board.map((face) => face.map((col) => col.slice() as Stone[]));
}

function applyDrop(board: Stone[][][], x: number, y: number, stone: Stone): { board: Stone[][][]; z: number } | null {
  const z = dropZ(board, x, y);
  if (z < 0) return null;
  const next = cloneBoard(board);
  next[x]![y]![z] = stone;
  return { board: next, z };
}

function scoreCell(x: number, y: number, z: number): number {
  const cx = 1.5;
  const d = Math.abs(x - cx) + Math.abs(y - cx) + Math.abs(z - cx);
  return 8 - d;
}

export function applyC4Action(state: C4State, actorId: string, action: C4Action): C4State {
  if (state.phase === "over") return state;
  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      return beginMatch(state.players);
    }
    return state;
  }
  if (state.phase !== "play" || action.type !== "drop") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId || !me.stone) return state;
  const placed = applyDrop(state.board, action.x, action.y, me.stone);
  if (!placed) return state;
  const { board, z } = placed;
  const line = winLineAt(board, action.x, action.y, z);
  if (line) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: me.id,
      winLine: line,
      last: { x: action.x, y: action.y, z },
      log: [...state.log, { id: uid("l"), text: `${me.name} connects four and wins.` }],
    };
  }
  const full = board.every((face) => face.every((col) => col.every((cell) => cell !== 0)));
  if (full) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: null,
      winLine: null,
      last: { x: action.x, y: action.y, z },
      log: [...state.log, { id: uid("l"), text: "Draw — the cube is full." }],
    };
  }
  return {
    ...state,
    board,
    turn: (state.turn + 1) % 2,
    last: { x: action.x, y: action.y, z },
    log: [...state.log, { id: uid("l"), text: `${me.name} drops at (${action.x + 1},${action.y + 1}).` }],
  };
}

export function viewC4(state: C4State, _viewerId: string): C4State {
  return state;
}

export function aiC4(state: C4State): C4Action {
  const me = state.players[state.turn];
  const stone = me?.stone ?? 1;
  const foe = (stone === 1 ? 2 : 1) as Stone;
  const options: Array<{ x: number; y: number }> = [];
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      if (dropZ(state.board, x, y) >= 0) options.push({ x, y });
    }
  }
  const pick = options[0] ?? { x: 0, y: 0 };
  const tryWin = (who: Stone) => {
    for (const opt of options) {
      const placed = applyDrop(state.board, opt.x, opt.y, who);
      if (placed && winLineAt(placed.board, opt.x, opt.y, placed.z)) return opt;
    }
    return null;
  };
  const win = tryWin(stone);
  if (win) return { type: "drop", ...win };
  const block = tryWin(foe);
  if (block) return { type: "drop", ...block };
  let best = pick;
  let bestScore = -999;
  for (const opt of options) {
    const z = dropZ(state.board, opt.x, opt.y);
    const s = scoreCell(opt.x, opt.y, Math.max(0, z)) + Math.random() * 0.3;
    if (s > bestScore) {
      bestScore = s;
      best = opt;
    }
  }
  return { type: "drop", ...best };
}
