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
  for (let n = 1; n <= 12; n++) {
    for (let i = 0; i < n; i++) cards.push({ id: uid("f"), kind: "number", value: n });
  }
  for (const n of [2, 3, 4]) {
    for (let i = 0; i < 4; i++) cards.push({ id: uid("f"), kind: "plus", value: n });
  }
  for (let i = 0; i < 3; i++) {
    cards.push({ id: uid("f"), kind: "double" });
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
function startFlip7Duel(a, b) {
  const seat = (p) => ({
    id: p.id,
    name: p.name,
    human: true,
    total: 0,
    area: [],
    status: "active",
    pendingFreeze: false,
    pendingFlip3: 0
  });
  return {
    players: [seat(a), seat(b)],
    deck: deckBuild(),
    discard: [],
    turn: 0,
    round: 1,
    phase: "action",
    pendingAction: null,
    lastCard: null,
    winnerId: null,
    goal: 200,
    log: [{ id: uid("l"), text: `${a.name} vs ${b.name}\u3002Hit / Stay\uFF0C\u5148\u5230 200\u3002` }]
  };
}
function startFlip7() {
  return startFlip7Duel({ id: uid("p"), name: "YOU" }, { id: uid("p"), name: "RIVAL" });
}
function currentFlip(state) {
  return state.players[state.turn] ?? state.players[0];
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
      next.log = [...next.log, { id: uid("l"), text: `${me.name} \u89E6\u53D1\u91CD\u590D ${card.value}\uFF0C\u6D88\u8017 Second Chance\u3002`, tone: whoTone }];
      return afterHit(next, me.id);
    }
    next = withPlayer(next, me.id, (p) => ({ ...p, area: [], status: "bust", pendingFlip3: 0 }));
    next.discard = [...next.discard, ...me.area, card];
    next.log = [...next.log, { id: uid("l"), text: `${me.name} \u7206\u724C\uFF08\u91CD\u590D ${card.value}\uFF09\uFF0C\u672C\u8F6E 0 \u5206\u3002`, tone: "bad" }];
    return advance(next);
  }
  next = withPlayer(next, me.id, (p) => ({
    ...p,
    area: [...p.area, card],
    pendingFlip3: Math.max(0, p.pendingFlip3 - 1)
  }));
  next.log = [...next.log, { id: uid("l"), text: `${me.name} \u7FFB\u5F00 ${cardLabel(card)}\u3002`, tone: whoTone }];
  if (card.kind === "freeze" || card.kind === "flip3") {
    return { ...next, phase: "target", pendingAction: card.kind };
  }
  return afterHit(next, me.id);
}
function afterHit(state, playerId) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;
  const scored = areaScore(me.area);
  if (scored.flip7) {
    let next = withPlayer(state, me.id, (p) => ({
      ...p,
      status: "flip7",
      total: p.total + scored.score,
      area: []
    }));
    next.discard = [...next.discard, ...me.area];
    next.log = [...next.log, { id: uid("l"), text: `${me.name} Flip 7\uFF01+${scored.score}\uFF08\u542B 15 \u66B4\u51FB\uFF09\u3002`, tone: "you" }];
    next = checkWin(next, me.id);
    if (next.phase === "over") return next;
    return advance(next);
  }
  return { ...state, phase: "action" };
}
function stay(state) {
  if (state.phase !== "action") return state;
  const me = currentFlip(state);
  if (me.pendingFlip3 > 0) return hit(state);
  const scored = areaScore(me.area).score;
  let next = withPlayer(state, me.id, (p) => ({ ...p, area: [], status: "stayed", total: p.total + scored }));
  next.discard = [...next.discard, ...me.area];
  next.log = [...next.log, { id: uid("l"), text: `${me.name} \u505C\u724C\uFF0C\u672C\u8F6E +${scored}\u3002`, tone: me.human ? "you" : "ai" }];
  next = checkWin(next, me.id);
  if (next.phase === "over") return next;
  return advance(next);
}
function applyTarget(state, targetId) {
  if (state.phase !== "target" || !state.pendingAction) return state;
  const me = currentFlip(state);
  const action = state.pendingAction;
  let next = state;
  if (action === "freeze") {
    next = withPlayer(next, targetId, (p) => ({ ...p, pendingFreeze: true }));
    next.log = [...next.log, { id: uid("l"), text: `${me.name} \u5BF9 ${nameOf(state, targetId)} \u4F7F\u7528 Freeze\u3002` }];
  } else {
    next = withPlayer(next, targetId, (p) => ({ ...p, pendingFlip3: p.pendingFlip3 + 3 }));
    next.log = [...next.log, { id: uid("l"), text: `${me.name} \u5BF9 ${nameOf(state, targetId)} \u4F7F\u7528 Flip Three\u3002` }];
  }
  next.pendingAction = null;
  next.phase = "action";
  return afterHit(next, me.id);
}
function nameOf(state, id) {
  return state.players.find((p) => p.id === id)?.name ?? "?";
}
function checkWin(state, playerId) {
  const p = state.players.find((x) => x.id === playerId);
  if (p && p.total >= state.goal) {
    return {
      ...state,
      phase: "over",
      winnerId: p.id,
      log: [...state.log, { id: uid("l"), text: `${p.name} \u8FBE\u5230 ${p.total}\uFF0C\u80DC\u51FA\u3002`, tone: "you" }]
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
    status: "active"
  }));
  return {
    ...state,
    players,
    discard,
    round: state.round + 1,
    turn: state.round % state.players.length,
    phase: "action",
    lastCard: null,
    log: [...state.log, { id: uid("l"), text: `\u7B2C ${state.round + 1} \u8F6E\u5F00\u59CB\u3002` }]
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
      next.log = [...next.log, { id: uid("l"), text: `${p.name} \u88AB\u51BB\u7ED3\uFF0C\u5F3A\u5236\u505C\u724C +${scored}\u3002` }];
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
  const cur = currentFlip(state);
  if (cur.id !== actorId) return state;
  if (action.type === "hit") return hit(state);
  if (action.type === "stay") return stay(state);
  if (action.type === "target") return applyTarget(state, action.targetId);
  return state;
}
function aiTarget(state) {
  const me = currentFlip(state);
  const others = state.players.filter((p) => p.id !== me.id);
  const threat = [...others].sort((a, b) => b.total + areaScore(b.area).score - (a.total + areaScore(a.area).score))[0];
  return threat?.id ?? others[0]?.id ?? me.id;
}
export {
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
  stay
};
