import { shuffle, uid } from "../../lib/shuffle";

export type FlipKind = "number" | "plus" | "double" | "freeze" | "flip3" | "chance";

export type FlipCard = {
  id: string;
  kind: FlipKind;
  value?: number;
};

export type FlipPlayer = {
  id: string;
  name: string;
  human: boolean;
  total: number;
  area: FlipCard[];
  status: "active" | "stayed" | "bust" | "flip7";
  pendingFreeze: boolean;
  pendingFlip3: number;
};

export type FlipPhase = "action" | "target" | "roundEnd" | "over";

export type FlipLog = { id: string; text: string; tone?: "you" | "ai" | "bad" };

export type FlipState = {
  players: FlipPlayer[];
  deck: FlipCard[];
  discard: FlipCard[];
  turn: number;
  round: number;
  phase: FlipPhase;
  pendingAction: "freeze" | "flip3" | null;
  lastCard: FlipCard | null;
  winnerId: string | null;
  log: FlipLog[];
  goal: number;
};

function deckBuild(): FlipCard[] {
  const cards: FlipCard[] = [];
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

export function cardLabel(card: FlipCard): string {
  if (card.kind === "number") return String(card.value);
  if (card.kind === "plus") return `+${card.value}`;
  if (card.kind === "double") return "×2";
  if (card.kind === "freeze") return "FREEZE";
  if (card.kind === "flip3") return "FLIP 3";
  return "2ND";
}

export function areaScore(area: FlipCard[]): { score: number; numbers: number; flip7: boolean } {
  const numbers = area.filter((c) => c.kind === "number");
  const plus = area.filter((c) => c.kind === "plus").reduce((s, c) => s + (c.value ?? 0), 0);
  const doubles = area.filter((c) => c.kind === "double").length;
  let score = numbers.reduce((s, c) => s + (c.value ?? 0), 0) + plus;
  for (let i = 0; i < doubles; i++) score *= 2;
  const flip7 = new Set(numbers.map((c) => c.value)).size >= 7;
  if (flip7) score += 15;
  return { score, numbers: numbers.length, flip7 };
}

export function startFlip7(): FlipState {
  return {
    players: [
      { id: uid("p"), name: "YOU", human: true, total: 0, area: [], status: "active", pendingFreeze: false, pendingFlip3: 0 },
      { id: uid("p"), name: "RIVAL A", human: false, total: 0, area: [], status: "active", pendingFreeze: false, pendingFlip3: 0 },
      { id: uid("p"), name: "RIVAL B", human: false, total: 0, area: [], status: "active", pendingFreeze: false, pendingFlip3: 0 },
    ],
    deck: deckBuild(),
    discard: [],
    turn: 0,
    round: 1,
    phase: "action",
    pendingAction: null,
    lastCard: null,
    winnerId: null,
    goal: 200,
    log: [{ id: uid("l"), text: "第一轮。Hit 继续，Stay 锁分。先到 200。" }],
  };
}

export function currentFlip(state: FlipState): FlipPlayer {
  return state.players[state.turn] ?? state.players[0]!;
}

function takeCard(state: FlipState): { state: FlipState; card: FlipCard } {
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

function withPlayer(state: FlipState, id: string, fn: (p: FlipPlayer) => FlipPlayer): FlipState {
  return { ...state, players: state.players.map((p) => (p.id === id ? fn(p) : p)) };
}

export function hit(state: FlipState): FlipState {
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
      next.log = [...next.log, { id: uid("l"), text: `${me.name} 触发重复 ${card.value}，消耗 Second Chance。`, tone: whoTone }];
      return afterHit(next, me.id);
    }
    next = withPlayer(next, me.id, (p) => ({ ...p, area: [], status: "bust", pendingFlip3: 0 }));
    next.discard = [...next.discard, ...me.area, card];
    next.log = [...next.log, { id: uid("l"), text: `${me.name} 爆牌（重复 ${card.value}），本轮 0 分。`, tone: "bad" }];
    return advance(next);
  }

  next = withPlayer(next, me.id, (p) => ({
    ...p,
    area: [...p.area, card],
    pendingFlip3: Math.max(0, p.pendingFlip3 - 1),
  }));
  next.log = [...next.log, { id: uid("l"), text: `${me.name} 翻开 ${cardLabel(card)}。`, tone: whoTone }];

  if (card.kind === "freeze" || card.kind === "flip3") {
    return { ...next, phase: "target", pendingAction: card.kind };
  }
  return afterHit(next, me.id);
}

