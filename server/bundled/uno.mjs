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

// src/games/uno/engine.ts
var COLORS = ["red", "yellow", "green", "blue"];
function colorOrder(card) {
  if (card.color === "red") return 0;
  if (card.color === "yellow") return 1;
  if (card.color === "green") return 2;
  if (card.color === "blue") return 3;
  return 4;
}
function kindOrder(card) {
  if (card.kind === "number") return card.value ?? 0;
  if (card.kind === "skip") return 10;
  if (card.kind === "reverse") return 11;
  if (card.kind === "draw2") return 12;
  if (card.kind === "wild") return 13;
  return 14;
}
function sortUnoHand(hand) {
  return [...hand].sort((a, b) => colorOrder(a) - colorOrder(b) || kindOrder(a) - kindOrder(b) || a.id.localeCompare(b.id));
}
function buildDeck() {
  const cards = [];
  for (const color of COLORS) {
    cards.push({ id: uid("u"), color, kind: "number", value: 0 });
    for (let n = 1; n <= 9; n++) {
      cards.push({ id: uid("u"), color, kind: "number", value: n });
      cards.push({ id: uid("u"), color, kind: "number", value: n });
    }
    for (let i = 0; i < 2; i++) {
      cards.push({ id: uid("u"), color, kind: "skip" });
      cards.push({ id: uid("u"), color, kind: "reverse" });
      cards.push({ id: uid("u"), color, kind: "draw2" });
    }
  }
  for (let i = 0; i < 4; i++) {
    cards.push({ id: uid("u"), color: "black", kind: "wild" });
    cards.push({ id: uid("u"), color: "black", kind: "wild4" });
  }
  return shuffle(cards);
}
function take(state, n) {
  let deck = state.deck;
  let discard = state.discard;
  const cards = [];
  for (let i = 0; i < n; i++) {
    if (deck.length === 0) {
      const top = discard[discard.length - 1];
      deck = shuffle(discard.slice(0, -1));
      discard = top ? [top] : [];
    }
    const c = deck[0];
    if (!c) break;
    cards.push(c);
    deck = deck.slice(1);
  }
  return { state: { ...state, deck, discard }, cards };
}
function currentUno(state) {
  return state.players[state.turn] ?? state.players[0];
}
function topCard(state) {
  return state.discard[state.discard.length - 1];
}
function canPlay(state, card) {
  if (state.pendingDraw > 0) return card.kind === "draw2" || card.kind === "wild4";
  if (card.kind === "wild" || card.kind === "wild4") return true;
  const top = topCard(state);
  if (!top) return true;
  if (card.color === state.color) return true;
  if (card.kind === "number" && top.kind === "number" && card.value === top.value) return true;
  if (card.kind !== "number" && card.kind === top.kind) return true;
  return false;
}
function startUnoPractice() {
  return startUnoDuel({ id: "you", name: "YOU", human: true }, { id: "cpu", name: "CPU", human: false });
}
function startUnoDuel(a, b) {
  let deck = buildDeck();
  const deal = (p) => {
    const hand = deck.slice(0, 7);
    deck = deck.slice(7);
    return { id: p.id, name: p.name, human: p.human !== false, hand: sortUnoHand(hand) };
  };
  const pa = deal(a);
  const pb = deal(b);
  let start = deck[0];
  deck = deck.slice(1);
  while (start && (start.kind === "wild" || start.kind === "wild4")) {
    deck = [...deck, start];
    start = deck[0];
    deck = deck.slice(1);
  }
  const color = start?.color === "black" ? "red" : start?.color;
  return {
    players: [pa, pb],
    deck,
    discard: start ? [start] : [],
    color,
    turn: 0,
    dir: 1,
    pendingDraw: start?.kind === "draw2" ? 2 : 0,
    phase: "play",
    wildCardId: null,
    winnerId: null,
    log: [{ id: uid("l"), text: `${a.name} vs ${b.name}. Empty your hand to win.` }]
  };
}
function nextIndex(state, skip = false) {
  const step = skip ? 2 : 1;
  const n = state.players.length;
  return (state.turn + state.dir * step + n * 8) % n;
}
function withPlayer(state, id, fn) {
  return { ...state, players: state.players.map((p) => p.id === id ? fn(p) : p) };
}
function winCheck(state, id) {
  const p = state.players.find((x) => x.id === id);
  if (p && p.hand.length === 0) {
    return { ...state, phase: "over", winnerId: id, log: [...state.log, { id: uid("l"), text: `${p.name} emptied their hand and wins.` }] };
  }
  return state;
}
function applyUnoAction(state, actorId, action) {
  if (state.phase === "over") return state;
  const me = currentUno(state);
  if (me.id !== actorId) return state;
  if (state.phase === "color") {
    if (action.type !== "color" || state.wildCardId == null) return state;
    return { ...state, color: action.color, phase: "play", wildCardId: null, turn: nextIndex(state, false) };
  }
  if (action.type === "draw") {
    if (state.pendingDraw > 0) {
      const pulled2 = take(state, state.pendingDraw);
      let next3 = withPlayer(pulled2.state, me.id, (p) => ({ ...p, hand: sortUnoHand([...p.hand, ...pulled2.cards]) }));
      next3.pendingDraw = 0;
      next3.log = [...next3.log, { id: uid("l"), text: `${me.name} draws ${pulled2.cards.length}.` }];
      next3.turn = nextIndex(next3);
      return next3;
    }
    const pulled = take(state, 1);
    const card2 = pulled.cards[0];
    let next2 = withPlayer(pulled.state, me.id, (p) => ({ ...p, hand: card2 ? sortUnoHand([...p.hand, card2]) : p.hand }));
    next2.log = [...next2.log, { id: uid("l"), text: `${me.name} draws.` }];
    if (card2 && canPlay(next2, card2)) return next2;
    next2.turn = nextIndex(next2);
    return next2;
  }
  if (action.type !== "play") return state;
  const card = me.hand.find((c) => c.id === action.cardId);
  if (!card || !canPlay(state, card)) return state;
  let next = withPlayer(state, me.id, (p) => ({ ...p, hand: p.hand.filter((c) => c.id !== card.id) }));
  next.discard = [...next.discard, card];
  next.log = [...next.log, { id: uid("l"), text: `${me.name} plays ${labelUno(card)}.` }];
  next = winCheck(next, me.id);
  if (next.phase === "over") return next;
  if (card.kind === "wild" || card.kind === "wild4") {
    next.pendingDraw += card.kind === "wild4" ? 4 : 0;
    if (action.color) {
      next.color = action.color;
      next.turn = nextIndex(next, false);
      return next;
    }
    next.phase = "color";
    next.wildCardId = card.id;
    return next;
  }
  if (card.color !== "black") next.color = card.color;
  if (card.kind === "draw2") next.pendingDraw += 2;
  const skip = card.kind === "skip" || card.kind === "reverse";
  if (card.kind === "reverse") next.dir = next.dir === 1 ? -1 : 1;
  next.turn = nextIndex(next, skip);
  return next;
}
function legalCards(state, playerId) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return [];
  return p.hand.filter((c) => canPlay(state, c));
}
function aiUno(state) {
  const me = currentUno(state);
  if (state.phase === "color") {
    const counts = COLORS.map((c) => ({ c, n: me.hand.filter((x) => x.color === c).length }));
    counts.sort((a, b) => b.n - a.n);
    return { type: "color", color: counts[0]?.c ?? "red" };
  }
  const legal = legalCards(state, me.id);
  const ranked = [...legal].sort((a, b) => scoreCard(b) - scoreCard(a));
  const pick = ranked[0];
  if (!pick) return { type: "draw" };
  const color = COLORS.map((c) => ({ c, n: me.hand.filter((x) => x.color === c).length })).sort((a, b) => b.n - a.n)[0]?.c;
  return { type: "play", cardId: pick.id, color };
}
function scoreCard(c) {
  if (c.kind === "wild4") return 1;
  if (c.kind === "wild") return 2;
  if (c.kind === "draw2") return 5;
  if (c.kind === "skip" || c.kind === "reverse") return 4;
  return 3;
}
function labelUno(card) {
  if (card.kind === "number") return `${card.color} ${card.value}`;
  if (card.kind === "draw2") return `${card.color} +2`;
  if (card.kind === "skip") return `${card.color} skip`;
  if (card.kind === "reverse") return `${card.color} reverse`;
  if (card.kind === "wild4") return "wild +4";
  return "wild";
}
function viewUno(state, viewerId) {
  return {
    ...state,
    deck: state.deck.map((c, i) => ({ ...c, id: `d${i}`, hidden: true, color: "black", kind: "wild" })),
    players: state.players.map(
      (p) => p.id === viewerId ? p : { ...p, hand: p.hand.map((c, i) => ({ ...c, id: `${p.id}-${i}`, hidden: true, color: "black", kind: "wild" })) }
    )
  };
}
export {
  aiUno,
  applyUnoAction,
  canPlay,
  currentUno,
  labelUno,
  legalCards,
  sortUnoHand,
  startUnoDuel,
  startUnoPractice,
  topCard,
  viewUno
};
