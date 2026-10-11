import { uid } from "../../lib/shuffle";

/** Simplified 2-player Chinese flying chess / Ludo race. */
export type LPiece = { id: string; track: number; home: boolean }; // track -1 = base, 0..47 path, home done
export type LPlayer = { id: string; name: string; human: boolean; pieces: LPiece[]; finished: number };
export type LState = {
  players: LPlayer[];
  turn: number;
  dice: number | null;
  phase: "roll" | "move" | "over";
  winnerId: string | null;
  log: Array<{ id: string; text: string }>;
};
export type LAction = { type: "roll" } | { type: "move"; pieceId: string };

const PATH = 48;
const ENTRY = [0, 24] as const;

function pieces(): LPiece[] {
  return Array.from({ length: 4 }, (_, i) => ({ id: uid(`p${i}`), track: -1, home: false }));
}

export function startLudoDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): LState {
  return {
    players: [
      { id: a.id, name: a.name, human: a.human !== false, pieces: pieces(), finished: 0 },
      { id: b.id, name: b.name, human: b.human !== false, pieces: pieces(), finished: 0 },
    ],
    turn: 0,
    dice: null,
    phase: "roll",
    winnerId: null,
    log: [{ id: uid("l"), text: `${a.name} vs ${b.name}. Roll 6 to leave base. First to land all 4 home wins.` }],
  };
}

export function startLudoPractice(): LState {
  return startLudoDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}

function absPos(playerIdx: number, track: number) {
  if (track < 0) return -1;
  return (ENTRY[playerIdx]! + track) % PATH;
}

export function legalMoves(state: LState, playerIdx: number): string[] {
  const dice = state.dice;
  if (dice == null) return [];
  const me = state.players[playerIdx]!;
  const out: string[] = [];
  for (const p of me.pieces) {
    if (p.home) continue;
    if (p.track < 0) {
      if (dice === 6) out.push(p.id);
      continue;
    }
    const next = p.track + dice;
    if (next === PATH) out.push(p.id);
    else if (next < PATH) out.push(p.id);
  }
  return out;
}

function bump(state: LState, moverIdx: number, abs: number): LPlayer[] {
  return state.players.map((pl, i) => {
    if (i === moverIdx) return pl;
    return {
      ...pl,
      pieces: pl.pieces.map((p) => {
        if (p.home || p.track < 0) return p;
        if (absPos(i, p.track) === abs) return { ...p, track: -1 };
        return p;
      }),
    };
  });
}

export function applyLudoAction(state: LState, actorId: string, action: LAction): LState {
  if (state.phase === "over") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;

  if (action.type === "roll" && state.phase === "roll") {
    const dice = 1 + Math.floor(Math.random() * 6);
    const next: LState = {
      ...state,
      dice,
      phase: "move",
      log: [...state.log, { id: uid("l"), text: `${me.name} rolls ${dice}.` }],
    };
    if (legalMoves(next, state.turn).length === 0) {
      return {
        ...next,
        dice: null,
        phase: "roll",
        turn: (state.turn + 1) % 2,
        log: [...next.log, { id: uid("l"), text: "No legal move." }],
      };
    }
    return next;
  }

  if (action.type === "move" && state.phase === "move" && state.dice != null) {
    const legal = legalMoves(state, state.turn);
    if (!legal.includes(action.pieceId)) return state;
    const dice = state.dice;
    let players = state.players.map((pl, i) => {
      if (i !== state.turn) return pl;
      return {
        ...pl,
        pieces: pl.pieces.map((p) => {
          if (p.id !== action.pieceId) return p;
          if (p.track < 0) return { ...p, track: 0 };
          const next = p.track + dice;
          if (next === PATH) return { ...p, track: PATH, home: true };
          return { ...p, track: next };
        }),
      };
    });
    const moved = players[state.turn]!.pieces.find((p) => p.id === action.pieceId)!;
    if (!moved.home && moved.track >= 0) {
      players = bump({ ...state, players }, state.turn, absPos(state.turn, moved.track));
    }
    const finisher = {
      ...players[state.turn]!,
      finished: players[state.turn]!.pieces.filter((p) => p.home).length,
    };
    players = players.map((p, i) => (i === state.turn ? finisher : p));
    if (finisher.finished >= 4) {
      return {
        ...state,
        players,
        dice: null,
        phase: "over",
        winnerId: me.id,
        log: [...state.log, { id: uid("l"), text: `${me.name} gets all pieces home!` }],
      };
    }
    const extra = dice === 6;
    return {
      ...state,
      players,
      dice: null,
      phase: "roll",
      turn: extra ? state.turn : (state.turn + 1) % 2,
      log: [
        ...state.log,
        {
          id: uid("l"),
          text: moved.home
            ? `${me.name} lands a piece home.`
            : `${me.name} moves a piece${extra ? " · rolls again" : ""}.`,
        },
      ],
    };
  }
  return state;
}

export function viewLudo(state: LState, _viewerId: string): LState {
  return state;
}

export function aiLudo(state: LState): LAction {
  if (state.phase === "roll") return { type: "roll" };
  const moves = legalMoves(state, state.turn);
  // Prefer finishing, then leaving base, then farthest.
  const me = state.players[state.turn]!;
  const scored = moves.map((id) => {
    const p = me.pieces.find((x) => x.id === id)!;
    let score = p.track;
    if (state.dice != null && p.track >= 0 && p.track + state.dice === PATH) score = 100;
    if (p.track < 0) score = 50;
    return { id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return { type: "move", pieceId: scored[0]!.id };
}

export function pieceCell(playerIdx: number, piece: LPiece): { r: number; c: number } | null {
  if (piece.home) return playerIdx === 0 ? { r: 5, c: 5 } : { r: 5, c: 5 };
  if (piece.track < 0) {
    const nest = playerIdx === 0 ? [0, 0] : [0, 9];
    const offsets = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    const idx = Number(piece.id.slice(-1)) % 4;
    const o = offsets[idx] || [0, 0];
    return { r: nest[0]! + o[0]!, c: nest[1]! + o[1]! };
  }
  // Map 0..47 onto an 11x11 ring-ish path (simplified visual).
  const ring: Array<[number, number]> = [];
  for (let c = 0; c < 11; c++) ring.push([0, c]);
  for (let r = 1; r < 11; r++) ring.push([r, 10]);
  for (let c = 9; c >= 0; c--) ring.push([10, c]);
  for (let r = 9; r >= 1; r--) ring.push([r, 0]);
  // pad/trim to PATH
  while (ring.length < PATH) ring.push(ring[ring.length - 1]!);
  const abs = absPos(playerIdx, piece.track) % ring.length;
  const [r, c] = ring[abs]!;
  return { r, c };
}
