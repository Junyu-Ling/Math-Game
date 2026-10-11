import { uid } from "../../lib/shuffle";

export const SIZE = 15;
export type Stone = 0 | 1 | 2; // 0 empty, 1 black, 2 white

export type FoulKind = "double-three" | "double-four" | "overline";

export type GState = {
  board: Stone[][];
  players: Array<{ id: string; name: string; human: boolean; stone: 1 | 2 }>;
  turn: number;
  phase: "play" | "over";
  winnerId: string | null;
  /** Present when Black lost by renju foul. */
  foul: { kind: FoulKind; r: number; c: number } | null;
  last: { r: number; c: number } | null;
  log: Array<{ id: string; text: string }>;
};

export type GAction = { type: "place"; r: number; c: number };

const DIRS: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

const FOUL_LABEL: Record<FoulKind, string> = {
  "double-three": "三三禁手",
  "double-four": "四四禁手",
  overline: "长连禁手",
};

export function foulLabel(kind: FoulKind): string {
  return FOUL_LABEL[kind];
}

function emptyBoard(): Stone[][] {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0 as Stone));
}

function inBoard(r: number, c: number) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function startGomokuDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): GState {
  return {
    board: emptyBoard(),
    players: [
      { id: a.id, name: a.name, human: a.human !== false, stone: 1 },
      { id: b.id, name: b.name, human: b.human !== false, stone: 2 },
    ],
    turn: 0,
    phase: "play",
    winnerId: null,
    foul: null,
    last: null,
    log: [
      {
        id: uid("l"),
        text: `${a.name} (black) vs ${b.name} (white). Five in a row wins. Black: 三三 / 四四 / 长连禁手.`,
      },
    ],
  };
}

export function startGomokuPractice(): GState {
  return startGomokuDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}

function lineLen(board: Stone[][], r: number, c: number, dr: number, dc: number, stone: Stone) {
  let n = 0;
  let rr = r + dr;
  let cc = c + dc;
  while (inBoard(rr, cc) && board[rr]![cc] === stone) {
    n += 1;
    rr += dr;
    cc += dc;
  }
  return n;
}

/** Longest continuous run through (r,c) on one axis. */
function axisLen(board: Stone[][], r: number, c: number, dr: number, dc: number, stone: Stone) {
  return 1 + lineLen(board, r, c, dr, dc, stone) + lineLen(board, r, c, -dr, -dc, stone);
}

export function winsAt(board: Stone[][], r: number, c: number): boolean {
  const stone = board[r]![c]!;
  if (!stone) return false;
  // White: 5+. Black: exactly 5 (overline handled separately as foul).
  return DIRS.some(([dr, dc]) => {
    const n = axisLen(board, r, c, dr, dc, stone);
    return stone === 1 ? n === 5 : n >= 5;
  });
}

function isOverline(board: Stone[][], r: number, c: number): boolean {
  const stone = board[r]![c]!;
  if (stone !== 1) return false;
  return DIRS.some(([dr, dc]) => axisLen(board, r, c, dr, dc, stone) >= 6);
}

/**
 * How many empties on this axis, if filled with `stone`, make exactly five
 * through that empty (Renju four threats on one axis).
 */
function fivePointsOnAxis(
  board: Stone[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  stone: Stone,
): number {
  let ways = 0;
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const rr = r + i * dr;
    const cc = c + i * dc;
    if (!inBoard(rr, cc) || board[rr]![cc] !== 0) continue;
    board[rr]![cc] = stone;
    const n = axisLen(board, rr, cc, dr, dc, stone);
    // Completion must include the stone at (r,c) — check before reverting.
    const hits = n === 5 && onSameSegment(board, r, c, rr, cc, dr, dc, stone);
    board[rr]![cc] = 0;
    if (hits) ways += 1;
  }
  return ways;
}

/** After hypothetically placing at (rr,cc), is (r,c) inside that exact-five run? */
function onSameSegment(
  board: Stone[][],
  r: number,
  c: number,
  rr: number,
  cc: number,
  dr: number,
  dc: number,
  stone: Stone,
): boolean {
  let a = rr;
  let b = cc;
  while (inBoard(a - dr, b - dc) && board[a - dr]![b - dc] === stone) {
    a -= dr;
    b -= dc;
  }
  let len = 0;
  let found = false;
  let tr = a;
  let tc = b;
  while (inBoard(tr, tc) && board[tr]![tc] === stone) {
    if (tr === r && tc === c) found = true;
    len += 1;
    tr += dr;
    tc += dc;
  }
  return found && len === 5;
}

