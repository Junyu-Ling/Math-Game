import { uid } from "../../lib/shuffle";

/** Dou Shou Qi / Jungle chess — 7×9. */
export const COLS = 7;
export const ROWS = 9;

export type Animal =
  | "elephant"
  | "lion"
  | "tiger"
  | "leopard"
  | "wolf"
  | "dog"
  | "cat"
  | "rat";

const RANK: Record<Animal, number> = {
  elephant: 8,
  lion: 7,
  tiger: 6,
  leopard: 5,
  wolf: 4,
  dog: 3,
  cat: 2,
  rat: 1,
};

export const LABEL: Record<Animal, string> = {
  elephant: "象",
  lion: "狮",
  tiger: "虎",
  leopard: "豹",
  wolf: "狼",
  dog: "狗",
  cat: "猫",
  rat: "鼠",
};

export type Piece = { id: string; side: 0 | 1; kind: Animal };
export type Cell = Piece | null;

export type AState = {
  board: Cell[][];
  players: Array<{ id: string; name: string; human: boolean; side: 0 | 1 }>;
  turn: number;
  phase: "play" | "over";
  winnerId: string | null;
  selected: { r: number; c: number } | null;
  log: Array<{ id: string; text: string }>;
};

export type AAction =
  | { type: "select"; r: number; c: number }
  | { type: "move"; r: number; c: number }
  | { type: "clear" };

function river(r: number, c: number) {
  return (r >= 3 && r <= 5) && (c === 1 || c === 2 || c === 4 || c === 5);
}

function den(r: number, c: number, side: 0 | 1) {
  return side === 0 ? r === 0 && c === 3 : r === 8 && c === 3;
}

function trap(r: number, c: number, side: 0 | 1) {
  // Traps adjacent to opponent den protect your den approach.
  if (side === 0) return (r === 0 && (c === 2 || c === 4)) || (r === 1 && c === 3);
  return (r === 8 && (c === 2 || c === 4)) || (r === 7 && c === 3);
}

function setup(): Cell[][] {
  const b: Cell[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  const place = (r: number, c: number, side: 0 | 1, kind: Animal) => {
    b[r]![c] = { id: uid("a"), side, kind };
  };
  // Side 0 top
  place(0, 0, 0, "lion");
  place(0, 6, 0, "tiger");
  place(1, 1, 0, "dog");
  place(1, 5, 0, "cat");
  place(2, 0, 0, "rat");
  place(2, 2, 0, "leopard");
  place(2, 4, 0, "wolf");
  place(2, 6, 0, "elephant");
  // Side 1 bottom
  place(8, 6, 1, "lion");
  place(8, 0, 1, "tiger");
  place(7, 5, 1, "dog");
  place(7, 1, 1, "cat");
  place(6, 6, 1, "rat");
  place(6, 4, 1, "leopard");
  place(6, 2, 1, "wolf");
  place(6, 0, 1, "elephant");
  return b;
}

export function startAnimalDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): AState {
  return {
    board: setup(),
    players: [
      { id: a.id, name: a.name, human: a.human !== false, side: 0 },
      { id: b.id, name: b.name, human: b.human !== false, side: 1 },
    ],
    turn: 0,
    phase: "play",
    winnerId: null,
    selected: null,
    log: [{ id: uid("l"), text: `${a.name} (top) vs ${b.name} (bottom). Enter the rival den to win.` }],
  };
}

export function startAnimalPractice(): AState {
  return startAnimalDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}

function canCapture(atk: Animal, def: Animal, atkTrapped: boolean): boolean {
  if (atkTrapped) return false;
  if (atk === "rat" && def === "elephant") return true;
  if (atk === "elephant" && def === "rat") return false;
  return RANK[atk] >= RANK[def];
}

function jumpLand(board: Cell[][], r: number, c: number, dr: number, dc: number): { r: number; c: number } | null {
  let rr = r + dr;
  let cc = c + dc;
  let sawRiver = false;
  while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && river(rr, cc)) {
    sawRiver = true;
    if (board[rr]![cc]?.kind === "rat") return null;
    rr += dr;
    cc += dc;
  }
  if (!sawRiver) return null;
  if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return null;
  return { r: rr, c: cc };
}

