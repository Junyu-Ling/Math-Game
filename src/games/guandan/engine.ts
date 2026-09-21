import { makeGuandanDeck, type PokerCard, type Rank } from "../../lib/poker";
import { uid } from "../../lib/shuffle";

export type GdKind = "single" | "pair" | "triple" | "bomb" | "rocket";
export type GdPlay = { kind: GdKind; rank: number; cards: PokerCard[] };
export type GdSeat = { id: string; name: string; hand: PokerCard[] };

export type GuandanState = {
  id: string;
  phase: "lobby" | "play" | "over";
  players: GdSeat[];
  turn: number;
  last: GdPlay | null;
  lastSeat: number | null;
  passed: string[];
  finishers: string[];
  winnerTeam: 0 | 1 | null;
  message: string;
};

export type GuandanAction = { type: "play"; cards: PokerCard[] } | { type: "pass" };

export function teamOf(index: number): 0 | 1 {
  return index % 2 === 0 ? 0 : 1;
}

export function partnerIndex(index: number): number {
  return (index + 2) % 4;
}

function idxOf(s: GuandanState, id: string): number {
  const i = s.players.findIndex((p) => p.id === id);
  if (i < 0) throw new Error("Not seated");
  return i;
}

export function gdPower(card: PokerCard): number {
  if (card.rank === "RJ") return 17;
  if (card.rank === "BJ") return 16;
  if (card.rank === "2") return 15;
  if (card.rank === "A") return 14;
  if (card.rank === "K") return 13;
  if (card.rank === "Q") return 12;
  if (card.rank === "J") return 11;
  return Number(card.rank as Rank);
}

function parsePlay(cards: PokerCard[]): GdPlay {
  if (!cards.length) throw new Error("Select cards");
  const sorted = [...cards].sort((a, b) => gdPower(a) - gdPower(b) || a.suit.localeCompare(b.suit));
  const jokers = sorted.filter((c) => c.suit === "J");
  if (jokers.length === 2 && sorted.length === 2) return { kind: "rocket", rank: 20, cards: sorted };
  const powers = sorted.map(gdPower);
  const rank = powers[0] ?? 0;
  const allSame = powers.every((p) => p === rank);
  if (sorted.length === 1) return { kind: "single", rank, cards: sorted };
  if (sorted.length === 2 && allSame) return { kind: "pair", rank, cards: sorted };
  if (sorted.length === 3 && allSame) return { kind: "triple", rank, cards: sorted };
  if (sorted.length === 4 && allSame) return { kind: "bomb", rank, cards: sorted };
  throw new Error("Not a legal combo (single, pair, triple, bomb, or rocket)");
}

function beats(prev: GdPlay | null, next: GdPlay): boolean {
  if (!prev) return true;
  if (next.kind === "rocket") return true;
  if (prev.kind === "rocket") return false;
  if (next.kind === "bomb" && prev.kind !== "bomb") return true;
  if (next.kind !== prev.kind) return false;
  return next.rank > prev.rank;
}

function sortHand(hand: PokerCard[]) {
  return [...hand].sort((a, b) => gdPower(a) - gdPower(b) || a.suit.localeCompare(b.suit));
}

function finished(s: GuandanState, id: string) {
  return s.finishers.includes(id);
}

function nextAlive(s: GuandanState, from: number): number {
  for (let k = 1; k <= 4; k++) {
    const j = (from + k) % s.players.length;
    const p = s.players[j];
    if (p && !finished(s, p.id)) return j;
  }
  return from;
}

function teamWon(s: GuandanState, team: 0 | 1): boolean {
  const ids = s.players.filter((_, i) => teamOf(i) === team).map((p) => p.id);
  return ids.length === 2 && ids.every((id) => finished(s, id));
}

function checkOver(s: GuandanState) {
  if (teamWon(s, 0)) {
    s.phase = "over";
    s.winnerTeam = 0;
    s.message = `${s.players[0]?.name} & ${s.players[2]?.name} win.`;
    return;
  }
  if (teamWon(s, 1)) {
    s.phase = "over";
    s.winnerTeam = 1;
    s.message = `${s.players[1]?.name} & ${s.players[3]?.name} win.`;
  }
}

export function startGuandanLobby(people: Array<{ id: string; name: string }>): GuandanState {
  return {
    id: uid("gd"),
    phase: "lobby",
    players: people.map((p) => ({ id: p.id, name: p.name, hand: [] })),
    turn: 0,
    last: null,
    lastSeat: null,
    passed: [],
    finishers: [],
    winnerTeam: null,
    message: `Waiting for ${Math.max(0, 4 - people.length)} more. Four players, partners sit across.`,
  };
}