function isOpenFourOnAxis(
  board: Stone[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  stone: Stone,
): boolean {
  return fivePointsOnAxis(board, r, c, dr, dc, stone) >= 2;
}

function isFourOnAxis(
  board: Stone[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  stone: Stone,
): boolean {
  return fivePointsOnAxis(board, r, c, dr, dc, stone) >= 1;
}

/**
 * Open three on an axis: not already a four, and some empty on the axis
 * upgrades the shape through (r,c) into an open four (活四).
 */
function isOpenThreeOnAxis(
  board: Stone[][],
  r: number,
  c: number,
  dr: number,
  dc: number,
  stone: Stone,
): boolean {
  if (isFourOnAxis(board, r, c, dr, dc, stone)) return false;
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const rr = r + i * dr;
    const cc = c + i * dc;
    if (!inBoard(rr, cc) || board[rr]![cc] !== 0) continue;
    board[rr]![cc] = stone;
    const becameOpenFour = isOpenFourOnAxis(board, r, c, dr, dc, stone);
    board[rr]![cc] = 0;
    if (becameOpenFour) return true;
  }
  return false;
}

function countFours(board: Stone[][], r: number, c: number, stone: Stone): number {
  let n = 0;
  for (const [dr, dc] of DIRS) {
    if (isFourOnAxis(board, r, c, dr, dc, stone)) n += 1;
  }
  return n;
}

function countOpenThrees(board: Stone[][], r: number, c: number, stone: Stone): number {
  let n = 0;
  for (const [dr, dc] of DIRS) {
    if (isOpenThreeOnAxis(board, r, c, dr, dc, stone)) n += 1;
  }
  return n;
}

/**
 * Renju fouls for Black after the stone is already on the board at (r,c).
 * Exact five is not a foul (win takes priority over 三三/四四).
 */
export function blackFoulAt(board: Stone[][], r: number, c: number): FoulKind | null {
  if (board[r]![c] !== 1) return null;
  if (isOverline(board, r, c)) return "overline";
  if (winsAt(board, r, c)) return null;
  if (countFours(board, r, c, 1) >= 2) return "double-four";
  if (countOpenThrees(board, r, c, 1) >= 2) return "double-three";
  return null;
}

export function applyGomokuAction(state: GState, actorId: string, action: GAction): GState {
  if (state.phase !== "play" || action.type !== "place") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;
  const { r, c } = action;
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || state.board[r]![c]) return state;
  const board = state.board.map((row) => row.slice()) as Stone[][];
  board[r]![c] = me.stone;

  // Black renju fouls → immediate loss (stone stays, opponent wins).
  if (me.stone === 1) {
    const foul = blackFoulAt(board, r, c);
    if (foul) {
      const opp = state.players.find((p) => p.id !== me.id)!;
      const tip = FOUL_LABEL[foul];
      return {
        ...state,
        board,
        phase: "over",
        winnerId: opp.id,
        foul: { kind: foul, r, c },
        last: { r, c },
        log: [
          ...state.log,
          {
            id: uid("l"),
            text: `${me.name} 黑方${tip}（${r + 1},${c + 1}）— ${opp.name} wins.`,
          },
        ],
      };
    }
  }

  if (winsAt(board, r, c)) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: me.id,
      foul: null,
      last: { r, c },
      log: [...state.log, { id: uid("l"), text: `${me.name} wins with five in a row.` }],
    };
  }
  const full = board.every((row) => row.every((cell) => cell !== 0));
  if (full) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: null,
      foul: null,
      last: { r, c },
      log: [...state.log, { id: uid("l"), text: "Draw — board full." }],
    };
  }
  return {
    ...state,
    board,
    turn: (state.turn + 1) % 2,
    foul: null,
    last: { r, c },
    log: [...state.log, { id: uid("l"), text: `${me.name} plays (${r + 1},${c + 1}).` }],
  };
}

export function viewGomoku(state: GState, _viewerId: string): GState {
  return state;
}

function scoreCell(board: Stone[][], r: number, c: number, stone: Stone): number {
  let score = 0;
  for (const [dr, dc] of DIRS) {
    const n = axisLen(board, r, c, dr, dc, stone);
    if (n >= 5) score += 10000;
    else if (n === 4) score += 800;
    else if (n === 3) score += 120;
    else if (n === 2) score += 20;
  }
  return score;
}

export function aiGomoku(state: GState): GAction {
  const me = state.players[state.turn]!;
  const oppStone = (me.stone === 1 ? 2 : 1) as Stone;
  let best: { r: number; c: number; score: number } | null = null;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (state.board[r]![c]) continue;
      let near = 0;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (inBoard(rr, cc) && state.board[rr]![cc]) near += 1;
        }
      }
      if (!near && state.last) continue;

      const trial = state.board.map((row) => row.slice()) as Stone[][];
      trial[r]![c] = me.stone;

      // Black AI must never play a foul.
      if (me.stone === 1 && blackFoulAt(trial, r, c)) continue;

      if (winsAt(trial, r, c)) return { type: "place", r, c };

      trial[r]![c] = oppStone;
      // Prefer blocking opponent wins; if opp is black, also note foul isn't forced.
      const block = winsAt(trial, r, c) ? 5000 : 0;

      trial[r]![c] = me.stone;
      const attack = scoreCell(trial, r, c, me.stone);
      trial[r]![c] = oppStone;
      const defend = scoreCell(trial, r, c, oppStone) * 0.9;
      const center = 7 - Math.abs(r - 7) - Math.abs(c - 7);
      const score = block + attack + defend + near * 3 + center;
      if (!best || score > best.score) best = { r, c, score };
    }
  }
  if (best) return { type: "place", r: best.r, c: best.c };
  return { type: "place", r: 7, c: 7 };
}
