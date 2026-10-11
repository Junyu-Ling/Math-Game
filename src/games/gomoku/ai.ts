import { SIZE, blackFoulAt, winsAt, type GAction, type GState, type Stone } from "./engine";

/**
 * Pattern-based Gomoku AI with alpha-beta search.
 * Shape scores follow classic gobang heuristic tables (live/rush fours & threes).
 */

const DIRS: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

const SCORE = {
  five: 500_000,
  liveFour: 50_000,
  rushFour: 10_000,
  liveThree: 5_000,
  sleepThree: 500,
  liveTwo: 200,
  sleepTwo: 40,
  liveOne: 10,
} as const;

const WIN = 10_000_000;
const SEARCH_DEPTH = 3;
const CANDIDATE_LIMIT = 14;
const NEAR = 2;

function inBoard(r: number, c: number) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function cloneBoard(board: Stone[][]): Stone[][] {
  return board.map((row) => row.slice()) as Stone[][];
}

function isLegal(board: Stone[][], r: number, c: number, stone: 1 | 2): boolean {
  if (!inBoard(r, c) || board[r]![c]) return false;
  if (stone !== 1) return true;
  board[r]![c] = 1;
  const foul = blackFoulAt(board, r, c);
  board[r]![c] = 0;
  return !foul;
}

/** Count consecutive stones + whether the far side is open. */
function ray(board: Stone[][], r: number, c: number, dr: number, dc: number, stone: Stone) {
  let n = 0;
  let rr = r + dr;
  let cc = c + dc;
  while (inBoard(rr, cc) && board[rr]![cc] === stone) {
    n += 1;
    rr += dr;
    cc += dc;
  }
  const open = inBoard(rr, cc) && board[rr]![cc] === 0;
  return { n, open };
}

/**
 * Score one axis through (r,c) assuming `stone` is (or will be) there.
 * Includes simple gap shapes XX_X / X_XX.
 */
function scoreAxis(board: Stone[][], r: number, c: number, dr: number, dc: number, stone: Stone): number {
  const a = ray(board, r, c, dr, dc, stone);
  const b = ray(board, r, c, -dr, -dc, stone);
  const len = a.n + b.n + 1;
  const opens = (a.open ? 1 : 0) + (b.open ? 1 : 0);

  let score = 0;
  if (len >= 5) score = SCORE.five;
  else if (len === 4) score = opens === 2 ? SCORE.liveFour : opens === 1 ? SCORE.rushFour : 0;
  else if (len === 3) score = opens === 2 ? SCORE.liveThree : opens === 1 ? SCORE.sleepThree : 0;
  else if (len === 2) score = opens === 2 ? SCORE.liveTwo : opens === 1 ? SCORE.sleepTwo : 0;
  else if (len === 1) score = opens === 2 ? SCORE.liveOne : 0;

  // Gap patterns: XX_X / X_XX counting toward rush-four / live-three pressure.
  score += scoreGap(board, r, c, dr, dc, stone);
  return score;
}

function scoreGap(board: Stone[][], r: number, c: number, dr: number, dc: number, stone: Stone): number {
  let best = 0;
  for (const sign of [1, -1] as const) {
    const sdr = dr * sign;
    const sdc = dc * sign;
    // stone, empty, then 1–2 stones
    const eR = r + sdr;
    const eC = c + sdc;
    if (!inBoard(eR, eC) || board[eR]![eC] !== 0) continue;
    let run = 0;
    let rr = eR + sdr;
    let cc = eC + sdc;
    while (inBoard(rr, cc) && board[rr]![cc] === stone) {
      run += 1;
      rr += sdr;
      cc += sdc;
    }
    if (run === 0) continue;
    const farOpen = inBoard(rr, cc) && board[rr]![cc] === 0;
    const back = ray(board, r, c, -sdr, -sdc, stone);
    const total = back.n + 1 + run;
    if (total >= 4 && (back.open || farOpen)) best = Math.max(best, SCORE.rushFour * 0.85);
    else if (total === 3 && back.open && farOpen) best = Math.max(best, SCORE.liveThree * 0.8);
    else if (total === 3 && (back.open || farOpen)) best = Math.max(best, SCORE.sleepThree * 0.8);
  }
  return best;
}

function scorePoint(board: Stone[][], r: number, c: number, stone: Stone): number {
  let s = 0;
  for (const [dr, dc] of DIRS) s += scoreAxis(board, r, c, dr, dc, stone);
  return s;
}

