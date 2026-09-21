import { holdemRank, makeDeck, type PokerCard } from "../../lib/poker";
import { uid } from "../../lib/shuffle";

export type Seat = { id: string; name: string; chips: number; bet: number; hole: PokerCard[]; folded: boolean; allIn: boolean };
export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "over";

export type HoldemState = {
  id: string;
  players: [Seat, Seat];
  dealer: 0 | 1;
  deck: PokerCard[];
  community: PokerCard[];
  pot: number;
  street: Street;
  turn: 0 | 1;
  currentBet: number;
  lastRaise: number;
  toAct: number;
  winnerId: string | null;
  message: string;
  bb: number;
};

export type HoldemAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; amount: number }
  | { type: "allin" }
  | { type: "next" };

const SB = 5;
const BB = 10;

function other(i: 0 | 1): 0 | 1 {
  return i === 0 ? 1 : 0;
}

function idxOf(s: HoldemState, id: string): 0 | 1 {
  const i = s.players.findIndex((p) => p.id === id);
  if (i < 0) throw new Error("Not seated");
  return i as 0 | 1;
}

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      const item = arr[i];
      if (item === undefined) continue;
      cur.push(item);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return out;
}

function score5(cards: PokerCard[]): number {
  const ranks = cards.map((c) => holdemRank(c.rank)).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(ranks)];
  let straight = false;
  let high = ranks[0] ?? 0;
  if (uniq.length === 5) {
    const u0 = uniq[0] ?? 0;
    const u4 = uniq[4] ?? 0;
    if (u0 - u4 === 4) {
      straight = true;
      high = u0;
    } else if (u0 === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) {
      straight = true;
      high = 5;
    }
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const g0 = groups[0];
  const g1 = groups[1];
  const g2 = groups[2];
  const kick = (n: number[]) => n.reduce((acc, v, i) => acc + v * 15 ** (4 - i), 0);
  if (straight && flush) return (ranks.includes(14) && high === 14 ? 9 : 8) * 15 ** 5 + high;
  if (g0 && g0[1] === 4 && g1) return 7 * 15 ** 5 + kick([g0[0], g1[0]]);
  if (g0 && g1 && g0[1] === 3 && g1[1] === 2) return 6 * 15 ** 5 + kick([g0[0], g1[0]]);
  if (flush) return 5 * 15 ** 5 + kick(ranks);
  if (straight) return 4 * 15 ** 5 + high;
  if (g0 && g0[1] === 3) return 3 * 15 ** 5 + kick([g0[0], ...groups.slice(1).map((g) => g[0])]);
  if (g0 && g1 && g0[1] === 2 && g1[1] === 2) {
    const pairA = Math.max(g0[0], g1[0]);
    const pairB = Math.min(g0[0], g1[0]);
    return 2 * 15 ** 5 + kick([pairA, pairB, g2 ? g2[0] : 0]);
  }
  if (g0 && g0[1] === 2) return 1 * 15 ** 5 + kick([g0[0], ...groups.slice(1).map((g) => g[0])]);
  return kick(ranks);
}

export function bestHand(hole: PokerCard[], board: PokerCard[]): number {
  const all = [...hole, ...board];
  if (all.length < 5) return 0;
  return Math.max(...combos(all, 5).map(score5));
}

function post(s: HoldemState, i: 0 | 1, amt: number) {
  const p = s.players[i];
  const n = Math.min(amt, p.chips);
  p.chips -= n;
  p.bet += n;
  s.pot += n;
  if (p.chips === 0) p.allIn = true;
}

function dealHand(s: HoldemState) {
  s.deck = makeDeck();
  s.community = [];
  s.pot = 0;
  s.street = "preflop";
  s.winnerId = null;
  s.currentBet = BB;
  s.lastRaise = BB;
  for (const p of s.players) {
    p.bet = 0;
    p.folded = false;
    p.allIn = false;
    p.hole = [s.deck.pop()!, s.deck.pop()!];
  }
  const sb = s.dealer;
  const bb = other(sb);
  post(s, sb, SB);
  post(s, bb, BB);
  s.turn = sb;
  s.toAct = 2;
  s.message = "Preflop. Small blind acts.";
}

export function startHoldemDuel(a: { id: string; name: string }, b: { id: string; name: string }): HoldemState {
  const s: HoldemState = {
    id: uid("he"),
    players: [
      { id: a.id, name: a.name, chips: 1000, bet: 0, hole: [], folded: false, allIn: false },
      { id: b.id, name: b.name, chips: 1000, bet: 0, hole: [], folded: false, allIn: false },
    ],
    dealer: 0,
    deck: [],
    community: [],
    pot: 0,
    street: "preflop",
    turn: 0,
    currentBet: 0,
    lastRaise: 0,
    toAct: 0,
    winnerId: null,
    message: "",
    bb: BB,
  };
  dealHand(s);
  return s;
}

export function startHoldemPractice(): HoldemState {
  return startHoldemDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU" });
}

function nextStreet(s: HoldemState) {
  for (const p of s.players) p.bet = 0;
  s.currentBet = 0;
  s.lastRaise = BB;
  s.turn = other(s.dealer);
  s.toAct = s.players.filter((p) => !p.folded && !p.allIn).length;
  if (s.street === "preflop") {
    s.street = "flop";
    s.community.push(s.deck.pop()!, s.deck.pop()!, s.deck.pop()!);
    s.message = "Flop.";
  } else if (s.street === "flop") {
    s.street = "turn";
    s.community.push(s.deck.pop()!);
    s.message = "Turn.";
  } else if (s.street === "turn") {
    s.street = "river";
    s.community.push(s.deck.pop()!);
    s.message = "River.";
  } else {
    showdown(s);
  }
  if (s.players.every((p) => p.folded || p.allIn) && s.street !== "showdown" && s.street !== "over") {
    while (s.community.length < 5) s.community.push(s.deck.pop()!);
    showdown(s);
  }
}

