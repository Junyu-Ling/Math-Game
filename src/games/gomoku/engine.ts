import { uid } from "../../lib/shuffle";

export const SIZE = 15;
export type Stone = 0 | 1 | 2; // 0 empty, 1 black, 2 white

export type GState = {
  board: Stone[][];
  players: Array<{ id: string; name: string; human: boolean; stone: 1 | 2 }>;
  turn: number;
  phase: "play" | "over";
  winnerId: string | null;
  last: { r: number; c: number } | null;
  log: Array<{ id: string; text: string }>;
};

export type GAction = { type: "place"; r: number; c: number };

function emptyBoard(): Stone[][] {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0 as Stone));
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
    last: null,
    log: [{ id: uid("l"), text: `${a.name} (black) vs ${b.name} (white). Five in a row wins.` }],
  };
}

export function startGomokuPractice(): GState {
  return startGomokuDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}

function lineLen(board: Stone[][], r: number, c: number, dr: number, dc: number, stone: Stone) {
  let n = 0;
  let rr = r + dr;
  let cc = c + dc;
  while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr]![cc] === stone) {
    n += 1;
    rr += dr;
    cc += dc;
  }
  return n;
}

export function winsAt(board: Stone[][], r: number, c: number): boolean {
  const stone = board[r]![c]!;
  if (!stone) return false;
  const dirs: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  return dirs.some(
    ([dr, dc]) =>
      1 + lineLen(board, r, c, dr, dc, stone) + lineLen(board, r, c, -dr, -dc, stone) >= 5,
  );
}

export function applyGomokuAction(state: GState, actorId: string, action: GAction): GState {
  if (state.phase !== "play" || action.type !== "place") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;
  const { r, c } = action;
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || state.board[r]![c]) return state;
  const board = state.board.map((row) => row.slice()) as Stone[][];
  board[r]![c] = me.stone;
  if (winsAt(board, r, c)) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: me.id,
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
      last: { r, c },
      log: [...state.log, { id: uid("l"), text: "Draw — board full." }],
    };
  }
  return {
    ...state,
    board,
    turn: (state.turn + 1) % 2,
    last: { r, c },
    log: [...state.log, { id: uid("l"), text: `${me.name} plays (${r + 1},${c + 1}).` }],
  };
}

export function viewGomoku(state: GState, _viewerId: string): GState {
  return state;
}

export function aiGomoku(state: GState): GAction {
  const me = state.players[state.turn]!;
  const oppStone = me.stone === 1 ? 2 : 1;
  let best: { r: number; c: number; score: number } | null = null;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (state.board[r]![c]) continue;
      // Prefer near existing stones.
      let near = 0;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && state.board[rr]![cc]) near += 1;
        }
      }
      if (!near && state.last) continue;
      const trial = state.board.map((row) => row.slice()) as Stone[][];
      trial[r]![c] = me.stone;
      if (winsAt(trial, r, c)) return { type: "place", r, c };
      trial[r]![c] = oppStone as Stone;
      const block = winsAt(trial, r, c) ? 500 : 0;
      const center = 7 - Math.abs(r - 7) - Math.abs(c - 7);
      const score = block + near * 3 + center;
      if (!best || score > best.score) best = { r, c, score };
    }
  }
  if (best) return { type: "place", r: best.r, c: best.c };
  // Opening or sparse board.
  return { type: "place", r: 7, c: 7 };
}
