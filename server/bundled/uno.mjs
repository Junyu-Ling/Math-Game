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
  if (state.justDrawnId && card.id !== state.justDrawnId) return false;
  if (state.pendingDraw > 0) {
    if (state.stackKind === "wild4") {
      return card.kind === "wild4" || card.kind === "draw2" && card.color === state.color;
    }
    return card.kind === "draw2";
  }
  if (card.kind === "wild" || card.kind === "wild4") return true;
  const top = topCard(state);
  if (!top) return true;
  if (card.color === state.color) return true;
  if (card.kind === "number" && top.kind === "number" && card.value === top.value) return true;
  if (card.kind !== "number" && card.kind === top.kind) return true;
  return false;
}
function needsUnoCall(player) {
  return player.hand.length <= 2 && !player.calledUno;
}
var CPU_NAMES = ["CPU", "CPU 2", "CPU 3"];
function startUnoLobby(people) {
  const players = people.slice(0, 4).map((p) => ({
    id: p.id,
    name: p.name,
    human: p.human !== false,
    hand: [],
    calledUno: false
  }));
  return {
    players,
    deck: [],
    discard: [],
    color: "red",
    turn: 0,
    dir: 1,
    pendingDraw: 0,
    justDrawnId: null,
    phase: "lobby",
    wildCardId: null,
    winnerId: null,
    drawBurst: null,
    stackKind: null,
    log: [{ id: uid("l"), text: `Table ${players.length}/4. Host starts once at least two are seated.` }]
  };
}
function startUnoPractice(seats = 2) {
  const n = Math.max(2, Math.min(4, Math.floor(seats) || 2));
  return startUnoTable(
    Array.from({ length: n }, (_, i) => ({
      id: i === 0 ? "you" : `cpu-${i}`,
      name: i === 0 ? "YOU" : CPU_NAMES[i - 1],
      human: i === 0
    }))
  );
}
function startUnoDuel(a, b) {
  return startUnoTable([a, b]);
}
function startUnoTable(people) {
  const seated = people.slice(0, 4);
  if (seated.length < 2) return startUnoLobby(seated);
  let deck = buildDeck();
  const players = seated.map((p) => {
    const hand = sortUnoHand(deck.slice(0, 7));
    deck = deck.slice(7);
    return { id: p.id, name: p.name, human: p.human !== false, hand, calledUno: false };
  });
  let start = deck[0];
  deck = deck.slice(1);
  while (start && (start.kind === "wild" || start.kind === "wild4")) {
    deck = [...deck, start];
    start = deck[0];
    deck = deck.slice(1);
  }
  const color = start?.color === "black" ? "red" : start?.color;
  return settlePending({
    players,
    deck,
    discard: start ? [start] : [],
    color,
    turn: 0,
    dir: 1,
    pendingDraw: start?.kind === "draw2" ? 2 : 0,
    justDrawnId: null,
    phase: "play",
    wildCardId: null,
    winnerId: null,
    drawBurst: start?.kind === "draw2" ? { n: 2, playerId: players[0].id, key: uid("fx") } : null,
    stackKind: start?.kind === "draw2" ? "draw2" : null,
    log: [{ id: uid("l"), text: `${players.map((p) => p.name).join(" vs ")}. Empty your hand to win.` }]
  });
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
function giveCards(state, id, cards) {
  return withPlayer(state, id, (p) => {
    const hand = sortUnoHand([...p.hand, ...cards]);
    return { ...p, hand, calledUno: hand.length > 1 ? false : p.calledUno };
  });
}
function burst(state, n, playerId) {
  return { ...state, drawBurst: { n, playerId, key: uid("fx") } };
}
function applyUnoAction(state, actorId, action) {
  if (state.phase === "over") return state;
  if (!state.players.some((p) => p.id === actorId)) return state;
  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      return startUnoTable(state.players);
    }
    return state;
  }
  if (action.type === "uno") {
    const actor = state.players.find((p) => p.id === actorId);
    if (!actor || actor.hand.length > 2 || actor.calledUno) return state;
    return withPlayer(state, actorId, (p) => ({ ...p, calledUno: true }));
  }
  const me = currentUno(state);
  if (me.id !== actorId) return state;
  if (state.phase === "color") {
    if (action.type !== "color" || state.wildCardId == null) return state;
    return settlePending({ ...state, color: action.color, phase: "play", wildCardId: null, turn: nextIndex(state, false) });
  }
  if (action.type === "keep") {
    if (!state.justDrawnId) return state;
    return { ...state, justDrawnId: null, turn: nextIndex(state), log: [...state.log, { id: uid("l"), text: `${me.name} keeps the draw.` }] };
  }
  if (action.type === "draw") {
    if (state.justDrawnId) return state;
    if (state.pendingDraw > 0) {
      const n = state.pendingDraw;
      const pulled2 = take(state, n);
      let next3 = giveCards(pulled2.state, me.id, pulled2.cards);
      next3.pendingDraw = 0;
      next3.justDrawnId = null;
      next3.stackKind = null;
      next3.log = [...next3.log, { id: uid("l"), text: `${me.name} draws ${pulled2.cards.length}.` }];
      next3.turn = nextIndex(next3);
      return burst(next3, pulled2.cards.length, me.id);
    }
    const pulled = take(state, 1);
    const card2 = pulled.cards[0];
    let next2 = card2 ? giveCards(pulled.state, me.id, [card2]) : pulled.state;
    next2.log = [...next2.log, { id: uid("l"), text: `${me.name} draws.` }];
    next2 = burst(next2, 1, me.id);
    if (card2 && canPlay({ ...next2, justDrawnId: null }, card2)) {
      next2.justDrawnId = card2.id;
      return next2;
    }
    next2.justDrawnId = null;
    next2.turn = nextIndex(next2);
    return next2;
  }
  if (action.type !== "play") return state;
  const card = me.hand.find((c) => c.id === action.cardId);
  if (!card || !canPlay(state, card)) return state;
  let next = withPlayer(state, me.id, (p) => ({ ...p, hand: p.hand.filter((c) => c.id !== card.id) }));
  next.justDrawnId = null;
  next.stackKind = null;
  next.discard = [...next.discard, card];
  next.log = [...next.log, { id: uid("l"), text: `${me.name} plays ${labelUno(card)}.` }];
  const after = next.players.find((p) => p.id === me.id);
  if (after && after.hand.length <= 1 && !me.calledUno) {
    const pulled = take(next, 2);
    next = giveCards(pulled.state, me.id, pulled.cards);
    next.log = [...next.log, { id: uid("l"), text: `${me.name} missed UNO and draws 2.` }];
    next = burst(next, 2, me.id);
  }
  next = winCheck(next, me.id);
  if (next.phase === "over") return next;
  if (card.kind === "wild" || card.kind === "wild4") {
    if (card.kind === "wild4") {
      next.pendingDraw += 4;
      next.stackKind = "wild4";
      next = burst(next, next.pendingDraw, next.players[nextIndex(next)]?.id ?? me.id);
    } else {
      next.stackKind = state.pendingDraw > 0 ? state.stackKind : null;
    }
    if (action.color) {
      next.color = action.color;
      next.turn = nextIndex(next, false);
      return settlePending(next);
    }
    next.phase = "color";
    next.wildCardId = card.id;
    return next;
  }
  if (card.color !== "black") next.color = card.color;
  if (card.kind === "draw2") {
    next.pendingDraw += 2;
    next.stackKind = state.stackKind === "wild4" ? "wild4" : "draw2";
    next = burst(next, next.pendingDraw, next.players[nextIndex(next)]?.id ?? me.id);
  }
  if (card.kind === "reverse") {
    next.dir = next.dir === 1 ? -1 : 1;
    next.turn = nextIndex(next, next.players.length === 2);
    return next;
  }
  next.turn = nextIndex(next, card.kind === "skip");
  return settlePending(next);
}
function takePenalty(state) {
  const me = currentUno(state);
  const pulled = take(state, state.pendingDraw);
  let next = giveCards(pulled.state, me.id, pulled.cards);
  next.pendingDraw = 0;
  next.justDrawnId = null;
  next.stackKind = null;
  next.log = [...next.log, { id: uid("l"), text: `${me.name} draws ${pulled.cards.length}.` }];
  next.turn = nextIndex(next);
  return burst(next, pulled.cards.length, me.id);
}
function settlePending(state) {
  if (state.phase !== "play" || state.pendingDraw <= 0 || state.justDrawnId) return state;
  if (legalCards(state, currentUno(state).id).length > 0) return state;
  return takePenalty(state);
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
  if (state.justDrawnId) {
    const drawn = me.hand.find((c) => c.id === state.justDrawnId);
    if (!drawn || !canPlay(state, drawn)) return { type: "keep" };
    if (needsUnoCall(me)) return { type: "uno" };
    const color2 = COLORS.map((c) => ({ c, n: me.hand.filter((x) => x.color === c).length })).sort((a, b) => b.n - a.n)[0]?.c;
    return { type: "play", cardId: drawn.id, color: color2 };
  }
  const legal = legalCards(state, me.id);
  const ranked = [...legal].sort((a, b) => scoreCard(b) - scoreCard(a));
  const pick = ranked[0];
  if (!pick) return { type: "draw" };
  if (needsUnoCall(me)) return { type: "uno" };
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
  needsUnoCall,
  sortUnoHand,
  startUnoDuel,
  startUnoLobby,
  startUnoPractice,
  startUnoTable,
  topCard,
  viewUno
};