export function movesFrom(state: AState, r: number, c: number): Array<{ r: number; c: number }> {
  const piece = state.board[r]![c];
  if (!piece) return [];
  const me = state.players[state.turn]!;
  if (piece.side !== me.side) return [];
  const out: Array<{ r: number; c: number }> = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dr, dc] of dirs) {
    const rr = r + dr!;
    const cc = c + dc!;
    if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
    if (den(rr, cc, piece.side)) continue; // own den forbidden
    if (river(rr, cc) && piece.kind !== "rat") {
      if (piece.kind === "lion" || piece.kind === "tiger") {
        const land = jumpLand(state.board, r, c, dr!, dc!);
        if (land) {
          const tgt = state.board[land.r]![land.c];
          if (!tgt || (tgt.side !== piece.side && canCapture(piece.kind, tgt.kind, trap(land.r, land.c, piece.side)))) {
            out.push(land);
          }
        }
      }
      continue;
    }
    if (river(rr, cc) && piece.kind === "rat") {
      // rat may enter river
    } else if (river(rr, cc)) continue;
    const tgt = state.board[rr]![cc];
    if (!tgt) {
      out.push({ r: rr, c: cc });
      continue;
    }
    if (tgt.side === piece.side) continue;
    const atkTrapped = trap(r, c, piece.side === 0 ? 1 : 0);
    // Defenders in their traps are weakened (any attacker can take).
    const defInTrap = trap(rr, cc, tgt.side === 0 ? 1 : 0);
    if (defInTrap || canCapture(piece.kind, tgt.kind, atkTrapped)) out.push({ r: rr, c: cc });
  }
  return out;
}

export function applyAnimalAction(state: AState, actorId: string, action: AAction): AState {
  if (state.phase !== "play") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;

  if (action.type === "clear") return { ...state, selected: null };

  if (action.type === "select") {
    const p = state.board[action.r]?.[action.c];
    if (!p || p.side !== me.side) return { ...state, selected: null };
    return { ...state, selected: { r: action.r, c: action.c } };
  }

  if (action.type === "move" && state.selected) {
    const from = state.selected;
    const legal = movesFrom(state, from.r, from.c);
    if (!legal.some((m) => m.r === action.r && m.c === action.c)) return state;
    const piece = state.board[from.r]![from.c]!;
    const board = state.board.map((row) => row.slice());
    board[from.r]![from.c] = null;
    board[action.r]![action.c] = piece;
    let winnerId: string | null = null;
    let phase: "play" | "over" = "play";
    let log = [...state.log, { id: uid("l"), text: `${me.name} moves ${LABEL[piece.kind]}.` }];
    if (den(action.r, action.c, me.side === 0 ? 1 : 0)) {
      winnerId = me.id;
      phase = "over";
      log = [...log, { id: uid("l"), text: `${me.name} enters the den and wins!` }];
    }
    return {
      ...state,
      board,
      selected: null,
      turn: phase === "over" ? state.turn : (state.turn + 1) % 2,
      phase,
      winnerId,
      log,
    };
  }
  return state;
}

export function viewAnimal(state: AState, _viewerId: string): AState {
  return state;
}

export function aiAnimal(state: AState): AAction {
  const me = state.players[state.turn]!;
  type Cand = { fr: number; fc: number; tr: number; tc: number; score: number };
  const cands: Cand[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = state.board[r]![c];
      if (!p || p.side !== me.side) continue;
      for (const m of movesFrom(state, r, c)) {
        let score = Math.random();
        const tgt = state.board[m.r]![m.c];
        if (tgt) score += 10 + RANK[tgt.kind];
        if (den(m.r, m.c, me.side === 0 ? 1 : 0)) score += 100;
        // advance toward rival den
        const goalR = me.side === 0 ? 8 : 0;
        score += (ROWS - Math.abs(m.r - goalR)) * 0.2;
        cands.push({ fr: r, fc: c, tr: m.r, tc: m.c, score });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  if (!best) return { type: "clear" };
  if (!state.selected || state.selected.r !== best.fr || state.selected.c !== best.fc) {
    return { type: "select", r: best.fr, c: best.fc };
  }
  return { type: "move", r: best.tr, c: best.tc };
}

export function cellKind(r: number, c: number): "river" | "trap" | "den" | "plain" {
  if (den(r, c, 0) || den(r, c, 1)) return "den";
  if (trap(r, c, 0) || trap(r, c, 1)) return "trap";
  if (river(r, c)) return "river";
  return "plain";
}