function hasNeighbor(board: Stone[][], r: number, c: number, dist: number): boolean {
  for (let dr = -dist; dr <= dist; dr++) {
    for (let dc = -dist; dc <= dist; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (inBoard(rr, cc) && board[rr]![cc]) return true;
    }
  }
  return false;
}

type Cand = { r: number; c: number; h: number };

function candidates(board: Stone[][], me: 1 | 2, opp: 1 | 2, limit: number): Cand[] {
  const empty = !board.some((row) => row.some((x) => x !== 0));
  if (empty) return [{ r: 7, c: 7, h: 1 }];

  const list: Cand[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r]![c] || !hasNeighbor(board, r, c, NEAR)) continue;
      if (!isLegal(board, r, c, me)) continue;

      board[r]![c] = me;
      if (winsAt(board, r, c)) {
        board[r]![c] = 0;
        return [{ r, c, h: WIN }];
      }
      const attack = scorePoint(board, r, c, me);
      board[r]![c] = 0;

      let oppWin = false;
      let defend = 0;
      if (isLegal(board, r, c, opp)) {
        board[r]![c] = opp;
        oppWin = winsAt(board, r, c);
        defend = scorePoint(board, r, c, opp);
        board[r]![c] = 0;
      }

      const center = 8 - Math.abs(r - 7) - Math.abs(c - 7);
      const h = (oppWin ? WIN * 0.9 : 0) + attack + defend * 1.05 + center;
      list.push({ r, c, h });
    }
  }
  list.sort((a, b) => b.h - a.h);
  return list.slice(0, limit);
}

/** Position value ≈ sum of shape potential on nearby empties for both sides. */
function evaluateBoard(board: Stone[][], me: 1 | 2, opp: 1 | 2): number {
  let mine = 0;
  let theirs = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r]![c] || !hasNeighbor(board, r, c, NEAR)) continue;
      board[r]![c] = me;
      mine += scorePoint(board, r, c, me);
      board[r]![c] = opp;
      theirs += scorePoint(board, r, c, opp);
      board[r]![c] = 0;
    }
  }
  return mine - theirs * 1.1;
}

function alphabeta(
  board: Stone[][],
  depth: number,
  alpha: number,
  beta: number,
  me: 1 | 2,
  opp: 1 | 2,
  maximizing: boolean,
): number {
  if (depth === 0) return evaluateBoard(board, me, opp);

  const stone = maximizing ? me : opp;
  const other = maximizing ? opp : me;
  const moves = candidates(board, stone, other, CANDIDATE_LIMIT);
  if (!moves.length) return evaluateBoard(board, me, opp);

  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      board[m.r]![m.c] = stone;
      let val: number;
      if (winsAt(board, m.r, m.c)) val = WIN + depth;
      else val = alphabeta(board, depth - 1, alpha, beta, me, opp, false);
      board[m.r]![m.c] = 0;
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  let best = Infinity;
  for (const m of moves) {
    if (stone === 1 && !isLegal(board, m.r, m.c, 1)) continue;
    board[m.r]![m.c] = stone;
    let val: number;
    if (winsAt(board, m.r, m.c)) val = -WIN - depth;
    else val = alphabeta(board, depth - 1, alpha, beta, me, opp, true);
    board[m.r]![m.c] = 0;
    if (val < best) best = val;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
  }
  return best === Infinity ? evaluateBoard(board, me, opp) : best;
}

export function computeGomokuMove(state: GState): GAction {
  const me = state.players[state.turn]!;
  const myStone = (me.stone ?? 1) as 1 | 2;
  const oppStone = (myStone === 1 ? 2 : 1) as 1 | 2;
  const board = cloneBoard(state.board);

  const root = candidates(board, myStone, oppStone, CANDIDATE_LIMIT);
  if (!root.length) return { type: "place", r: 7, c: 7 };
  if (root[0]!.h >= WIN * 0.85) return { type: "place", r: root[0]!.r, c: root[0]!.c };

  let bestMove = root[0]!;
  let bestScore = -Infinity;

  for (const m of root) {
    board[m.r]![m.c] = myStone;
    let score: number;
    if (winsAt(board, m.r, m.c)) score = WIN;
    else score = alphabeta(board, SEARCH_DEPTH - 1, -Infinity, Infinity, myStone, oppStone, false);
    board[m.r]![m.c] = 0;
    // Tiny jitter so equal lines don't always pick the same cell.
    score += Math.random() * 3;
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }

  return { type: "place", r: bestMove.r, c: bestMove.c };
}
