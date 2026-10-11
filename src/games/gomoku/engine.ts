import { uid } from "../../lib/shuffle";
import { computeGomokuMove } from "./ai";

export const SIZE = 15;
export const RPS_REVEAL_MS = 2800;

export type Stone = 0 | 1 | 2; // 0 empty, 1 black, 2 white
export type RpsThrow = "rock" | "paper" | "scissors";
export type RpsReveal = { aId: string; a: RpsThrow; bId: string; b: RpsThrow };

/** Double open-three, double open-four, or overline (6+). */
export type FoulKind = "double-three" | "double-four" | "overline";

export type GPlayer = {
  id: string;
  name: string;
  human: boolean;
  /** Set after RPS — winner is black. */
  stone: 1 | 2 | null;
};

export type GState = {
  board: Stone[][];
  players: GPlayer[];
  turn: number;
  phase: "rps" | "play" | "over";
  rpsThrows: Partial<Record<string, RpsThrow>>;
  rpsReveal: RpsReveal | null;
  winnerId: string | null;
  /** Present when Black lost by a foul. */
  foul: { kind: FoulKind; r: number; c: number } | null;
  last: { r: number; c: number } | null;
  log: Array<{ id: string; text: string }>;
};

export type GAction = { type: "rps"; throw: RpsThrow } | { type: "place"; r: number; c: number };

const DIRS: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

const FOUL_LABEL: Record<FoulKind, string> = {
  "double-three": "double open three",
  "double-four": "double open four",
  overline: "overline",
};

const RPS_LABEL: Record<RpsThrow, string> = { rock: "rock", paper: "paper", scissors: "scissors" };

export function foulLabel(kind: FoulKind): string {
  return FOUL_LABEL[kind];
}

function emptyBoard(): Stone[][] {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0 as Stone));
}

function inBoard(r: number, c: number) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function seat(p: { id: string; name: string; human?: boolean }): GPlayer {
  return { id: p.id, name: p.name, human: p.human !== false, stone: null };
}

export function startGomokuDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): GState {
  return {
    board: emptyBoard(),
    players: [seat(a), seat(b)],
    turn: 0,
    phase: "rps",
    rpsThrows: {},
    rpsReveal: null,
    winnerId: null,
    foul: null,
    last: null,
    log: [
      {
        id: uid("l"),
        text: `Rock-paper-scissors. Winner plays black. Five in a row wins. Black fouls: double open three, double open four, overline.`,
      },
    ],
  };
}

export function startGomokuPractice(): GState {
  return startGomokuDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}

