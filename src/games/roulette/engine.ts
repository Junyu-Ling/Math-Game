/** European single-zero roulette (0–36). Payouts are net odds: win returns stake + stake×odds. */

export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9,
  22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type PocketColor = "green" | "red" | "black";

export function pocketColor(n: number): PocketColor {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

/**
 * House net odds for a bet that covers `n` pockets on a European wheel.
 * Pays as 36 numbers (0 is the edge): profit = stake × (⌊36/n⌋ − 1),
 * and a win returns stake + profit.
 */
export function houseOdds(cover: number): number {
  if (cover < 1) return 0;
  return Math.max(0, Math.floor(36 / cover) - 1);
}

export type BetKind =
  | "straight"
  | "split"
  | "street"
  | "corner"
  | "sixline"
  | "column"
  | "dozen"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high";

export type Bet = {
  id: string;
  kind: BetKind;
  /** Covered numbers (empty for color / parity / range — resolved at settle). */
  numbers: number[];
  /** column 1|2|3 or dozen 1|2|3 when kind is column/dozen. */
  index?: 1 | 2 | 3;
  stake: number;
};

export type Phase = "bet" | "spinning" | "result";

export type RouletteState = {
  chips: number;
  bets: Bet[];
  chipSize: number;
  phase: Phase;
  /** Winning pocket after spin. */
  result: number | null;
  /** Cumulative wheel rotation degrees for CSS. */
  wheelDeg: number;
  lastWin: number;
  message: string;
  history: number[];
};

let betSeq = 0;
function betId() {
  betSeq += 1;
  return `b${betSeq}`;
}

export function startRoulette(chips = 1000): RouletteState {
  return {
    chips,
    bets: [],
    chipSize: 10,
    phase: "bet",
    result: null,
    wheelDeg: 0,
    lastWin: 0,
    message: "One bet per spin. Pick a number or an outside box — the house sets the payout.",
    history: [],
  };
}

export function setChipSize(state: RouletteState, size: number): RouletteState {
  if (state.phase !== "bet") return state;
  const chipSize = [1, 5, 10, 25, 50, 100].includes(size) ? size : state.chipSize;
  return { ...state, chipSize };
}

function adjacent(a: number, b: number): boolean {
  if (a === 0 || b === 0) {
    return (a === 0 && (b === 1 || b === 2 || b === 3)) || (b === 0 && (a === 1 || a === 2 || a === 3));
  }
  const [lo, hi] = a < b ? [a, b] : [b, a];
  if (hi - lo === 3) return true; // vertical on table (same column, next row)
  if (hi - lo === 1) {
    // horizontal: same street (row of 3)
    return Math.ceil(lo / 3) === Math.ceil(hi / 3);
  }
  return false;
}

export function streetOf(n: number): number[] | null {
  if (n < 1 || n > 36) return null;
  const base = Math.floor((n - 1) / 3) * 3 + 1;
  return [base, base + 1, base + 2];
}

function validCorner(nums: number[]): boolean {
  if (nums.length !== 4) return false;
  const s = [...nums].sort((a, b) => a - b);
  const [a, b, c, d] = s;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return false;
  return b === a + 1 && c === a + 3 && d === a + 4 && Math.ceil(a / 3) === Math.ceil(b / 3);
}

function validSixline(nums: number[]): boolean {
  if (nums.length !== 6) return false;
  const s = [...nums].sort((a, b) => a - b);
  const first = s[0]!;
  if (first < 1 || first > 31 || (first - 1) % 3 !== 0) return false;
  const expect = [first, first + 1, first + 2, first + 3, first + 4, first + 5];
  return expect.every((n, i) => s[i] === n);
}

export function coveredNumbers(bet: Bet): number[] {
  if (bet.numbers.length) return bet.numbers;
  if (bet.kind === "column" && bet.index) {
    return Array.from({ length: 12 }, (_, i) => i * 3 + bet.index!);
  }
  if (bet.kind === "dozen" && bet.index) {
    const start = (bet.index - 1) * 12 + 1;
    return Array.from({ length: 12 }, (_, i) => start + i);
  }
  if (bet.kind === "red") return [...RED_NUMBERS];
  if (bet.kind === "black") {
    return Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => !RED_NUMBERS.has(n));
  }
  if (bet.kind === "odd") return Array.from({ length: 18 }, (_, i) => i * 2 + 1);
  if (bet.kind === "even") return Array.from({ length: 18 }, (_, i) => (i + 1) * 2);
  if (bet.kind === "low") return Array.from({ length: 18 }, (_, i) => i + 1);
  if (bet.kind === "high") return Array.from({ length: 18 }, (_, i) => i + 19);
  return [];
}

