import { uid } from "../../lib/shuffle";

/**
 * Simplified open 军棋 (army chess) — 5×6 board, known ranks.
 * Capture: higher rank wins; same rank both die; bomb kills any (incl. itself);
 * mine only beaten by engineer; flag capture wins.
 */
export type Rank =
  | "flag"
  | "commander"
  | "general"
  | "major"
  | "colonel"
  | "captain"
  | "lieutenant"
  | "engineer"
  | "bomb"
  | "mine";

const POWER: Record<Rank, number> = {
  flag: 0,
  mine: 0,
  bomb: 99,
  commander: 10,
  general: 9,
  major: 8,
  colonel: 7,
  captain: 6,
  lieutenant: 5,
  engineer: 3,
};

export const RANK_LABEL: Record<Rank, string> = {
  flag: "军旗",
  commander: "司令",
  general: "军长",
  major: "师长",
  colonel: "旅长",
  captain: "团长",
  lieutenant: "营长",
  engineer: "工兵",
  bomb: "炸弹",
  mine: "地雷",
};

export type Piece = { id: string; side: 0 | 1; rank: Rank };
export type Cell = Piece | null;

export type ArmyState = {
  board: Cell[][];
  players: Array<{ id: string; name: string; human: boolean; side: 0 | 1 }>;
  turn: number;
  phase: "play" | "over";
  winnerId: string | null;
  selected: { r: number; c: number } | null;
  log: Array<{ id: string; text: string }>;
};

export type ArmyAction =
  | { type: "select"; r: number; c: number }
  | { type: "move"; r: number; c: number }
  | { type: "clear" };

const ROWS = 6;
const COLS = 5;

function layout(side: 0 | 1): Rank[] {
  // 10 pieces each on back two rows.
  return side === 0
    ? ["commander", "general", "major", "colonel", "captain", "lieutenant", "engineer", "bomb", "mine", "flag"]
    : ["flag", "mine", "bomb", "engineer", "lieutenant", "captain", "colonel", "major", "general", "commander"];
}

function setup(): Cell[][] {
  const b: Cell[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  const put = (ranks: Rank[], startR: number, side: 0 | 1) => {
    let i = 0;
    for (let r = startR; r < startR + 2; r++) {
      for (let c = 0; c < COLS; c++) {
        const rank = ranks[i++]!;
        b[r]![c] = { id: uid("m"), side, rank };
      }
    }
  };
  put(layout(0), 0, 0);
  put(layout(1), 4, 1);
  return b;
}

export function startArmyDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): ArmyState {
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
    log: [{ id: uid("l"), text: `${a.name} vs ${b.name}. Capture the rival 军旗 to win.` }],
  };
}

export function startArmyPractice(): ArmyState {
  return startArmyDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}

function immobile(rank: Rank) {
  return rank === "flag" || rank === "mine";
}

function resolve(atk: Rank, def: Rank): "atk" | "def" | "both" {
  if (def === "flag") return "atk";
  if (atk === "bomb" || def === "bomb") return "both";
  if (def === "mine") return atk === "engineer" ? "atk" : "def";
  if (atk === "mine") return "def";
  if (POWER[atk] > POWER[def]) return "atk";
  if (POWER[atk] < POWER[def]) return "def";
  return "both";
}

export function armyMoves(state: ArmyState, r: number, c: number): Array<{ r: number; c: number }> {
  const piece = state.board[r]![c];
  if (!piece || immobile(piece.rank)) return [];
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
    const tgt = state.board[rr]![cc];
    if (!tgt) out.push({ r: rr, c: cc });
    else if (tgt.side !== piece.side) out.push({ r: rr, c: cc });
  }
  return out;
}

export function applyArmyAction(state: ArmyState, actorId: string, action: ArmyAction): ArmyState {
  if (state.phase !== "play") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;

  if (action.type === "clear") return { ...state, selected: null };

  if (action.type === "select") {
    const p = state.board[action.r]?.[action.c];
    if (!p || p.side !== me.side || immobile(p.rank)) return { ...state, selected: null };
    return { ...state, selected: { r: action.r, c: action.c } };
  }

  if (action.type === "move" && state.selected) {
    const from = state.selected;
    const legal = armyMoves(state, from.r, from.c);
    if (!legal.some((m) => m.r === action.r && m.c === action.c)) return state;
    const atk = state.board[from.r]![from.c]!;
    const def = state.board[action.r]![action.c];
    const board = state.board.map((row) => row.slice());
    board[from.r]![from.c] = null;
    let log = [...state.log];
    let winnerId: string | null = null;
    let phase: "play" | "over" = "play";

    if (!def) {
      board[action.r]![action.c] = atk;
      log = [...log, { id: uid("l"), text: `${me.name} moves ${RANK_LABEL[atk.rank]}.` }];
    } else {
      const res = resolve(atk.rank, def.rank);
      if (def.rank === "flag" && res === "atk") {
        board[action.r]![action.c] = atk;
        winnerId = me.id;
        phase = "over";
        log = [...log, { id: uid("l"), text: `${me.name} captures 军旗 and wins!` }];
      } else if (res === "atk") {
        board[action.r]![action.c] = atk;
        log = [...log, { id: uid("l"), text: `${me.name}'s ${RANK_LABEL[atk.rank]} beats ${RANK_LABEL[def.rank]}.` }];
      } else if (res === "def") {
        board[action.r]![action.c] = def;
        log = [...log, { id: uid("l"), text: `${me.name}'s ${RANK_LABEL[atk.rank]} falls to ${RANK_LABEL[def.rank]}.` }];
      } else {
        board[action.r]![action.c] = null;
        log = [...log, { id: uid("l"), text: `${RANK_LABEL[atk.rank]} and ${RANK_LABEL[def.rank]} both fall.` }];
      }
    }

    // Flag alone with no movable pieces → loss.
    if (phase !== "over") {
      for (const side of [0, 1] as const) {
        const mine = board.flat().filter((p): p is Piece => Boolean(p && p.side === side));
        const movable = mine.some((p) => !immobile(p.rank));
        const hasFlag = mine.some((p) => p.rank === "flag");
        if (!hasFlag || !movable) {
          const winner = state.players.find((p) => p.side !== side)!;
          winnerId = winner.id;
          phase = "over";
          log = [...log, { id: uid("l"), text: `${winner.name} wins — rival has no fight left.` }];
          break;
        }
      }
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

export function viewArmy(state: ArmyState, _viewerId: string): ArmyState {
  return state;
}

export function aiArmy(state: ArmyState): ArmyAction {
  const me = state.players[state.turn]!;
  type Cand = { fr: number; fc: number; tr: number; tc: number; score: number };
  const cands: Cand[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = state.board[r]![c];
      if (!p || p.side !== me.side) continue;
      for (const m of armyMoves(state, r, c)) {
        let score = Math.random();
        const tgt = state.board[m.r]![m.c];
        if (tgt?.rank === "flag") score += 200;
        else if (tgt) score += POWER[tgt.rank] || 1;
        score += me.side === 0 ? m.r : ROWS - 1 - m.r;
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
