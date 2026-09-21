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

// src/games/blackjack/engine.ts
var ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
var suits = ["S", "H", "D", "C"];
function freshShoe(n = 4) {
  const cards = [];
  for (let i = 0; i < n; i++) {
    for (const suit of suits) for (const rank of ranks) cards.push({ id: uid("b"), suit, rank });
  }
  return shuffle(cards);
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
    message: "\u4E0B\u6CE8\u540E\u53D1\u724C\u3002\u76EE\u6807 21\uFF0C\u4E0D\u8D85\u8FC7\u3002"
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
    return { ...state, message: "\u7B79\u7801\u4E0D\u8DB3\u3002" };
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
    next.message = "Blackjack\u3002\u8D54\u4ED8 3:2\u3002";
    next.hands = next.hands.map((h) => ({ ...h, stood: true }));
    return next;
  }
  next.phase = "player";
  next.message = "\u8981\u724C\u3001\u505C\u724C\u3001\u52A0\u500D\uFF1B\u5BF9\u5B50\u53EF\u5206\u724C\u3002";
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
  let next = { ...pulled.state, hands, message: total > 21 ? "\u7206\u724C\u3002" : `\u5F53\u524D ${total}` };
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
  if (!hand || hand.cards.length !== 2 || state.chips < hand.bet) return { ...state, message: "\u65E0\u6CD5\u52A0\u500D\u3002" };
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
  if (va !== vb || state.chips < hand.bet) return { ...state, message: "\u65E0\u6CD5\u5206\u724C\u3002" };
  let next = { ...state, chips: state.chips - hand.bet };
  let c1;
  let c2;
  ({ state: next, card: c1 } = draw(next));
  ({ state: next, card: c2 } = draw(next));
  const left = { cards: [a, c1], bet: hand.bet, stood: false, doubled: false };
  const right = { cards: [b, c2], bet: hand.bet, stood: false, doubled: false };
  const hands = [...state.hands];
  hands.splice(state.active, 1, left, right);
  return { ...next, hands, chips: next.chips, active: state.active, phase: "player", message: "\u5DF2\u5206\u724C\u3002" };
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
      notes.push("\u73A9\u5BB6\u7206\uFF0C\u8F93\u3002");
    } else if (bj && !dealerBj) {
      chips += Math.floor(hand.bet * 2.5);
      notes.push("Blackjack \u8D62\u3002");
    } else if (dealerTotal > 21 || t > dealerTotal) {
      chips += hand.bet * 2;
      notes.push(`\u8D62 ${hand.bet}\u3002`);
    } else if (t === dealerTotal) {
      chips += hand.bet;
      notes.push("\u5E73\u5C40\uFF0C\u9000\u6CE8\u3002");
    } else notes.push("\u5E84\u5BB6\u8F83\u5927\uFF0C\u8F93\u3002");
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
    message: "\u518D\u4E0B\u4E00\u6CE8\u3002"
  };
}
function emptySeat(p) {
  return { id: p.id, name: p.name, cards: [], stood: false };
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
    message: `${a.name} \u5148\u624B\u3002\u6BD4\u70B9\u6570\uFF0C\u4E0D\u8D85\u8FC7 21\u3002`
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
    message = "\u53CC\u65B9\u7206\u724C\uFF0C\u5E73\u5C40\u3002";
  } else if (ba) {
    winnerId = b.id;
    message = `${a.name} \u7206\u724C\uFF0C${b.name} \u83B7\u80DC\u3002`;
  } else if (bb) {
    winnerId = a.id;
    message = `${b.name} \u7206\u724C\uFF0C${a.name} \u83B7\u80DC\u3002`;
  } else if (ta > tb) {
    winnerId = a.id;
    message = `${a.name} ${ta} \u5BF9 ${tb}\uFF0C\u83B7\u80DC\u3002`;
  } else if (tb > ta) {
    winnerId = b.id;
    message = `${b.name} ${tb} \u5BF9 ${ta}\uFF0C\u83B7\u80DC\u3002`;
  } else message = `${ta} \u5E73\u5C40\u3002`;
  return { ...state, phase: "over", winnerId, message };
}
function startBjPractice() {
  return startBjDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU" });
}
function aiBjAction(state) {
  const me = state.players[state.turn];
  if (!me) return { type: "stand" };
  return hardSoft(me.cards).total < 17 ? { type: "hit" } : { type: "stand" };
}
function applyBjDuelAction(state, actorId, action) {
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
    players = players.map((p) => p.id === me.id ? { ...p, cards, stood } : p);
    let next2 = {
      ...state,
      players,
      deck,
      message: total > 21 ? `${me.name} \u7206\u724C\u3002` : `${me.name} ${total}`
    };
    if (stood && players.every((p) => p.stood)) return settleDuel(next2);
    if (stood) {
      const other = (state.turn + 1) % players.length;
      return { ...next2, turn: other };
    }
    return next2;
  }
  players = players.map((p) => p.id === me.id ? { ...p, stood: true } : p);
  const next = { ...state, players, message: `${me.name} \u505C\u724C\u3002` };
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
function suitGlyph(suit) {
  return { S: "\u2660", H: "\u2665", D: "\u2666", C: "\u2663" }[suit];
}
function isRed(suit) {
  return suit === "H" || suit === "D";
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
  startBjPractice,
  suitGlyph,
  viewBjDuel
};
