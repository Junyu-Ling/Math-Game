import { shuffle, uid } from "../../lib/shuffle";

export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export type BjCard = { id: string; suit: Suit; rank: Rank; hidden?: boolean };

export type Hand = {
  cards: BjCard[];
  bet: number;
  stood: boolean;
  doubled: boolean;
};

export type BjPhase = "bet" | "player" | "dealer" | "settle";

export type BjState = {
  deck: BjCard[];
  dealer: BjCard[];
  hands: Hand[];
  active: number;
  chips: number;
  bet: number;
  phase: BjPhase;
  message: string;
};

const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const suits: Suit[] = ["S", "H", "D", "C"];

export function freshShoe(n = 4): BjCard[] {
  const cards: BjCard[] = [];
  for (let i = 0; i < n; i++) {
    for (const suit of suits) for (const rank of ranks) cards.push({ id: uid("b"), suit, rank });
  }
  return shuffle(cards);
}

export function startBj(chips: number): BjState {
  return {
    deck: freshShoe(),
    dealer: [],
    hands: [],
    active: 0,
    chips,
    bet: 50,
    phase: "bet",
    message: "Bet, then deal. Get close to 21 without going over.",
  };
}

function draw(state: BjState): { state: BjState; card: BjCard } {
  let deck = state.deck;
  if (deck.length < 20) deck = [...deck, ...freshShoe(2)];
  const card = deck[0];
  if (!card) throw new Error("deck");
  return { state: { ...state, deck: deck.slice(1) }, card };
}

export function hardSoft(cards: BjCard[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.hidden) continue;
    if (c.rank === "A") {
      aces += 1;
      total += 11;
    } else if (c.rank === "K" || c.rank === "Q" || c.rank === "J" || c.rank === "10") {
      total += 10;
    } else total += Number(c.rank);
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
    if (aces === 0) soft = false;
  }
  return { total, soft };
}

export function isBlackjack(cards: BjCard[]): boolean {
  return cards.length === 2 && hardSoft(cards).total === 21;
}

export function deal(state: BjState): BjState {
  if (state.phase !== "bet") return state;
  if (state.chips < state.bet || state.bet <= 0) {
    return { ...state, message: "Not enough chips." };
  }
  let next: BjState = { ...state, chips: state.chips - state.bet, dealer: [], hands: [] };
  const player: BjCard[] = [];
  const dealer: BjCard[] = [];
  let card: BjCard;
  ({ state: next, card } = draw(next));
  player.push(card);
  ({ state: next, card } = draw(next));
  dealer.push(card);
  ({ state: next, card } = draw(next));
  player.push(card);
  ({ state: next, card } = draw(next));
  dealer.push({ ...card, hidden: true });
  next.dealer = dealer;
  next.hands = [{ cards: player, bet: state.bet, stood: false, doubled: false }];
  next.active = 0;
  if (isBlackjack(player) && isBlackjack([dealer[0]!, { ...dealer[1]!, hidden: false }])) {
    return settle({ ...next, dealer: next.dealer.map((c) => ({ ...c, hidden: false })), phase: "settle" });
  }
  if (isBlackjack(player)) {
    next.chips += Math.floor(state.bet * 2.5);
    next.dealer = next.dealer.map((c) => ({ ...c, hidden: false }));
    next.phase = "settle";
    next.message = "Blackjack. Pays 3:2.";
    next.hands = next.hands.map((h) => ({ ...h, stood: true }));
    return next;
  }
  next.phase = "player";
  next.message = "Hit, stand, or double. Split pairs if you can.";
  return next;
}

function handDone(h: Hand): boolean {
  return h.stood || hardSoft(h.cards).total >= 21;
}

function nextHand(state: BjState): BjState {
  const idx = state.hands.findIndex((h, i) => i > state.active && !handDone(h));
  if (idx >= 0) return { ...state, active: idx, phase: "player" };
  if (state.hands.every(handDone)) return playDealer(state);
  return state;
}

