/** Classic 3-reel practice slots. Paytable is fixed (not true casino RTP). */

export type SymbolId = "cherry" | "lemon" | "orange" | "plum" | "bell" | "bar" | "seven" | "wild";

export const SYMBOLS: SymbolId[] = ["cherry", "lemon", "orange", "plum", "bell", "bar", "seven", "wild"];

export const SYMBOL_LABEL: Record<SymbolId, string> = {
  cherry: "Cherry",
  lemon: "Lemon",
  orange: "Orange",
  plum: "Plum",
  bell: "Bell",
  bar: "BAR",
  seven: "7",
  wild: "WILD",
};

/** Weights per reel (higher = more common). Wild is rare. */
const WEIGHTS: Record<SymbolId, number> = {
  cherry: 14,
  lemon: 12,
  orange: 11,
  plum: 10,
  bell: 8,
  bar: 6,
  seven: 4,
  wild: 2,
};

/** Line pays as net multiples of stake (stake returned + profit = stake × (mult)).
 * Three-of-a-kind; wild substitutes except for wild-only line. */
export const PAYTABLE: Array<{ match: SymbolId | "any-cherry"; mult: number; note: string }> = [
  { match: "seven", mult: 80, note: "Three 7s" },
  { match: "wild", mult: 50, note: "Three WILDs" },
  { match: "bar", mult: 40, note: "Three BARs" },
  { match: "bell", mult: 25, note: "Three Bells" },
  { match: "plum", mult: 15, note: "Three Plums" },
  { match: "orange", mult: 12, note: "Three Oranges" },
  { match: "lemon", mult: 10, note: "Three Lemons" },
  { match: "cherry", mult: 8, note: "Three Cherries" },
  { match: "any-cherry", mult: 2, note: "Any two Cherries (left-aligned)" },
];

export type SlotsPhase = "idle" | "spinning" | "result";

export type SlotsState = {
  chips: number;
  bet: number;
  phase: SlotsPhase;
  reels: [SymbolId, SymbolId, SymbolId];
  lastWin: number;
  message: string;
  spinCount: number;
};

const BAG: SymbolId[] = SYMBOLS.flatMap((s) => Array.from({ length: WEIGHTS[s] }, () => s));

function drawSymbol(): SymbolId {
  return BAG[Math.floor(Math.random() * BAG.length)]!;
}

export function startSlots(chips = 1000): SlotsState {
  return {
    chips,
    bet: 10,
    phase: "idle",
    reels: ["cherry", "lemon", "orange"],
    lastWin: 0,
    message: "Set bet, then spin. One payline across three reels.",
    spinCount: 0,
  };
}

export function setBet(state: SlotsState, bet: number): SlotsState {
  if (state.phase === "spinning") return state;
  const next = Math.max(1, Math.min(100, Math.floor(bet)));
  return { ...state, bet: next };
}

function lineMult(reels: [SymbolId, SymbolId, SymbolId]): { mult: number; note: string } {
  const [a, b, c] = reels;
  const isWild = (s: SymbolId) => s === "wild";

  if (a === "wild" && b === "wild" && c === "wild") {
    return { mult: 50, note: "Three WILDs" };
  }

  // Resolve best three-of-a-kind with wilds as substitute
  const candidates: SymbolId[] = ["seven", "bar", "bell", "plum", "orange", "lemon", "cherry"];
  for (const sym of candidates) {
    const ok = [a, b, c].every((s) => s === sym || isWild(s));
    if (!ok) continue;
    const row = PAYTABLE.find((p) => p.match === sym);
    if (row) return { mult: row.mult, note: row.note };
  }

  // Two cherries from the left (wild counts as cherry)
  const cherryish = (s: SymbolId) => s === "cherry" || isWild(s);
  if (cherryish(a) && cherryish(b)) {
    return { mult: 2, note: "Two Cherries" };
  }

  return { mult: 0, note: "No win" };
}

export function beginSpin(state: SlotsState): SlotsState {
  if (state.phase === "spinning") return state;
  if (state.chips < state.bet) return { ...state, message: "Not enough chips." };
  const reels: [SymbolId, SymbolId, SymbolId] = [drawSymbol(), drawSymbol(), drawSymbol()];
  return {
    ...state,
    chips: state.chips - state.bet,
    phase: "spinning",
    reels,
    lastWin: 0,
    message: "Reels spinning…",
    spinCount: state.spinCount + 1,
  };
}

export function finishSpin(state: SlotsState): SlotsState {
  if (state.phase !== "spinning") return state;
  const { mult, note } = lineMult(state.reels);
  const win = state.bet * mult;
  return {
    ...state,
    phase: "result",
    chips: state.chips + win,
    lastWin: win,
    message: win > 0 ? `${note} — win ${win}` : "No win. Try again.",
  };
}

export function ackResult(state: SlotsState): SlotsState {
  if (state.phase !== "result") return state;
  return { ...state, phase: "idle" };
}

export function resetSlots(chips = 1000): SlotsState {
  return startSlots(chips);
}