function afterHit(state: FlipState, playerId: string): FlipState {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;
  const scored = areaScore(me.area);
  if (scored.flip7) {
    let next = withPlayer(state, me.id, (p) => ({
      ...p,
      status: "flip7" as const,
      total: p.total + scored.score,
      area: [],
    }));
    next.discard = [...next.discard, ...me.area];
    next.log = [...next.log, { id: uid("l"), text: `${me.name} Flip 7！+${scored.score}（含 15 暴击）。`, tone: "you" }];
    next = checkWin(next, me.id);
    if (next.phase === "over") return next;
    return advance(next);
  }
  return { ...state, phase: "action" };
}

export function stay(state: FlipState): FlipState {
  if (state.phase !== "action") return state;
  const me = currentFlip(state);
  if (me.pendingFlip3 > 0) return hit(state);
  const scored = areaScore(me.area).score;
  let next = withPlayer(state, me.id, (p) => ({ ...p, area: [], status: "stayed", total: p.total + scored }));
  next.discard = [...next.discard, ...me.area];
  next.log = [...next.log, { id: uid("l"), text: `${me.name} 停牌，本轮 +${scored}。`, tone: me.human ? "you" : "ai" }];
  next = checkWin(next, me.id);
  if (next.phase === "over") return next;
  return advance(next);
}

export function applyTarget(state: FlipState, targetId: string): FlipState {
  if (state.phase !== "target" || !state.pendingAction) return state;
  const me = currentFlip(state);
  const action = state.pendingAction;
  let next = state;
  if (action === "freeze") {
    next = withPlayer(next, targetId, (p) => ({ ...p, pendingFreeze: true }));
    next.log = [...next.log, { id: uid("l"), text: `${me.name} 对 ${nameOf(state, targetId)} 使用 Freeze。` }];
  } else {
    next = withPlayer(next, targetId, (p) => ({ ...p, pendingFlip3: p.pendingFlip3 + 3 }));
    next.log = [...next.log, { id: uid("l"), text: `${me.name} 对 ${nameOf(state, targetId)} 使用 Flip Three。` }];
  }
  next.pendingAction = null;
  next.phase = "action";
  return afterHit(next, me.id);
}

function nameOf(state: FlipState, id: string) {
  return state.players.find((p) => p.id === id)?.name ?? "?";
}

function checkWin(state: FlipState, playerId: string): FlipState {
  const p = state.players.find((x) => x.id === playerId);
  if (p && p.total >= state.goal) {
    return {
      ...state,
      phase: "over",
      winnerId: p.id,
      log: [...state.log, { id: uid("l"), text: `${p.name} 达到 ${p.total}，胜出。`, tone: "you" }],
    };
  }
  return state;
}

function allSettled(state: FlipState) {
  return state.players.every((p) => p.status !== "active");
}

function newRound(state: FlipState): FlipState {
  const discard = [...state.discard, ...state.players.flatMap((p) => p.area)];
  const players = state.players.map((p) => ({
    ...p,
    area: [],
    status: "active" as const,
  }));
  return {
    ...state,
    players,
    discard,
    round: state.round + 1,
    turn: (state.round) % state.players.length,
    phase: "action",
    lastCard: null,
    log: [...state.log, { id: uid("l"), text: `第 ${state.round + 1} 轮开始。` }],
  };
}

export function advance(state: FlipState): FlipState {
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
        total: x.total + scored,
      }));
      next.log = [...next.log, { id: uid("l"), text: `${p.name} 被冻结，强制停牌 +${scored}。` }];
      next = checkWin(next, p.id);
      if (next.phase === "over") return next;
      next.turn = i;
      return advance(next);
    }
    return { ...state, turn: i, phase: "action" };
  }
  return newRound(state);
}

export function aiDecide(state: FlipState): "hit" | "stay" {
  const me = currentFlip(state);
  if (me.pendingFlip3 > 0) return "hit";
  const { score, numbers } = areaScore(me.area);
  if (numbers >= 6) return "stay";
  if (score >= 23 && numbers >= 4) return "stay";
  if (score >= 18 && numbers >= 5) return "stay";
  if (me.area.length === 0) return "hit";
  return "hit";
}

export function aiTarget(state: FlipState): string {
  const me = currentFlip(state);
  const others = state.players.filter((p) => p.id !== me.id);
  const threat = [...others].sort((a, b) => b.total + areaScore(b.area).score - (a.total + areaScore(a.area).score))[0];
  return threat?.id ?? others[0]?.id ?? me.id;
}
