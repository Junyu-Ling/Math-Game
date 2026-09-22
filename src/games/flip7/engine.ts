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
  burst: { playerId: string; id: string } | null;
};

function deckBuild(): FlipCard[] {
  const cards: FlipCard[] = [];
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

export function startFlip7Duel(a: { id: string; name: string }, b: { id: string; name: string }): FlipState {
  const seat = (p: { id: string; name: string }): FlipPlayer => ({
    id: p.id,
    name: p.name,
    human: true,
    total: 0,
    area: [],
    status: "active",
    pendingFreeze: false,
    pendingFlip3: 0,
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
    burst: null,
    log: [{ id: uid("l"), text: `${a.name} vs ${b.name}. Hit / Stay. First to 200.` }],
  };
}

export function startFlip7(): FlipState {
  const you = { id: uid("you"), name: "YOU" };
  const cpu = { id: uid("cpu"), name: "CPU" };
  const state = startFlip7Duel(you, cpu);
  return {
    ...state,
    players: state.players.map((p) => (p.id === cpu.id ? { ...p, human: false } : p)),
    log: [{ id: uid("l"), text: "Practice vs CPU. Hit / Stay. First to 200." }],
  };
}

export function viewFlip7(state: FlipState, _viewerId: string): FlipState {
  return state;
}

export function currentFlip(state: FlipState): FlipPlayer {
  return state.players[state.turn] ?? state.players[0]!;
}

export function activePlayers(state: FlipState): FlipPlayer[] {
  return state.players.filter((p) => p.status === "active");
}

function hasSecondChance(area: FlipCard[]): boolean {
  return area.some((c) => c.kind === "chance");
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
      next.log = [...next.log, { id: uid("l"), text: `${me.name} hits a duplicate ${card.value}. Second Chance saves the round.`, tone: whoTone }];
      return afterHit(next, me.id);
    }
    next = withPlayer(next, me.id, (p) => ({ ...p, area: [], status: "bust", pendingFlip3: 0 }));
    next.discard = [...next.discard, ...me.area, card];
    next.burst = { playerId: me.id, id: uid("boom") };
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
    pendingFlip3: Math.max(0, p.pendingFlip3 - 1),
  }));
  next.log = [...next.log, { id: uid("l"), text: `${me.name} flips ${cardLabel(card)}.`, tone: whoTone }];

  if (card.kind === "freeze" || card.kind === "flip3") {
    const aimed: FlipState = { ...next, phase: "target", pendingAction: card.kind };
    const live = activePlayers(aimed);
    if (live.length <= 1) return applyTarget(aimed, me.id);
    return aimed;
  }
  return afterHit(next, me.id);
}

function afterHit(state: FlipState, playerId: string): FlipState {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return state;
  const scored = areaScore(me.area);
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (scored.flip7) {
    let next = withPlayer(state, me.id, (p) => ({
      ...p,
      status: "flip7" as const,
      total: p.total + scored.score,
      area: [],
    }));
    next.discard = [...next.discard, ...me.area];
    next.log = [...next.log, { id: uid("l"), text: `${me.name} Flip 7! +${scored.score} (includes +15).`, tone: "you" }];
    next = checkWin(next, me.id);
    if (next.phase === "over") return next;
    return advance({ ...next, turn: idx });
  }
  const parked = { ...state, turn: Math.max(0, idx), phase: "action" as const };
  if (me.pendingFlip3 > 0) return parked;
  return advance(parked);
}

export function stay(state: FlipState): FlipState {
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

export function applyTarget(state: FlipState, targetId: string): FlipState {
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
      area: [],
    }));
    next.discard = [...next.discard, ...target.area];
    next.log = [
      ...next.log,
      {
        id: uid("l"),
        text: `${
          onSelf ? `${me.name} freezes themselves and banks +${scored}.` : `${me.name} freezes ${target.name} · +${scored}.`
        }${hadChance ? " Second Chance cannot block Freeze." : ""}`,
      },
    ];
  } else {
    next = withPlayer(next, target.id, (p) => ({ ...p, pendingFlip3: p.pendingFlip3 + 3 }));
    next.log = [
      ...next.log,
      {
        id: uid("l"),
        text: onSelf ? `${me.name} uses Flip Three on themselves.` : `${me.name} uses Flip Three on ${target.name}.`,
      },
    ];
  }
  next.pendingAction = null;
  next.phase = "action";
  return afterHit(next, me.id);
}

function checkWin(state: FlipState, playerId: string): FlipState {
  const p = state.players.find((x) => x.id === playerId);
  if (p && p.total >= state.goal) {
    return {
      ...state,
      phase: "over",
      winnerId: p.id,
      log: [...state.log, { id: uid("l"), text: `${p.name} reaches ${p.total} and wins.`, tone: "you" }],
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
    pendingFreeze: false,
    pendingFlip3: 0,
  }));
  return {
    ...state,
    players,
    discard,
    round: state.round + 1,
    turn: (state.round) % state.players.length,
    phase: "action",
    lastCard: null,
    log: [...state.log, { id: uid("l"), text: `Round ${state.round + 1} starts.` }],
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

export type FlipAction =
  | { type: "hit" }
  | { type: "stay" }
  | { type: "target"; targetId: string };

export function applyFlipAction(state: FlipState, actorId: string, action: FlipAction): FlipState {
  if (!state.players.some((p) => p.id === actorId)) return state;
  const cur = currentFlip(state);
  if (cur.id !== actorId) return state;
  if (action.type === "hit") return hit(state);
  if (action.type === "stay") return stay(state);
  if (action.type === "target") return applyTarget(state, action.targetId);
  return state;
}

export function aiTarget(state: FlipState): string {
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