export function startGuandanTable(people: Array<{ id: string; name: string }>): GuandanState {
  if (people.length !== 4) throw new Error("Guandan needs four players");
  const deck = makeGuandanDeck();
  return {
    id: uid("gd"),
    phase: "play",
    players: people.map((p, i) => ({ id: p.id, name: p.name, hand: sortHand(deck.slice(i * 27, i * 27 + 27)) })),
    turn: 0,
    last: null,
    lastSeat: null,
    passed: [],
    finishers: [],
    winnerTeam: null,
    message: `${people[0]?.name} leads. Partners: ${people[0]?.name} & ${people[2]?.name} vs ${people[1]?.name} & ${people[3]?.name}.`,
  };
}

export function startGuandanPractice(): GuandanState {
  return startGuandanTable([
    { id: "you", name: "YOU" },
    { id: "cpu-e", name: "EAST" },
    { id: "cpu-n", name: "NORTH" },
    { id: "cpu-w", name: "WEST" },
  ]);
}

export function applyGuandanAction(s: GuandanState, playerId: string, action: GuandanAction): GuandanState {
  const next: GuandanState = structuredClone(s);
  if (next.phase !== "play") return next;
  const i = idxOf(next, playerId);
  if (next.turn !== i) throw new Error("Not your turn");
  const p = next.players[i];
  if (!p) throw new Error("Not seated");
  if (finished(next, p.id)) throw new Error("Already out");

  if (action.type === "pass") {
    if (!next.last || next.lastSeat === i) throw new Error("Lead cannot pass");
    next.passed = [...next.passed, p.id];
    const lastId = next.lastSeat != null ? next.players[next.lastSeat]?.id : null;
    const mustPass = next.players.filter((x) => !finished(next, x.id) && x.id !== lastId);
    if (mustPass.every((x) => next.passed.includes(x.id))) {
      const leader =
        lastId && finished(next, lastId) && next.lastSeat != null ? nextAlive(next, next.lastSeat) : (next.lastSeat ?? i);
      next.last = null;
      next.lastSeat = null;
      next.passed = [];
      next.turn = leader;
      next.message = `${p.name} passes. ${next.players[leader]?.name} leads.`;
    } else {
      next.turn = nextAlive(next, i);
      next.message = `${p.name} passes.`;
    }
    return next;
  }

  const ids = new Set(action.cards.map((c) => c.id));
  const taken = p.hand.filter((c) => ids.has(c.id));
  if (taken.length !== action.cards.length) throw new Error("Cards not in hand");
  const play = parsePlay(taken);
  if (!beats(next.last, play)) throw new Error("Does not beat last play");
  p.hand = sortHand(p.hand.filter((c) => !ids.has(c.id)));
  next.last = play;
  next.lastSeat = i;
  next.passed = [];
  next.message = `${p.name} plays ${play.kind}.`;
  if (p.hand.length === 0) {
    next.finishers = [...next.finishers, p.id];
    next.message = `${p.name} is out (${next.finishers.length}).`;
    checkOver(next);
  }
  if (next.phase === "play") next.turn = nextAlive(next, i);
  return next;
}

export function viewGuandan(s: GuandanState, viewerId: string): GuandanState {
  const v = structuredClone(s);
  const show = v.phase === "over";
  for (const p of v.players) {
    if (p.id !== viewerId && !show) p.hand = p.hand.map((c) => ({ ...c, hidden: true }));
  }
  return v;
}

function groups(hand: PokerCard[]) {
  const map = new Map<number, PokerCard[]>();
  for (const c of hand) {
    const k = gdPower(c);
    map.set(k, [...(map.get(k) || []), c]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export function guandanBotAct(s: GuandanState, botId: string): GuandanAction {
  const i = idxOf(s, botId);
  const hand = s.players[i]?.hand || [];
  const last = s.last;
  const gs = groups(hand);
  const tryKind = (kind: GdKind, n: number): PokerCard[] | null => {
    for (const [, cards] of gs) {
      if (cards.length < n) continue;
      const play = cards.slice(0, n);
      try {
        const parsed = parsePlay(play);
        if (parsed.kind === kind && beats(last, parsed)) return play;
      } catch {
        /* skip */
      }
    }
    return null;
  };
  if (!last) {
    const single = gs[0]?.[1]?.[0];
    if (single) return { type: "play", cards: [single] };
    return { type: "pass" };
  }
  if (last.kind === "single") {
    const c = tryKind("single", 1);
    if (c) return { type: "play", cards: c };
  } else if (last.kind === "pair") {
    const c = tryKind("pair", 2);
    if (c) return { type: "play", cards: c };
  } else if (last.kind === "triple") {
    const c = tryKind("triple", 3);
    if (c) return { type: "play", cards: c };
  }
  const bomb = tryKind("bomb", 4);
  if (bomb) return { type: "play", cards: bomb };
  const rockets = hand.filter((c) => c.suit === "J");
  if (rockets.length >= 2) return { type: "play", cards: rockets.slice(0, 2) };
  if (s.lastSeat !== i) return { type: "pass" };
  const fallback = gs[0]?.[1]?.[0];
  if (fallback) return { type: "play", cards: [fallback] };
  return { type: "pass" };
}
