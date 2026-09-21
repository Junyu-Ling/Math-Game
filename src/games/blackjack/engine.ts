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
    message: "下注后发牌。目标 21，不超过。",
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
    return { ...state, message: "筹码不足。" };
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
    next.message = "Blackjack。赔付 3:2。";
    next.hands = next.hands.map((h) => ({ ...h, stood: true }));
    return next;
  }
  next.phase = "player";
  next.message = "要牌、停牌、加倍；对子可分牌。";
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
  let next: BjState = { ...pulled.state, hands, message: total > 21 ? "爆牌。" : `当前 ${total}` };
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
  if (!hand || hand.cards.length !== 2 || state.chips < hand.bet) return { ...state, message: "无法加倍。" };
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
  if (va !== vb || state.chips < hand.bet) return { ...state, message: "无法分牌。" };
  let next: BjState = { ...state, chips: state.chips - hand.bet };
  let c1: BjCard;
  let c2: BjCard;
  ({ state: next, card: c1 } = draw(next));
  ({ state: next, card: c2 } = draw(next));
  const left: Hand = { cards: [a, c1], bet: hand.bet, stood: false, doubled: false };
  const right: Hand = { cards: [b, c2], bet: hand.bet, stood: false, doubled: false };
  const hands = [...state.hands];
  hands.splice(state.active, 1, left, right);
  return { ...next, hands, chips: next.chips, active: state.active, phase: "player", message: "已分牌。" };
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
      notes.push("玩家爆，输。");
    } else if (bj && !dealerBj) {
      chips += Math.floor(hand.bet * 2.5);
      notes.push("Blackjack 赢。");
    } else if (dealerTotal > 21 || t > dealerTotal) {
      chips += hand.bet * 2;
      notes.push(`赢 ${hand.bet}。`);
    } else if (t === dealerTotal) {
      chips += hand.bet;
      notes.push("平局，退注。");
    } else notes.push("庄家较大，输。");
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
    message: "再下一注。",
  };
}

export function suitGlyph(suit: Suit): string {
  return { S: "♠", H: "♥", D: "♦", C: "♣" }[suit];
}

export function isRed(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}