export function oddsForBet(bet: Bet): number {
  return houseOdds(coveredNumbers(bet).length);
}

export function totalStake(state: RouletteState): number {
  return state.bets.reduce((s, b) => s + b.stake, 0);
}

export function placeBet(
  state: RouletteState,
  kind: BetKind,
  opts: { numbers?: number[]; index?: 1 | 2 | 3 } = {},
): RouletteState {
  if (state.phase !== "bet") return state;
  const stake = state.chipSize;
  const bank = state.chips + totalStake(state);
  if (stake <= 0 || bank < stake) {
    return { ...state, message: "Not enough chips." };
  }

  let numbers = opts.numbers ? [...new Set(opts.numbers)].sort((a, b) => a - b) : [];
  let index = opts.index;

  if (kind === "straight") {
    if (numbers.length !== 1 || numbers[0]! < 0 || numbers[0]! > 36) {
      return { ...state, message: "Pick a single number 0–36." };
    }
  } else if (kind === "split") {
    if (numbers.length !== 2 || !adjacent(numbers[0]!, numbers[1]!)) {
      return { ...state, message: "Split needs two adjacent numbers." };
    }
  } else if (kind === "street") {
    const st = numbers.length === 1 ? streetOf(numbers[0]!) : numbers.length === 3 ? numbers : null;
    if (!st || st.join() !== [...st].sort((a, b) => a - b).join()) {
      return { ...state, message: "Street needs a row of three." };
    }
    numbers = st;
  } else if (kind === "corner") {
    if (!validCorner(numbers)) return { ...state, message: "Corner needs four numbers in a square." };
  } else if (kind === "sixline") {
    if (!validSixline(numbers)) return { ...state, message: "Six line needs two adjacent streets." };
  } else if (kind === "column" || kind === "dozen") {
    if (!index || index < 1 || index > 3) return { ...state, message: "Pick column or dozen 1–3." };
    numbers = [];
  } else {
    numbers = [];
  }

  const bet: Bet = { id: betId(), kind, numbers, index, stake };
  const odds = oddsForBet(bet);
  const replaced = state.bets.length > 0;
  return {
    ...state,
    chips: bank - stake,
    bets: [bet],
    message: replaced
      ? `One bet: ${stake} on ${labelBet(bet)}. Previous stake returned.`
      : `One bet: ${stake} on ${labelBet(bet)}. House pays ${odds}:1.`,
  };
}

export function clearBets(state: RouletteState): RouletteState {
  if (state.phase !== "bet" || !state.bets.length) return state;
  const refund = totalStake(state);
  return {
    ...state,
    chips: state.chips + refund,
    bets: [],
    message: "Bets cleared.",
  };
}

export function undoBet(state: RouletteState): RouletteState {
  if (state.phase !== "bet" || !state.bets.length) return state;
  const last = state.bets[state.bets.length - 1]!;
  return {
    ...state,
    chips: state.chips + last.stake,
    bets: state.bets.slice(0, -1),
    message: "Last bet removed.",
  };
}

export function labelBet(bet: Bet): string {
  const odds = `${oddsForBet(bet)}:1`;
  if (bet.kind === "straight") return `${bet.numbers[0]} (${odds})`;
  if (bet.kind === "split") return `Split ${bet.numbers.join("-")} (${odds})`;
  if (bet.kind === "street") return `Street ${bet.numbers[0]}-${bet.numbers[2]} (${odds})`;
  if (bet.kind === "corner") return `Corner ${bet.numbers[0]} (${odds})`;
  if (bet.kind === "sixline") return `Six line ${bet.numbers[0]}-${bet.numbers[5]} (${odds})`;
  if (bet.kind === "column") return `Column ${bet.index} (${odds})`;
  if (bet.kind === "dozen") return `Dozen ${bet.index} (${odds})`;
  if (bet.kind === "red") return `Red (${odds})`;
  if (bet.kind === "black") return `Black (${odds})`;
  if (bet.kind === "odd") return `Odd (${odds})`;
  if (bet.kind === "even") return `Even (${odds})`;
  if (bet.kind === "low") return `1–18 (${odds})`;
  if (bet.kind === "high") return `19–36 (${odds})`;
  return `${bet.kind} (${odds})`;
}

function betWins(bet: Bet, result: number): boolean {
  // European: 0 loses all even-money outside bets; inside bets that include 0 can win.
  const evenMoney = ["red", "black", "odd", "even", "low", "high"].includes(bet.kind);
  if (result === 0 && evenMoney) return false;
  return coveredNumbers(bet).includes(result);
}

