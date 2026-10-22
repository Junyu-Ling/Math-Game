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
var FLIP_MAX = 16;
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
function liveTotal(p) {
  if (p.status === "active") return p.total + areaScore(p.area).score;
  return p.total;
}
function numberPower(area) {
  return area.filter((c) => c.kind === "number").reduce((s, c) => s + (c.value ?? 0), 0);
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
    pendingFlip3: 0,
    skipTurn: false
  };
}
function startFlip7Lobby(people) {
  const players = people.slice(0, FLIP_MAX).map(emptySeat);
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
    resume: [],
    burst: null,
    log: [{ id: uid("l"), text: `Table ${players.length}. Add CPUs or invite, then start with 2+ players.` }]
  };
}
function startFlip7Table(people) {
  const seated = people.slice(0, FLIP_MAX);
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
    resume: [],
    burst: null,
    log: [{ id: uid("l"), text: `${players.map((p) => p.name).join(" \xB7 ")}. Hit / Stay. First to 200.` }]
  };
}
function startFlip7Duel(a, b) {
  return startFlip7Table([a, b]);
}
var CPU_NAMES = ["CPU", "CPU 2", "CPU 3", "CPU 4", "CPU 5", "CPU 6", "CPU 7", "CPU 8", "CPU 9", "CPU 10", "CPU 11", "CPU 12", "CPU 13", "CPU 14", "CPU 15"];
function startFlip7(seats = 2) {
  const n = Math.max(1, Math.min(FLIP_MAX, Math.floor(seats) || 2));
  return startFlip7Table(
    Array.from({ length: n }, (_, i) => ({
      id: i === 0 ? "you" : `cpu-${i}`,
      name: i === 0 ? "YOU" : CPU_NAMES[i - 1],
      human: i === 0
    }))
  );
}
function startFlip7Practice() {
  return startFlip7(2);
}
function startFlip7Solo() {
  const state = startFlip7(1);
  return {
    ...state,
    record: { rounds: [{ round: 1, draws: [] }] },
    log: [{ id: uid("l"), text: "Solo practice. Hit or stay. First to 200. Freeze and Flip Three land on you." }]
  };
}
function numberSum(area) {
  return area.filter((c) => c.kind === "number").reduce((sum, c) => sum + (c.value ?? 0), 0);
}
function pushDraw(state, card, note, at) {
  if (!state.record || card.kind !== "number") return state;
  const draw = {
    id: card.id,
    kind: card.kind,
    value: card.value,
    ...note ? { note } : {},
    ...at != null ? { at } : {}
  };
  const rounds = state.record.rounds;
  const last = rounds[rounds.length - 1];
  const nextRounds = last && !last.result ? rounds.map((r, i) => i === rounds.length - 1 ? { ...r, draws: [...r.draws, draw] } : r) : [...rounds, { round: state.round, draws: [draw] }];
  return { ...state, record: { rounds: nextRounds } };
}
function sealRecord(state, result, score) {
  if (!state.record) return state;
  const rounds = state.record.rounds;
  if (!rounds.length) {
    return { ...state, record: { rounds: [{ round: state.round, draws: [], result, score }] } };
  }
  return {
    ...state,
    record: {
      rounds: rounds.map((r, i) => i === rounds.length - 1 && !r.result ? { ...r, result, score } : r)
    }
  };
}
function openRecordRound(state) {
  if (!state.record) return state;
  const rounds = state.record.rounds;
  const last = rounds[rounds.length - 1];
  if (last && last.round === state.round && !last.result) return state;
  return { ...state, record: { rounds: [...rounds, { round: state.round, draws: [] }] } };
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
  if (me.status !== "active") return handoff(state);
  const pulled = takeCard({ ...state, burst: null });
  const card = pulled.card;
  let next = pulled.state;
  next.lastCard = card;
  const numbers = me.area.filter((c) => c.kind === "number").map((c) => c.value);
  const bust = card.kind === "number" && numbers.includes(card.value);
  const whoTone = me.human ? "you" : "ai";
  if (bust) {
    const at = numberSum(me.area);
    const chance = me.area.find((c) => c.kind === "chance");
    if (chance) {
      const area = me.area.filter((c) => c.id !== chance.id);
      next = withPlayer(next, me.id, (p) => ({ ...p, area, pendingFlip3: Math.max(0, p.pendingFlip3 - 1) }));
      next = pushDraw(next, card, "saved", at);
      next.discard = [...next.discard, chance, card];
      next.burst = { playerId: me.id, id: uid("boom"), kind: "save", saveCard: chance };
      next.log = [...next.log, { id: uid("l"), text: `${me.name} hits a duplicate ${card.value}. Second Chance saves the round.`, tone: whoTone }];
      return afterHit(next, me.id);
    }
    next = withPlayer(next, me.id, (p) => ({ ...p, area: [], status: "bust", pendingFlip3: 0 }));
    next = sealRecord(pushDraw(next, card, "bust", at), "bust", 0);
    next.discard = [...next.discard, ...me.area, card];
    next.burst = { playerId: me.id, id: uid("boom"), kind: "bust" };
    next.log = [...next.log, { id: uid("l"), text: `${me.name} busts (duplicate ${card.value}). Round scores 0.`, tone: "bad" }];
    return handoff(next);
  }
  if (card.kind === "chance" && hasSecondChance(me.area)) {
    next = withPlayer(next, me.id, (p) => ({ ...p, pendingFlip3: Math.max(0, p.pendingFlip3 - 1) }));
    next = pushDraw(next, card, "discard");
    next.discard = [...next.discard, card];
    next.log = [...next.log, { id: uid("l"), text: `${me.name} already has Second Chance. The extra is discarded.`, tone: whoTone }];
    return afterHit(next, me.id);
  }
  next = pushDraw(next, card);
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
    next.burst = { playerId: me.id, id: uid("boom"), kind: "flip7" };
    next = sealRecord(next, "flip7", scored.score);
    next.log = [...next.log, { id: uid("l"), text: `${me.name} Flip 7! +${scored.score} (includes +15 bonus).`, tone: "you" }];
    next = checkWin(next, me.id);
    if (next.phase === "over") return next;
    return handoff({ ...next, turn: idx });
  }
  const parked = { ...state, turn: Math.max(0, idx), phase: "action" };
  if (me.pendingFlip3 > 0 && me.status === "active") return parked;
  return handoff(parked);
}
function stay(state) {
  if (state.phase !== "action") return state;
  const me = currentFlip(state);
  if (me.pendingFlip3 > 0) return hit(state);
  const scored = areaScore(me.area).score;
  let next = withPlayer({ ...state, burst: null }, me.id, (p) => ({ ...p, area: [], status: "stayed", total: p.total + scored }));
  next = sealRecord(next, "stay", scored);
  next.discard = [...next.discard, ...me.area];
  next.log = [...next.log, { id: uid("l"), text: `${me.name} stays. Round +${scored}.`, tone: me.human ? "you" : "ai" }];
  next = checkWin(next, me.id);
  if (next.phase === "over") return next;
  return handoff(next);
}
function handoff(state) {
  const stack = state.resume ?? [];
  if (!stack.length) return advance(state);
  const back = stack[stack.length - 1];
  const restored = {
    ...state,
    turn: back,
    resume: stack.slice(0, -1),
    phase: "action",
    pendingAction: null
  };
  const caster = restored.players[back];
  if (caster && caster.status === "active" && caster.pendingFlip3 > 0) return restored;
  return advance(restored);
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
    next = sealRecord(next, "freeze", scored);
    next.burst = { playerId: target.id, id: uid("boom"), kind: "freeze" };
    next.log = [
      ...next.log,
      {
        id: uid("l"),
        text: `${onSelf ? `${me.name} freezes themselves and banks +${scored}.` : `${me.name} freezes ${target.name} \xB7 +${scored}.`}${hadChance ? " Second Chance cannot block Freeze." : ""}`
      }
    ];
    next.pendingAction = null;
    next.phase = "action";
    next = checkWin(next, target.id);
    if (next.phase === "over") return next;
    return afterHit(next, me.id);
  }
  next = withPlayer(next, target.id, (p) => ({
    ...p,
    pendingFlip3: p.pendingFlip3 + 3,
    skipTurn: onSelf ? p.skipTurn : true
  }));
  next.log = [
    ...next.log,
    {
      id: uid("l"),
      text: onSelf ? `${me.name} uses Flip Three on themselves and flips three now.` : `${me.name} uses Flip Three on ${target.name}. ${target.name} flips three now.`
    }
  ];
  next.pendingAction = null;
  next.phase = "action";
  if (!onSelf) {
    const targetIdx = next.players.findIndex((p) => p.id === target.id);
    const myIdx = Math.max(0, next.players.findIndex((p) => p.id === me.id));
    if (targetIdx >= 0) {
      return { ...next, turn: targetIdx, resume: [...next.resume ?? [], myIdx] };
    }
  }
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
  const totals = state.players.map((p) => `${p.name} ${p.total}`).join(" \xB7 ");
  const players = state.players.map((p) => ({
    ...p,
    area: [],
    status: "active",
    pendingFreeze: false,
    pendingFlip3: 0,
    skipTurn: false
  }));
  return openRecordRound({
    ...state,
    players,
    discard,
    resume: [],
    // Keep bust/freeze/flip7 FX so the UI can finish animating into the next round.
    burst: state.burst,
    round: state.round + 1,
    turn: state.round % state.players.length,
    phase: "action",
    lastCard: null,
    log: [
      ...state.log,
      { id: uid("l"), text: `Round complete. Scores kept: ${totals}.` },
      { id: uid("l"), text: `Round ${state.round + 1} starts.` }
    ]
  });
}
function clearSkip(state, ids) {
  if (!ids.length) return state;
  const skip = new Set(ids);
  return { ...state, players: state.players.map((p) => skip.has(p.id) ? { ...p, skipTurn: false } : p) };
}
function advance(state) {
  if (state.phase === "over") return state;
  if (allSettled(state)) return newRound(state);
  let i = state.turn;
  const skipped = [];
  for (let n = 0; n < state.players.length; n++) {
    i = (i + 1) % state.players.length;
    const p = state.players[i];
    if (!p || p.status !== "active") continue;
    if (p.skipTurn) {
      skipped.push(p.id);
      continue;
    }
    const next = clearSkip(state, skipped);
    if (p.pendingFreeze) {
      const scored = areaScore(p.area).score;
      let frozen = withPlayer(next, p.id, (x) => ({
        ...x,
        pendingFreeze: false,
        status: "stayed",
        total: x.total + scored
      }));
      frozen.log = [...frozen.log, { id: uid("l"), text: `${p.name} is frozen and must stay +${scored}.` }];
      frozen = checkWin(frozen, p.id);
      if (frozen.phase === "over") return frozen;
      frozen.turn = i;
      return advance(frozen);
    }
    return { ...next, turn: i, phase: "action" };
  }
  const pendingSkips = state.players.filter((p) => p.status === "active" && p.skipTurn).map((p) => p.id);
  if (pendingSkips.length) return advance(clearSkip(state, pendingSkips));
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
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
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
    if (mine.score >= 20 || mine.numbers >= 6) return me.id;
    const threat = [...others].sort((a, b) => {
      const sa = liveTotal(a) + (hasSecondChance(a.area) ? 40 : 0);
      const sb = liveTotal(b) + (hasSecondChance(b.area) ? 40 : 0);
      return sb - sa || areaScore(b.area).score - areaScore(a.area).score;
    })[0];
    return threat?.id ?? me.id;
  }
  if (mine.numbers <= 2 && mine.score <= 10) return me.id;
  const fat = [...others].sort((a, b) => numberPower(b.area) - numberPower(a.area) || areaScore(b.area).numbers - areaScore(a.area).numbers)[0];
  if (!fat || numberPower(fat.area) < 8 && mine.numbers < 5) return me.id;
  return fat.id;
}
export {
  FLIP_MAX,
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
  liveTotal,
  numberPower,
  startFlip7,
  startFlip7Duel,
  startFlip7Lobby,
  startFlip7Practice,
  startFlip7Solo,
  startFlip7Table,
  stay,
  viewFlip7
};