export function hit(state: BjState): BjState {
  if (state.phase !== "player") return state;
  const hand = state.hands[state.active];
  if (!hand || handDone(hand)) return nextHand(state);
  const pulled = draw(state);
  const cards = [...hand.cards, pulled.card];
  const hands = state.hands.map((h, i) => (i === state.active ? { ...h, cards, stood: hardSoft(cards).total >= 21 } : h));
  const total = hardSoft(cards).total;
  let next: BjState = { ...pulled.state, hands, message: total > 21 ? "Bust." : `Total ${total}` };
  if (hands[state.active] && handDone(hands[state.active]!)) return nextHand(next);
  return next;
}

export function stand(state: BjState): BjState {
  if (state.phase !== "player") return state;
  const hands = state.hands.map((h, i) => (i === state.active ? { ...h, stood: true } : h));
  return nextHand({ ...state, hands });
}

export function doubleDown(state: BjState): BjState {
  if (state.phase !== "player") return state;
  const hand = state.hands[state.active];
  if (!hand || hand.cards.length !== 2 || state.chips < hand.bet) return { ...state, message: "Cannot double." };
  let next: BjState = { ...state, chips: state.chips - hand.bet };
  const pulled = draw(next);
  const cards = [...hand.cards, pulled.card];
  const hands = pulled.state.hands.map((h, i) =>
    i === state.active ? { ...h, cards, bet: h.bet * 2, doubled: true, stood: true } : h,
  );
  return nextHand({ ...pulled.state, chips: next.chips, hands });
}

export function split(state: BjState): BjState {
  if (state.phase !== "player") return state;
  const hand = state.hands[state.active];
  if (!hand || hand.cards.length !== 2) return state;
  const [a, b] = hand.cards;
  if (!a || !b) return state;
  const va = hardSoft([a]).total;
  const vb = hardSoft([b]).total;
  if (va !== vb || state.chips < hand.bet) return { ...state, message: "Cannot split." };
  let next: BjState = { ...state, chips: state.chips - hand.bet };
  let c1: BjCard;
  let c2: BjCard;
  ({ state: next, card: c1 } = draw(next));
  ({ state: next, card: c2 } = draw(next));
  const left: Hand = { cards: [a, c1], bet: hand.bet, stood: false, doubled: false };
  const right: Hand = { cards: [b, c2], bet: hand.bet, stood: false, doubled: false };
  const hands = [...state.hands];
  hands.splice(state.active, 1, left, right);
  return { ...next, hands, chips: next.chips, active: state.active, phase: "player", message: "Split." };
}

function playDealer(state: BjState): BjState {
  let next: BjState = { ...state, dealer: state.dealer.map((c) => ({ ...c, hidden: false })), phase: "dealer" };
  let total = hardSoft(next.dealer).total;
  while (total < 17) {
    const pulled = draw(next);
    next = { ...pulled.state, dealer: [...pulled.state.dealer, pulled.card] };
    total = hardSoft(next.dealer).total;
  }
  return settle({ ...next, phase: "settle" });
}

function settle(state: BjState): BjState {
  const dealerTotal = hardSoft(state.dealer).total;
  const dealerBj = isBlackjack(state.dealer);
  let chips = state.chips;
  const notes: string[] = [];
  for (const hand of state.hands) {
    const t = hardSoft(hand.cards).total;
    const bj = isBlackjack(hand.cards) && state.hands.length === 1;
    if (t > 21) {
      notes.push("Player busts. Loss.");
    } else if (bj && !dealerBj) {
      chips += Math.floor(hand.bet * 2.5);
      notes.push("Blackjack win.");
    } else if (dealerTotal > 21 || t > dealerTotal) {
      chips += hand.bet * 2;
      notes.push(`Win ${hand.bet}.`);
    } else if (t === dealerTotal) {
      chips += hand.bet;
      notes.push("Push. Bet returned.");
    } else notes.push("Dealer is higher. Loss.");
  }
  return { ...state, chips, phase: "settle", message: notes.join(" ") };
}

export function nextRound(state: BjState): BjState {
  return {
    ...state,
    dealer: [],
    hands: [],
    active: 0,
    phase: "bet",
    message: "Place another bet.",
  };
}

export type BjDuelPlayer = {
  id: string;
  name: string;
  cards: BjCard[];
  stood: boolean;
};