export function settleBets(bets: Bet[], result: number): { win: number; details: string[] } {
  let win = 0;
  const details: string[] = [];
  for (const bet of bets) {
    if (!betWins(bet, result)) continue;
    const odds = oddsForBet(bet);
    const payout = bet.stake * (odds + 1);
    win += payout;
    details.push(`${labelBet(bet)} → +${payout}`);
  }
  return { win, details };
}

/** Degrees per pocket (clockwise wheel). Pocket 0 is centered on the top pointer. */
export const POCKET_DEG = 360 / WHEEL_ORDER.length;

export function indexOnWheel(n: number): number {
  return WHEEL_ORDER.indexOf(n as (typeof WHEEL_ORDER)[number]);
}

/**
 * CSS `rotate` degrees (clockwise, in [0, 360)) that park the center of pocket
 * `index` under the top pointer.
 *
 * Wedges and labels are drawn clockwise from 12 o'clock: pocket `i` sits at
 * `i * POCKET_DEG`. Positive CSS rotation is clockwise, so the wheel must turn
 * the other way by that amount.
 */
export function rotationForPocket(index: number): number {
  const clockwiseFromTop = index * POCKET_DEG;
  return (360 - (clockwiseFromTop % 360) + 360) % 360;
}

/**
 * Next cumulative wheel angle. Always spins clockwise by `extraTurns` full
 * revolutions plus the shortest forward delta onto `rotationForPocket(index)`,
 * so a later spin is measured from the current angle instead of from 0.
 */
export function wheelDegForPocket(currentDeg: number, index: number, extraTurns: number): number {
  const landing = rotationForPocket(index);
  const current = ((currentDeg % 360) + 360) % 360;
  const delta = (landing - current + 360) % 360;
  return currentDeg + extraTurns * 360 + delta;
}

/**
 * Begin spin. `result` optional (tests); otherwise uniform 0–36.
 * Returns spinning state; call `finishSpin` after animation.
 */
export function beginSpin(state: RouletteState, result?: number): RouletteState {
  if (state.phase !== "bet") return state;
  if (!state.bets.length) return { ...state, message: "Place your one bet first." };
  const pocket =
    result !== undefined && result >= 0 && result <= 36
      ? result
      : WHEEL_ORDER[Math.floor(Math.random() * WHEEL_ORDER.length)]!;
  const idx = indexOnWheel(pocket);
  const extraTurns = 4 + Math.floor(Math.random() * 3);
  return {
    ...state,
    phase: "spinning",
    result: pocket,
    wheelDeg: wheelDegForPocket(state.wheelDeg, idx, extraTurns),
    message: "Ball in play…",
  };
}

export function finishSpin(state: RouletteState): RouletteState {
  if (state.phase !== "spinning" || state.result === null) return state;
  const { win, details } = settleBets(state.bets, state.result);
  const color = pocketColor(state.result);
  const msg =
    win > 0
      ? `${state.result} ${color}. You win ${win}. ${details.slice(0, 3).join(" · ")}`
      : `${state.result} ${color}. No win.`;
  return {
    ...state,
    phase: "result",
    chips: state.chips + win,
    lastWin: win,
    bets: [],
    history: [state.result, ...state.history].slice(0, 12),
    message: msg,
  };
}

export function nextRound(state: RouletteState): RouletteState {
  if (state.phase !== "result") return state;
  return {
    ...state,
    phase: "bet",
    result: null,
    lastWin: 0,
    message: state.chips > 0 ? "One bet per spin. The house sets the payout." : "Out of chips — reset practice stack.",
  };
}

export function resetStack(_state: RouletteState, chips = 1000): RouletteState {
  return startRoulette(chips);
}

/** Corner whose top-left (lowest) number is `lo` on the standard layout. */
export function cornerFromLow(lo: number): number[] | null {
  if (lo < 1 || lo > 32) return null;
  if (lo % 3 === 0) return null; // right edge of a street
  const nums = [lo, lo + 1, lo + 3, lo + 4];
  return validCorner(nums) ? nums : null;
}

/** Six-line starting at street beginning `lo` (1,4,7,…). */
export function sixlineFromLow(lo: number): number[] | null {
  if (lo < 1 || lo > 31 || (lo - 1) % 3 !== 0) return null;
  const nums = [lo, lo + 1, lo + 2, lo + 3, lo + 4, lo + 5];
  return validSixline(nums) ? nums : null;
}