function showdown(s: HoldemState) {
  s.street = "showdown";
  const live = s.players.filter((p) => !p.folded);
  if (live.length === 1) {
    const only = live[0];
    if (only) {
      only.chips += s.pot;
      s.winnerId = only.id;
      s.message = `${only.name} wins the pot.`;
    }
  } else {
    const scores = s.players.map((p) => (p.folded ? -1 : bestHand(p.hole, s.community)));
    if (scores[0] === scores[1]) {
      s.players[0].chips += Math.floor(s.pot / 2);
      s.players[1].chips += Math.ceil(s.pot / 2);
      s.winnerId = null;
      s.message = "Split pot.";
    } else {
      const w = (scores[0] ?? 0) > (scores[1] ?? 0) ? 0 : 1;
      const winner = s.players[w];
      if (winner) {
        winner.chips += s.pot;
        s.winnerId = winner.id;
        s.message = `${winner.name} wins the pot.`;
      }
    }
  }
  s.pot = 0;
  if (s.players.some((p) => p.chips <= 0)) {
    s.street = "over";
    const w = s.players[0].chips > s.players[1].chips ? s.players[0] : s.players[1];
    s.winnerId = w.id;
    s.message = `${w.name} takes the table.`;
  }
}

function afterAct(s: HoldemState) {
  const live = s.players.filter((p) => !p.folded);
  if (live.length === 1) {
    showdown(s);
    return;
  }
  s.toAct -= 1;
  if (s.toAct <= 0 && s.players.filter((p) => !p.folded && !p.allIn).every((p) => p.bet === s.currentBet || p.allIn)) {
    nextStreet(s);
    return;
  }
  let n = other(s.turn);
  for (let k = 0; k < 2; k++) {
    if (!s.players[n].folded && !s.players[n].allIn) {
      s.turn = n;
      return;
    }
    n = other(n);
  }
  nextStreet(s);
}

export function applyHoldemAction(s: HoldemState, playerId: string, action: HoldemAction): HoldemState {
  const next: HoldemState = structuredClone(s);
  if (action.type === "next") {
    if (next.street !== "showdown") return next;
    if (next.players.some((p) => p.chips <= 0)) {
      next.street = "over";
      return next;
    }
    next.dealer = other(next.dealer);
    dealHand(next);
    return next;
  }
  if (next.street === "showdown" || next.street === "over") return next;
  const i = idxOf(next, playerId);
  if (next.turn !== i) throw new Error("Not your turn");
  const p = next.players[i];
  const toCall = next.currentBet - p.bet;
  if (action.type === "fold") {
    p.folded = true;
    next.message = `${p.name} folds.`;
    afterAct(next);
    return next;
  }
  if (action.type === "check") {
    if (toCall > 0) throw new Error("Cannot check");
    next.message = `${p.name} checks.`;
    afterAct(next);
    return next;
  }
  if (action.type === "call") {
    if (toCall <= 0) throw new Error("Nothing to call");
    post(next, i, toCall);
    next.message = `${p.name} calls.`;
    afterAct(next);
    return next;
  }
  if (action.type === "raise") {
    const total = Math.max(action.amount, next.currentBet + next.lastRaise);
    const add = total - p.bet;
    if (add <= 0) throw new Error("Raise more");
    const before = next.currentBet;
    post(next, i, add);
    next.currentBet = p.bet;
    next.lastRaise = Math.max(BB, next.currentBet - before);
    next.toAct = next.players.filter((x) => !x.folded && !x.allIn).length;
    next.message = `${p.name} raises to ${p.bet}.`;
    afterAct(next);
    return next;
  }
  if (action.type === "allin") {
    const before = next.currentBet;
    post(next, i, p.chips);
    if (p.bet > next.currentBet) {
      next.lastRaise = Math.max(BB, p.bet - before);
      next.currentBet = p.bet;
      next.toAct = next.players.filter((x) => !x.folded && !x.allIn).length;
    }
    next.message = `${p.name} is all in.`;
    afterAct(next);
    return next;
  }
  return next;
}

export function viewHoldem(s: HoldemState, viewerId: string): HoldemState {
  const v = structuredClone(s);
  const show = v.street === "showdown" || v.street === "over";
  for (const p of v.players) {
    if (p.id !== viewerId && !show) p.hole = p.hole.map((c) => ({ ...c, hidden: true }));
  }
  return v;
}

export function holdemBotAct(s: HoldemState, botId: string): HoldemAction {
  const i = idxOf(s, botId);
  const p = s.players[i];
  const toCall = s.currentBet - p.bet;
  const score = bestHand(p.hole, s.community);
  if (toCall > 0 && score < 15 ** 5 && Math.random() < 0.35) return { type: "fold" };
  if (toCall > 0) return { type: "call" };
  if (score >= 2 * 15 ** 5 && p.chips > s.bb) return { type: "raise", amount: s.currentBet + Math.max(s.bb * 2, Math.floor(s.pot / 2)) };
  return { type: "check" };
}