export type BjDuelState = {
  mode: "duel";
  players: BjDuelPlayer[];
  deck: BjCard[];
  turn: number;
  phase: "play" | "over";
  winnerId: string | null;
  message: string;
};

function emptySeat(p: { id: string; name: string }): BjDuelPlayer {
  return { id: p.id, name: p.name, cards: [], stood: false };
}

export function startBjDuel(a: { id: string; name: string }, b: { id: string; name: string }): BjDuelState {
  let deck = freshShoe(2);
  const take = (): BjCard => {
    const card = deck[0]!;
    deck = deck.slice(1);
    return card;
  };
  const pa = emptySeat(a);
  const pb = emptySeat(b);
  pa.cards = [take(), take()];
  pb.cards = [take(), take()];
  return {
    mode: "duel",
    players: [pa, pb],
    deck,
    turn: 0,
    phase: "play",
    winnerId: null,
    message: `${a.name} acts first. Closest to 21 without going over.`,
  };
}

function settleDuel(state: BjDuelState): BjDuelState {
  const [a, b] = state.players;
  if (!a || !b) return state;
  const ta = hardSoft(a.cards).total;
  const tb = hardSoft(b.cards).total;
  const ba = ta > 21;
  const bb = tb > 21;
  let winnerId: string | null = null;
  let message = "";
  if (ba && bb) {
    message = "Both bust. Push.";
  } else if (ba) {
    winnerId = b.id;
    message = `${a.name} busts. ${b.name} wins.`;
  } else if (bb) {
    winnerId = a.id;
    message = `${b.name} busts. ${a.name} wins.`;
  } else if (ta > tb) {
    winnerId = a.id;
    message = `${a.name} ${ta} vs ${tb} wins.`;
  } else if (tb > ta) {
    winnerId = b.id;
    message = `${b.name} ${tb} vs ${ta} wins.`;
  } else message = `${ta} push.`;
  return { ...state, phase: "over", winnerId, message };
}

export type BjDuelAction = { type: "hit" } | { type: "stand" };

export function startBjPractice(): BjDuelState {
  return startBjDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU" });
}

export function aiBjAction(state: BjDuelState): BjDuelAction {
  const me = state.players[state.turn];
  if (!me) return { type: "stand" };
  return hardSoft(me.cards).total < 17 ? { type: "hit" } : { type: "stand" };
}

export function applyBjDuelAction(state: BjDuelState, actorId: string, action: BjDuelAction): BjDuelState {
  if (state.phase !== "play") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId || me.stood) return state;
  let players = state.players;
  let deck = state.deck;
  if (action.type === "hit") {
    if (!deck[0]) return state;
    const card = deck[0];
    deck = deck.slice(1);
    const cards = [...me.cards, card];
    const total = hardSoft(cards).total;
    const stood = total >= 21;
    players = players.map((p) => (p.id === me.id ? { ...p, cards, stood } : p));
    let next: BjDuelState = {
      ...state,
      players,
      deck,
      message: total > 21 ? `${me.name} busts.` : `${me.name} ${total}`,
    };
    if (stood && players.every((p) => p.stood)) return settleDuel(next);
    if (stood) {
      const other = (state.turn + 1) % players.length;
      return { ...next, turn: other };
    }
    return next;
  }
  players = players.map((p) => (p.id === me.id ? { ...p, stood: true } : p));
  const next: BjDuelState = { ...state, players, message: `${me.name} stands.` };
  if (players.every((p) => p.stood)) return settleDuel(next);
  return { ...next, turn: (state.turn + 1) % players.length };
}

export function viewBjDuel(state: BjDuelState, viewerId: string): BjDuelState {
  const showAll = state.phase === "over";
  return {
    ...state,
    deck: [],
    players: state.players.map((p) => {
      if (p.id === viewerId || showAll || p.stood) return p;
      return {
        ...p,
        cards: p.cards.map((c, i) => (i === 0 ? c : { ...c, hidden: true })),
      };
    }),
  };
}

export function suitGlyph(suit: Suit): string {
  return { S: "♠", H: "♥", D: "♦", C: "♣" }[suit];
}

export function isRed(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}
