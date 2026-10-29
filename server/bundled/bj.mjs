// src/lib/shuffle.ts
function shuffle(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = next[i];
    const b = next[j];
    if (a === void 0 || b === void 0) continue;
    next[i] = b;
    next[j] = a;
  }
  return next;
}
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/lib/poker.ts
var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
var SUITS = ["S", "H", "D", "C"];
function suitGlyph(suit) {
  return { S: "\u2660", H: "\u2665", D: "\u2666", C: "\u2663", J: "\u2605" }[suit];
}
function isRed(suit, rank) {
  if (suit === "J") return rank === "RJ";
  return suit === "H" || suit === "D";
}
function makeDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ id: uid("pk"), suit, rank });
  return shuffle(cards);
}
function makeShoe(n = 1) {
  return shuffle(Array.from({ length: n }, () => makeDeck()).flat());
}

// src/games/blackjack/engine.ts
function freshShoe(n = 4) {
  return makeShoe(n);
}
function startBj(chips) {
  return {
    deck: freshShoe(),
    dealer: [],
    hands: [],
    active: 0,
    chips,
    bet: 50,
    phase: "bet",
    message: "Bet, then deal. Get close to 21 without going over."
  };
}
function draw(state) {
  let deck = state.deck;
  if (deck.length < 20) deck = [...deck, ...freshShoe(2)];
  const card = deck[0];
  if (!card) throw new Error("deck");
  return { state: { ...state, deck: deck.slice(1) }, card };
}
function hardSoft(cards) {
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
function isBlackjack(cards) {
  return cards.length === 2 && hardSoft(cards).total === 21;
}
function deal(state) {
  if (state.phase !== "bet") return state;
  if (state.chips < state.bet || state.bet <= 0) {
    return { ...state, message: "Not enough chips." };
  }
  let next = { ...state, chips: state.chips - state.bet, dealer: [], hands: [] };
  const player = [];
  const dealer = [];
  let card;
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
  if (isBlackjack(player) && isBlackjack([dealer[0], { ...dealer[1], hidden: false }])) {
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
function handDone(h) {
  return h.stood || hardSoft(h.cards).total >= 21;
}
function nextHand(state) {
  const idx = state.hands.findIndex((h, i) => i > state.active && !handDone(h));
  if (idx >= 0) return { ...state, active: idx, phase: "player" };
  if (state.hands.every(handDone)) return playDealer(state);
  return state;
}
function hit(state) {
  if (state.phase !== "player") return state;
  const hand = state.hands[state.active];
  if (!hand || handDone(hand)) return nextHand(state);
  const pulled = draw(state);
  const cards = [...hand.cards, pulled.card];
  const hands = state.hands.map((h, i) => i === state.active ? { ...h, cards, stood: hardSoft(cards).total >= 21 } : h);
  const total = hardSoft(cards).total;
  let next = { ...pulled.state, hands, message: total > 21 ? "Bust." : `Total ${total}` };
  if (hands[state.active] && handDone(hands[state.active])) return nextHand(next);
  return next;
}
function stand(state) {
  if (state.phase !== "player") return state;
  const hands = state.hands.map((h, i) => i === state.active ? { ...h, stood: true } : h);
  return nextHand({ ...state, hands });
}
function doubleDown(state) {
  if (state.phase !== "player") return state;
  const hand = state.hands[state.active];
  if (!hand || hand.cards.length !== 2 || state.chips < hand.bet) return { ...state, message: "Cannot double." };
  let next = { ...state, chips: state.chips - hand.bet };
  const pulled = draw(next);
  const cards = [...hand.cards, pulled.card];
  const hands = pulled.state.hands.map(
    (h, i) => i === state.active ? { ...h, cards, bet: h.bet * 2, doubled: true, stood: true } : h
  );
  return nextHand({ ...pulled.state, chips: next.chips, hands });
}
function split(state) {
  if (state.phase !== "player") return state;
  const hand = state.hands[state.active];
  if (!hand || hand.cards.length !== 2) return state;
  const [a, b] = hand.cards;
  if (!a || !b) return state;
  const va = hardSoft([a]).total;
  const vb = hardSoft([b]).total;
  if (va !== vb || state.chips < hand.bet) return { ...state, message: "Cannot split." };
  let next = { ...state, chips: state.chips - hand.bet };
  let c1;
  let c2;
  ({ state: next, card: c1 } = draw(next));
  ({ state: next, card: c2 } = draw(next));
  const left = { cards: [a, c1], bet: hand.bet, stood: false, doubled: false };
  const right = { cards: [b, c2], bet: hand.bet, stood: false, doubled: false };
  const hands = [...state.hands];
  hands.splice(state.active, 1, left, right);
  return { ...next, hands, chips: next.chips, active: state.active, phase: "player", message: "Split." };
}
function playDealer(state) {
  let next = { ...state, dealer: state.dealer.map((c) => ({ ...c, hidden: false })), phase: "dealer" };
  let total = hardSoft(next.dealer).total;
  while (total < 17) {
    const pulled = draw(next);
    next = { ...pulled.state, dealer: [...pulled.state.dealer, pulled.card] };
    total = hardSoft(next.dealer).total;
  }
  return settle({ ...next, phase: "settle" });
}
function settle(state) {
  const dealerTotal = hardSoft(state.dealer).total;
  const dealerBj = isBlackjack(state.dealer);
  let chips = state.chips;
  const notes = [];
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
function nextRound(state) {
  return {
    ...state,
    dealer: [],
    hands: [],
    active: 0,
    phase: "bet",
    message: "Place another bet."
  };
}
function emptySeat(p) {
  return { id: p.id, name: p.name, human: p.human !== false, cards: [], stood: false };
}
function startBjLobby(people) {
  const players = people.slice(0, 2).map(emptySeat);
  return {
    mode: "duel",
    players,
    deck: [],
    turn: 0,
    phase: "lobby",
    winnerId: null,
    message: `Table ${players.length}/2. Open a table, add a CPU or invite, then start.`
  };
}
function startBjDuel(a, b) {
  let deck = freshShoe(2);
  const take = () => {
    const card = deck[0];
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
    message: `${a.name} acts first. Hit to take another card, stand to keep this total. Closest to 21 without going over wins. Face cards count 10; aces 1 or 11.`
  };
}
function settleDuel(state) {
  const [a, b] = state.players;
  if (!a || !b) return state;
  const ta = hardSoft(a.cards).total;
  const tb = hardSoft(b.cards).total;
  const ba = ta > 21;
  const bb = tb > 21;
  let winnerId = null;
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
function startBjPractice() {
  return startBjDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}
function aiBjAction(state) {
  const me = state.players[state.turn];
  if (!me) return { type: "stand" };
  return hardSoft(me.cards).total < 17 ? { type: "hit" } : { type: "stand" };
}
function applyBjDuelAction(state, actorId, action) {
  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      const [a, b] = state.players;
      return startBjDuel(a, b);
    }
    return state;
  }
  if (state.phase !== "play" || action.type === "start") return state;
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
    players = players.map((p) => p.id === me.id ? { ...p, cards, stood } : p);
    let next2 = {
      ...state,
      players,
      deck,
      message: total > 21 ? `${me.name} busts \u2014 over 21, this hand is lost.` : `${me.name} is at ${total}. Hit for another card, or stand. Closest to 21 without going over wins.`
    };
    if (stood && players.every((p) => p.stood)) return settleDuel(next2);
    if (stood) {
      const other = (state.turn + 1) % players.length;
      return { ...next2, turn: other };
    }
    return next2;
  }
  players = players.map((p) => p.id === me.id ? { ...p, stood: true } : p);
  const next = {
    ...state,
    players,
    message: `${me.name} stands. The other seat now hits or stands. Closest to 21 without going over wins.`
  };
  if (players.every((p) => p.stood)) return settleDuel(next);
  return { ...next, turn: (state.turn + 1) % players.length };
}
function viewBjDuel(state, viewerId) {
  const showAll = state.phase === "over";
  return {
    ...state,
    deck: [],
    players: state.players.map((p) => {
      if (p.id === viewerId || showAll || p.stood) return p;
      return {
        ...p,
        cards: p.cards.map((c, i) => i === 0 ? c : { ...c, hidden: true })
      };
    })
  };
}
export {
  aiBjAction,
  applyBjDuelAction,
  deal,
  doubleDown,
  freshShoe,
  hardSoft,
  hit,
  isBlackjack,
  isRed,
  nextRound,
  split,
  stand,
  startBj,
  startBjDuel,
  startBjLobby,
  startBjPractice,
  suitGlyph,
  viewBjDuel
};