function rpsWins(a: RpsThrow, b: RpsThrow): boolean {
  return (
    (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
  );
}

function beginRpsReveal(state: GState, aId: string, a: RpsThrow, bId: string, b: RpsThrow): GState {
  return {
    ...state,
    rpsThrows: { [aId]: a, [bId]: b },
    rpsReveal: { aId, a, bId, b },
  };
}

function assignBlack(state: GState, blackId: string, note: string): GState {
  const players = state.players.map((p) => ({
    ...p,
    stone: (p.id === blackId ? 1 : 2) as 1 | 2,
  }));
  const turn = players.findIndex((p) => p.id === blackId);
  const black = players.find((p) => p.id === blackId);
  const white = players.find((p) => p.id !== blackId);
  return {
    ...state,
    players,
    turn: turn < 0 ? 0 : turn,
    phase: "play",
    rpsThrows: {},
    rpsReveal: null,
    log: [
      ...state.log,
      { id: uid("l"), text: note },
      {
        id: uid("l"),
        text: `${black?.name || "Black"} plays black · ${white?.name || "White"} plays white. Black to move.`,
      },
    ],
  };
}

export function finishGomokuRps(state: GState): GState {
  state = normalizeGomoku(state);
  if (state.phase !== "rps" || !state.rpsReveal) return state;
  const { aId, a, bId, b } = state.rpsReveal;
  if (a === b) {
    return {
      ...state,
      rpsThrows: {},
      rpsReveal: null,
      log: [...state.log, { id: uid("l"), text: `Tie, both ${RPS_LABEL[a]}. Throw again.` }],
    };
  }
  const winnerId = rpsWins(a, b) ? aId : bId;
  const winner = state.players.find((p) => p.id === winnerId);
  const aName = state.players.find((p) => p.id === aId)?.name;
  const bName = state.players.find((p) => p.id === bId)?.name;
  return assignBlack(
    state,
    winnerId,
    `${aName} ${RPS_LABEL[a]} vs ${bName} ${RPS_LABEL[b]}. ${winner?.name || "Winner"} takes black.`,
  );
}

/** Fill fields missing from older persisted rooms. */
export function normalizeGomoku(state: GState): GState {
  if (!state) return state;
  const players = (state.players || []).map((p) => ({
    ...p,
    stone: p.stone === 1 || p.stone === 2 ? p.stone : null,
  }));
  const hasColors = players.every((p) => p.stone === 1 || p.stone === 2);
  let phase = state.phase;
  if (phase !== "rps" && phase !== "play" && phase !== "over") {
    phase = hasColors ? "play" : "rps";
  } else if (phase === "play" && !hasColors) {
    phase = "rps";
  }
  return {
    ...state,
    players,
    phase,
    rpsThrows: state.rpsThrows || {},
    rpsReveal: state.rpsReveal ?? null,
    foul: state.foul ?? null,
    last: state.last ?? null,
    winnerId: state.winnerId ?? null,
    board: state.board || emptyBoard(),
    log: state.log || [],
    turn: Number.isFinite(state.turn) ? state.turn : 0,
  };
}

function playRps(state: GState, actorId: string, you: RpsThrow): GState {
  state = normalizeGomoku(state);
  if (state.phase !== "rps" || state.rpsReveal) return state;
  const me = state.players.find((p) => p.id === actorId);
  const foe = state.players.find((p) => p.id !== actorId);
  if (!me || !foe) return state;
  const throws = state.rpsThrows || {};
  if (throws[me.id]) return state;
  if (!foe.human) {
    const ai = (["rock", "paper", "scissors"] as const)[Math.floor(Math.random() * 3)]!;
    return beginRpsReveal(state, me.id, you, foe.id, ai);
  }
  const theirs = throws[foe.id];
  if (!theirs) {
    return {
      ...state,
      rpsThrows: { ...throws, [me.id]: you },
      log: [...state.log, { id: uid("l"), text: `${me.name} is ready. Waiting for the other hand.` }],
    };
  }
  return beginRpsReveal({ ...state, rpsThrows: { ...throws, [me.id]: you } }, me.id, you, foe.id, theirs);
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

function axisLen(board: Stone[][], r: number, c: number, dr: number, dc: number, stone: Stone) {
  return 1 + lineLen(board, r, c, dr, dc, stone) + lineLen(board, r, c, -dr, -dc, stone);
}

export function winsAt(board: Stone[][], r: number, c: number): boolean {
  const stone = board[r]![c]!;
  if (!stone) return false;
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
    const hits = n === 5 && onSameSegment(board, r, c, rr, cc, dr, dc, stone);
    board[rr]![cc] = 0;
    if (hits) ways += 1;
  }
  return ways;
}

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

/** Open three (活三): can become an open four next. */
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

function countOpenFours(board: Stone[][], r: number, c: number, stone: Stone): number {
  let n = 0;
  for (const [dr, dc] of DIRS) {
    if (isOpenFourOnAxis(board, r, c, dr, dc, stone)) n += 1;
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
 * Black fouls after the stone is on the board at (r,c):
 * overline, double open four, double open three.
 * Exact five is a win, not a foul.
 */
export function blackFoulAt(board: Stone[][], r: number, c: number): FoulKind | null {
  if (board[r]![c] !== 1) return null;
  if (isOverline(board, r, c)) return "overline";
  if (winsAt(board, r, c)) return null;
  if (countOpenFours(board, r, c, 1) >= 2) return "double-four";
  if (countOpenThrees(board, r, c, 1) >= 2) return "double-three";
  return null;
}

export function applyGomokuAction(state: GState, actorId: string, action: GAction): GState {
  state = normalizeGomoku(state);
  if (state.phase === "over") return state;

  if (state.phase === "rps") {
    if (action.type === "rps") return playRps(state, actorId, action.throw);
    return state;
  }

  if (state.phase !== "play" || action.type !== "place") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId || !me.stone) return state;
  const { r, c } = action;
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || state.board[r]![c]) return state;
  const board = state.board.map((row) => row.slice()) as Stone[][];
  board[r]![c] = me.stone;

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
            text: `${me.name} fouls with ${tip} at (${r + 1},${c + 1}) — ${opp.name} wins.`,
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

export function viewGomoku(state: GState, viewerId: string): GState {
  const s = normalizeGomoku(state);
  const throws = s.rpsThrows || {};
  const id = String(viewerId || "");
  return {
    ...s,
    rpsThrows: s.rpsReveal
      ? { [s.rpsReveal.aId]: s.rpsReveal.a, [s.rpsReveal.bId]: s.rpsReveal.b }
      : throws[id]
        ? { [id]: throws[id] }
        : {},
    rpsReveal: s.rpsReveal,
  };
}

export function aiGomoku(state: GState): GAction {
  if (state.phase === "rps") {
    const hand = (["rock", "paper", "scissors"] as const)[Math.floor(Math.random() * 3)]!;
    return { type: "rps", throw: hand };
  }
  return computeGomokuMove(state);
}
