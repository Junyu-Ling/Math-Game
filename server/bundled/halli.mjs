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

// src/games/halligalli/engine.ts
var HALLI_FRUITS = ["cherry", "strawberry", "banana", "lemon"];
var HALLI_LABEL = {
  cherry: "Cherry",
  strawberry: "Strawberry",
  banana: "Banana",
  lemon: "Lemon"
};
var HALLI_EMOJI = {
  cherry: "\u{1F352}",
  strawberry: "\u{1F353}",
  banana: "\u{1F34C}",
  lemon: "\u{1F34B}"
};
function buildDeck() {
  const cards = [];
  const counts = [1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5];
  for (const fruit of HALLI_FRUITS) {
    for (const count of counts) {
      cards.push({ id: uid("hg"), fruit, count });
    }
  }
  return shuffle(cards);
}
function emptyPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    deck: [],
    open: [],
    score: 0,
    out: false
  };
}
function startHalliLobby(people) {
  const players = people.slice(0, 4).map(emptyPlayer);
  return {
    players,
    turn: 0,
    phase: "lobby",
    winnerId: null,
    lastRing: null,
    log: [{ id: uid("l"), text: `Table ${players.length}/4. Flip fruit cards. Ring when five of one fruit show.` }]
  };
}
function startHalliTable(people) {
  const seated = people.slice(0, 4);
  if (seated.length < 2) return startHalliLobby(seated);
  const deck = buildDeck();
  const n = seated.length;
  const share = Math.floor(deck.length / n);
  const players = seated.map((p, i) => ({
    ...emptyPlayer(p),
    deck: deck.slice(i * share, (i + 1) * share)
  }));
  return {
    players,
    turn: 0,
    phase: "play",
    winnerId: null,
    lastRing: null,
    log: [{ id: uid("l"), text: `${players.map((p) => p.name).join(" vs ")}. Flip, then ring on five.` }]
  };
}
var CPU_NAMES = ["CPU", "CPU 2", "CPU 3"];
function startHalliPractice(seats = 2) {
  const n = Math.max(2, Math.min(4, Math.floor(seats) || 2));
  const people = Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? "you" : `cpu-${i}`,
    name: i === 0 ? "YOU" : CPU_NAMES[i - 1],
    human: i === 0
  }));
  return startHalliTable(people);
}
function currentHalli(state) {
  return state.players[state.turn] ?? state.players[0];
}
function topOpen(player) {
  return player.open[player.open.length - 1] ?? null;
}
function fruitTotals(state) {
  const totals = { cherry: 0, strawberry: 0, banana: 0, lemon: 0 };
  for (const p of state.players) {
    if (p.out) continue;
    const top = topOpen(p);
    if (top) totals[top.fruit] += top.count;
  }
  return totals;
}
function ringingFruit(state) {
  const totals = fruitTotals(state);
  for (const fruit of HALLI_FRUITS) {
    if (totals[fruit] === 5) return fruit;
  }
  return null;
}
function nextLivingTurn(state, from = state.turn) {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    const p = state.players[i];
    if (p && !p.out && p.deck.length > 0) return i;
  }
  return from;
}
function finishIfNeeded(state) {
  const active = state.players.filter((p) => !p.out);
  if (active.length <= 1 && active[0]) {
    return {
      ...state,
      phase: "over",
      winnerId: active[0].id,
      log: [...state.log, { id: uid("l"), text: `${active[0].name} wins.` }]
    };
  }
  if (active.every((p) => p.deck.length === 0)) {
    const ranked = [...active].sort((a, b) => b.score - a.score || b.open.length - a.open.length);
    const win = ranked[0];
    if (!win) return state;
    return {
      ...state,
      phase: "over",
      winnerId: win.id,
      log: [...state.log, { id: uid("l"), text: `${win.name} scores ${win.score} and wins.` }]
    };
  }
  return state;
}
function flipHalli(state, actorId) {
  if (state.phase !== "play") return state;
  const me = currentHalli(state);
  if (me.id !== actorId || me.out) return state;
  if (me.deck.length === 0) {
    return finishIfNeeded({ ...state, turn: nextLivingTurn(state) });
  }
  const card = me.deck[0];
  const rest = me.deck.slice(1);
  const players = state.players.map(
    (p) => p.id === me.id ? { ...p, deck: rest, open: [...p.open, card] } : p
  );
  let next = {
    ...state,
    players,
    lastRing: null,
    log: [...state.log, { id: uid("l"), text: `${me.name} flips ${card.count} ${HALLI_LABEL[card.fruit].toLowerCase()}.` }]
  };
  next = finishIfNeeded(next);
  if (next.phase === "over") return next;
  next.turn = nextLivingTurn(next);
  return next;
}
function ringHalli(state, actorId) {
  if (state.phase !== "play") return state;
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor || actor.out) return state;
  const fruit = ringingFruit(state);
  const key = uid("ring");
  if (fruit) {
    const collected = [];
    const cleared = state.players.map((p) => {
      if (p.out) return p;
      collected.push(...p.open);
      return { ...p, open: [] };
    });
    const taken = collected.length;
    const withCards = cleared.map(
      (p) => p.id === actorId ? { ...p, deck: [...p.deck, ...collected], score: p.score + taken, out: false } : p
    );
    let next2 = {
      ...state,
      players: withCards,
      lastRing: { playerId: actorId, ok: true, fruit, key },
      log: [
        ...state.log,
        { id: uid("l"), text: `${actor.name} rings \u2014 five ${HALLI_LABEL[fruit].toLowerCase()}! +${taken} cards.` }
      ]
    };
    next2 = finishIfNeeded(next2);
    if (next2.phase === "over") return next2;
    if (currentHalli(next2).deck.length === 0) next2.turn = nextLivingTurn(next2);
    return next2;
  }
  const others = state.players.filter((p) => p.id !== actorId && !p.out);
  let stock = [...actor.deck];
  const fromOpen = stock.length === 0;
  if (fromOpen) stock = [...actor.open];
  const gifts = [];
  for (let i = 0; i < others.length; i++) {
    const card = stock.pop();
    if (card) gifts.push(card);
  }
  let gi = 0;
  const players = state.players.map((p) => {
    if (p.id === actorId) {
      const nextDeck = fromOpen ? [] : stock;
      const nextOpen = fromOpen ? stock : p.open;
      const empty = nextDeck.length === 0 && nextOpen.length === 0;
      return { ...p, deck: nextDeck, open: nextOpen, out: empty };
    }
    if (p.out) return p;
    const gift = gifts[gi++];
    return gift ? { ...p, deck: [...p.deck, gift] } : p;
  });
  let next = {
    ...state,
    players,
    lastRing: { playerId: actorId, ok: false, fruit: null, key },
    log: [...state.log, { id: uid("l"), text: `${actor.name} rings too early and pays cards.` }]
  };
  next = finishIfNeeded(next);
  if (next.phase === "over") return next;
  if (currentHalli(next).out || currentHalli(next).deck.length === 0) next.turn = nextLivingTurn(next);
  return next;
}
function applyHalliAction(state, actorId, action) {
  if (state.phase === "over") return state;
  if (!state.players.some((p) => p.id === actorId)) return state;
  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      return startHalliTable(state.players);
    }
    return state;
  }
  if (action.type === "flip") return flipHalli(state, actorId);
  if (action.type === "ring") return ringHalli(state, actorId);
  return state;
}
function aiHalli(state) {
  if (ringingFruit(state)) return { type: "ring" };
  return { type: "flip" };
}
function viewHalli(state, viewerId) {
  return {
    ...state,
    players: state.players.map(
      (p) => p.id === viewerId ? p : {
        ...p,
        deck: p.deck.map((_, i) => ({ id: `${p.id}-d${i}`, fruit: "cherry", count: 0 }))
      }
    )
  };
}
export {
  HALLI_EMOJI,
  HALLI_FRUITS,
  HALLI_LABEL,
  aiHalli,
  applyHalliAction,
  currentHalli,
  flipHalli,
  fruitTotals,
  ringHalli,
  ringingFruit,
  startHalliLobby,
  startHalliPractice,
  startHalliTable,
  topOpen,
  viewHalli
};
