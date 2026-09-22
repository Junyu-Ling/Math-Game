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

// src/games/flip7/engine.ts
function deckBuild() {
  const cards = [];
  cards.push({ id: uid("f"), kind: "number", value: 0 });
  for (let n = 1; n <= 12; n++) {
    for (let i = 0; i < n; i++) cards.push({ id: uid("f"), kind: "number", value: n });
  }
  for (const n of [2, 4, 6, 8, 10]) {
    cards.push({ id: uid("f"), kind: "plus", value: n });
  }
  cards.push({ id: uid("f"), kind: "double" });
  for (let i = 0; i < 3; i++) {
    cards.push({ id: uid("f"), kind: "freeze" });
    cards.push({ id: uid("f"), kind: "flip3" });
    cards.push({ id: uid("f"), kind: "chance" });
  }
  return shuffle(cards);
}
function cardLabel(card) {
  if (card.kind === "number") return String(card.value);
  if (card.kind === "plus") return `+${card.value}`;
  if (card.kind === "double") return "\xD72";
  if (card.kind === "freeze") return "FREEZE";
  if (card.kind === "flip3") return "FLIP 3";
  return "2ND";
}
function areaScore(area) {
  const numbers = area.filter((c) => c.kind === "number");
  const plus = area.filter((c) => c.kind === "plus").reduce((s, c) => s + (c.value ?? 0), 0);
  const doubles = area.filter((c) => c.kind === "double").length;
  let score = numbers.reduce((s, c) => s + (c.value ?? 0), 0) + plus;
  for (let i = 0; i < doubles; i++) score *= 2;
  const flip7 = new Set(numbers.map((c) => c.value)).size >= 7;
  if (flip7) score += 15;
  return { score, numbers: numbers.length, flip7 };
}
function emptySeat(p) {
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    total: 0,
    area: [],
    status: "active",
    pendingFreeze: false,
    pendingFlip3: 0
  };
}
function startFlip7Lobby(people) {
  const players = people.slice(0, 4).map(emptySeat);
  return {
    players,
    deck: [],
    discard: [],
    turn: 0,
    round: 1,
    phase: "lobby",
    pendingAction: null,
    lastCard: null,
    winnerId: null,
    goal: 200,
    burst: null,
    log: [{ id: uid("l"), text: `Table ${players.length}/4. Host starts at 1\u20134 players.` }]
  };
}
function startFlip7Table(people) {
  const seated = people.slice(0, 4);
  if (!seated.length) return startFlip7Lobby(seated);
  const players = seated.map(emptySeat);
  return {
    players,
    deck: deckBuild(),
    discard: [],
    turn: 0,
    round: 1,
    phase: "action",
    pendingAction: null,
    lastCard: null,
    winnerId: null,
    goal: 200,
    burst: null,
    log: [{ id: uid("l"), text: `${players.map((p) => p.name).join(" \xB7 ")}. Hit / Stay. First to 200.` }]
  };
}
function startFlip7Duel(a, b) {
  return startFlip7Table([a, b]);
}
var CPU_NAMES = ["CPU", "CPU 2", "CPU 3"];
function startFlip7(seats = 1) {
  const n = Math.max(1, Math.min(4, Math.floor(seats) || 1));
  return startFlip7Table(
    Array.from({ length: n }, (_, i) => ({
      id: i === 0 ? "you" : `cpu-${i}`,
      name: i === 0 ? "YOU" : CPU_NAMES[i - 1],
      human: i === 0
    }))
  );
}
function viewFlip7(state, _viewerId) {
  return state;
}
function currentFlip(state) {
  return state.players[state.turn] ?? state.players[0];
}
function activePlayers(state) {
  return state.players.filter((p) => p.status === "active");
}
function hasSecondChance(area) {
  return area.some((c) => c.kind === "chance");
}
function takeCard(state) {
  let deck = state.deck;
  let discard = state.discard;
  if (deck.length === 0) {
    deck = shuffle(discard);
    discard = [];
  }
  const card = deck[0];
  if (!card) throw new Error("empty");
  return { state: { ...state, deck: deck.slice(1), discard }, card };
}
function withPlayer(state, id, fn) {
  return { ...state, players: state.players.map((p) => p.id === id ? fn(p) : p) };
}
function hit(state) {
  if (state.phase !== "action") return state;
  const me = currentFlip(state);
  if (me.status !== "active") return advance(state);
  const pulled = takeCard(state);
  const card = pulled.card;
  let next = pulled.state;
  next.lastCard = card;
  const numbers = me.area.filter((c) => c.kind === "number").map((c) => c.value);
  const bust = card.kind === "number" && numbers.includes(card.value);
  const whoTone = me.human ? "you" : "ai";
  if (bust) {
    const chance = me.area.find((c) => c.kind === "chance");
    if (chance) {
      const area = me.area.filter((c) => c.id !== chance.id);
      next = withPlayer(next, me.id, (p) => ({ ...p, area, pendingFlip3: Math.max(0, p.pendingFlip3 - 1) }));
      next.discard = [...next.discard, chance, card];
      next.burst = { playerId: me.id, id: uid("boom"), kind: "save", saveCard: chance };
      next.log = [...next.log, { id: uid("l"), text: `${me.name} hits a duplicate ${card.value}. Second Chance saves the round.`, tone: whoTone }];
      return afterHit(next, me.id);
    }
    next = withPlayer(next, me.id, (p) => ({ ...p, area: [], status: "bust", pendingFlip3: 0 }));
    next.discard = [...next.discard, ...me.area, card];
    next.burst = { playerId: me.id, id: uid("boom"), kind: "bust" };
    next.log = [...next.log, { id: uid("l"), text: `${me.name} busts (duplicate ${card.value}). Round scores 0.`, tone: "bad" }];
    return advance(next);
  }
  if (card.kind === "chance" && hasSecondChance(me.area)) {
    next = withPlayer(next, me.id, (p) => ({ ...p, pendingFlip3: Math.max(0, p.pendingFlip3 - 1) }));
    next.discard = [...next.discard, card];
    next.log = [...next.log, { id: uid("l"), text: `${me.name} already has Second Chance. The extra is discarded.`, tone: whoTone }];
    return afterHit(next, me.id);
  }
  next = withPlayer(next, me.id, (p) => ({
    ...p,
    area: [...p.area, card],
    pendingFlip3: Math.max(0, p.pendingFlip3 - 1)
  }));
  next.log = [...next.log, { id: uid("l"), text: `${me.name} flips ${cardLabel(card)}.`, tone: whoTone }];
  if (card.kind === "freeze" || card.kind === "flip3") {
    const aimed = { ...next, phase: "target", pendingAction: card.kind };
    const live = activePlayers(aimed);
    if (live.length <= 1) return applyTarget(aimed, me.id);
    return aimed;
  }
  return afterHit(next, me.id);
}
function afterHit(state, playerId) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;
  const scored = areaScore(me.area);
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (scored.flip7) {
    let next = withPlayer(state, me.id, (p) => ({
      ...p,
      status: "flip7",
      total: p.total + scored.score,
      area: []
    }));
    next.discard = [...next.discard, ...me.area];
    next.log = [...next.log, { id: uid("l"), text: `${me.name} Flip 7! +${scored.score} (includes +15).`, tone: "you" }];
    next = checkWin(next, me.id);
    if (next.phase === "over") return next;
    return advance({ ...next, turn: idx });
  }
  const parked = { ...state, turn: Math.max(0, idx), phase: "action" };
  if (me.pendingFlip3 > 0) return parked;
  return advance(parked);
}
function stay(state) {
  if (state.phase !== "action") return state;
  const me = currentFlip(state);
  if (me.pendingFlip3 > 0) return hit(state);
  const scored = areaScore(me.area).score;
  let next = withPlayer(state, me.id, (p) => ({ ...p, area: [], status: "stayed", total: p.total + scored }));
  next.discard = [...next.discard, ...me.area];
  next.log = [...next.log, { id: uid("l"), text: `${me.name} stays. Round +${scored}.`, tone: me.human ? "you" : "ai" }];
  next = checkWin(next, me.id);
  if (next.phase === "over") return next;
  return advance(next);
}
function applyTarget(state, targetId) {
  if (state.phase !== "target" || !state.pendingAction) return state;
  const me = currentFlip(state);
  const live = activePlayers(state);
  const forced = live.length <= 1 ? me.id : targetId;
  const target = state.players.find((p) => p.id === forced);
  if (!target || target.status !== "active") return state;
  const action = state.pendingAction;
  const onSelf = target.id === me.id;
  let next = state;
  if (action === "freeze") {
    const scored = areaScore(target.area).score;
    const hadChance = hasSecondChance(target.area);
    next = withPlayer(next, target.id, (p) => ({
      ...p,
      pendingFreeze: false,
      pendingFlip3: 0,
      status: "stayed",
      total: p.total + scored,
      area: []
    }));
    next.discard = [...next.discard, ...target.area];
    next.log = [
      ...next.log,
      {
        id: uid("l"),
        text: `${onSelf ? `${me.name} freezes themselves and banks +${scored}.` : `${me.name} freezes ${target.name} \xB7 +${scored}.`}${hadChance ? " Second Chance cannot block Freeze." : ""}`
      }
    ];
  } else {
    next = withPlayer(next, target.id, (p) => ({ ...p, pendingFlip3: p.pendingFlip3 + 3 }));
    next.log = [
      ...next.log,
      {
        id: uid("l"),
        text: onSelf ? `${me.name} uses Flip Three on themselves.` : `${me.name} uses Flip Three on ${target.name}.`
      }
    ];
  }
  next.pendingAction = null;
  next.phase = "action";
  return afterHit(next, me.id);
}
function checkWin(state, playerId) {
  const p = state.players.find((x) => x.id === playerId);
  if (p && p.total >= state.goal) {
    return {
      ...state,
      phase: "over",
      winnerId: p.id,
      log: [...state.log, { id: uid("l"), text: `${p.name} reaches ${p.total} and wins.`, tone: "you" }]
    };
  }
  return state;
}
function allSettled(state) {
  return state.players.every((p) => p.status !== "active");
}
function newRound(state) {
  const discard = [...state.discard, ...state.players.flatMap((p) => p.area)];
  const players = state.players.map((p) => ({
    ...p,
    area: [],
    status: "active",
    pendingFreeze: false,
    pendingFlip3: 0
  }));
  return {
    ...state,
    players,
    discard,
    round: state.round + 1,
    turn: state.round % state.players.length,
    phase: "action",
    lastCard: null,
    log: [...state.log, { id: uid("l"), text: `Round ${state.round + 1} starts.` }]
  };
}
function advance(state) {
  if (state.phase === "over") return state;
  if (allSettled(state)) return newRound(state);
  let i = state.turn;
  for (let n = 0; n < state.players.length; n++) {
    i = (i + 1) % state.players.length;
    const p = state.players[i];
    if (!p || p.status !== "active") continue;
    if (p.pendingFreeze) {
      const scored = areaScore(p.area).score;
      let next = withPlayer(state, p.id, (x) => ({
        ...x,
        pendingFreeze: false,
        status: "stayed",
        total: x.total + scored
      }));
      next.log = [...next.log, { id: uid("l"), text: `${p.name} is frozen and must stay +${scored}.` }];
      next = checkWin(next, p.id);
      if (next.phase === "over") return next;
      next.turn = i;
      return advance(next);
    }
    return { ...state, turn: i, phase: "action" };
  }
  return newRound(state);
}
function aiDecide(state) {
  const me = currentFlip(state);
  if (me.pendingFlip3 > 0) return "hit";
  const { score, numbers } = areaScore(me.area);
  if (numbers >= 6) return "stay";
  if (score >= 23 && numbers >= 4) return "stay";
  if (score >= 18 && numbers >= 5) return "stay";
  if (me.area.length === 0) return "hit";
  return "hit";
}
function applyFlipAction(state, actorId, action) {
  if (!state.players.some((p) => p.id === actorId)) return state;
  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 1) {
      return startFlip7Table(state.players);
    }
    return state;
  }
  if (state.phase === "over") return state;
  const cur = currentFlip(state);
  if (cur.id !== actorId) return state;
  if (action.type === "hit") return hit(state);
  if (action.type === "stay") return stay(state);
  if (action.type === "target") return applyTarget(state, action.targetId);
  return state;
}
function aiTarget(state) {
  const me = currentFlip(state);
  const live = activePlayers(state);
  if (live.length <= 1) return me.id;
  const mine = areaScore(me.area);
  const others = live.filter((p) => p.id !== me.id);
  if (state.pendingAction === "freeze") {
    if (mine.score >= 16 || mine.numbers >= 5) return me.id;
    const threat = [...others].sort((a, b) => areaScore(b.area).score - areaScore(a.area).score)[0];
    return threat?.id ?? me.id;
  }
  if (mine.numbers >= 4 && mine.numbers < 7) return me.id;
  return others[0]?.id ?? me.id;
}
export {
  activePlayers,
  advance,
  aiDecide,
  aiTarget,
  applyFlipAction,
  applyTarget,
  areaScore,
  cardLabel,
  currentFlip,
  hit,
  startFlip7,
  startFlip7Duel,
  startFlip7Lobby,
  startFlip7Table,
  stay,
  viewFlip7
};
