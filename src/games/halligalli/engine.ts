import { shuffle, uid } from "../../lib/shuffle";

export type HalliFruit = "cherry" | "strawberry" | "banana" | "lemon";

export type HalliCard = {
  id: string;
  fruit: HalliFruit;
  count: number;
};

export type HalliPlayer = {
  id: string;
  name: string;
  human: boolean;
  deck: HalliCard[];
  open: HalliCard[];
  score: number;
  out: boolean;
};

export type HalliState = {
  players: HalliPlayer[];
  turn: number;
  phase: "lobby" | "play" | "over";
  winnerId: string | null;
  lastRing: { playerId: string; ok: boolean; fruit: HalliFruit | null; key: string } | null;
  log: Array<{ id: string; text: string }>;
};

export const HALLI_FRUITS: HalliFruit[] = ["cherry", "strawberry", "banana", "lemon"];

export const HALLI_LABEL: Record<HalliFruit, string> = {
  cherry: "Cherry",
  strawberry: "Strawberry",
  banana: "Banana",
  lemon: "Lemon",
};

export const HALLI_EMOJI: Record<HalliFruit, string> = {
  cherry: "🍒",
  strawberry: "🍓",
  banana: "🍌",
  lemon: "🍋",
};

function buildDeck(): HalliCard[] {
  const cards: HalliCard[] = [];
  const counts = [1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5];
  for (const fruit of HALLI_FRUITS) {
    for (const count of counts) {
      cards.push({ id: uid("hg"), fruit, count });
    }
  }
  return shuffle(cards);
}

function emptyPlayer(p: { id: string; name: string; human?: boolean }): HalliPlayer {
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    deck: [],
    open: [],
    score: 0,
    out: false,
  };
}

export function startHalliLobby(people: Array<{ id: string; name: string; human?: boolean }>): HalliState {
  const players = people.slice(0, 4).map(emptyPlayer);
  return {
    players,
    turn: 0,
    phase: "lobby",
    winnerId: null,
    lastRing: null,
    log: [{ id: uid("l"), text: `Table ${players.length}/4. Flip fruit cards. Ring when five of one fruit show.` }],
  };
}

export function startHalliTable(people: Array<{ id: string; name: string; human?: boolean }>): HalliState {
  const seated = people.slice(0, 4);
  if (seated.length < 2) return startHalliLobby(seated);
  const deck = buildDeck();
  const n = seated.length;
  const share = Math.floor(deck.length / n);
  const players: HalliPlayer[] = seated.map((p, i) => ({
    ...emptyPlayer(p),
    deck: deck.slice(i * share, (i + 1) * share),
  }));
  return {
    players,
    turn: 0,
    phase: "play",
    winnerId: null,
    lastRing: null,
    log: [{ id: uid("l"), text: `${players.map((p) => p.name).join(" vs ")}. Flip, then ring on five.` }],
  };
}

const CPU_NAMES = ["CPU", "CPU 2", "CPU 3"];

export function startHalliPractice(seats = 2): HalliState {
  const n = Math.max(2, Math.min(4, Math.floor(seats) || 2));
  const people = Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? "you" : `cpu-${i}`,
    name: i === 0 ? "YOU" : CPU_NAMES[i - 1]!,
    human: i === 0,
  }));
  return startHalliTable(people);
}

export function currentHalli(state: HalliState): HalliPlayer {
  return state.players[state.turn] ?? state.players[0]!;
}

export function topOpen(player: HalliPlayer): HalliCard | null {
  return player.open[player.open.length - 1] ?? null;
}

export function fruitTotals(state: HalliState): Record<HalliFruit, number> {
  const totals: Record<HalliFruit, number> = { cherry: 0, strawberry: 0, banana: 0, lemon: 0 };
  for (const p of state.players) {
    if (p.out) continue;
    const top = topOpen(p);
    if (top) totals[top.fruit] += top.count;
  }
  return totals;
}

export function ringingFruit(state: HalliState): HalliFruit | null {
  const totals = fruitTotals(state);
  for (const fruit of HALLI_FRUITS) {
    if (totals[fruit] === 5) return fruit;
  }
  return null;
}

function nextLivingTurn(state: HalliState, from = state.turn): number {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    const p = state.players[i];
    if (p && !p.out && p.deck.length > 0) return i;
  }
  return from;
}

function finishIfNeeded(state: HalliState): HalliState {
  const active = state.players.filter((p) => !p.out);
  if (active.length <= 1 && active[0]) {
    return {
      ...state,
      phase: "over",
      winnerId: active[0].id,
      log: [...state.log, { id: uid("l"), text: `${active[0].name} wins.` }],
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
      log: [...state.log, { id: uid("l"), text: `${win.name} scores ${win.score} and wins.` }],
    };
  }
  return state;
}

export function flipHalli(state: HalliState, actorId: string): HalliState {
  if (state.phase !== "play") return state;
  const me = currentHalli(state);
  if (me.id !== actorId || me.out) return state;
  if (me.deck.length === 0) {
    return finishIfNeeded({ ...state, turn: nextLivingTurn(state) });
  }
  const card = me.deck[0]!;
  const rest = me.deck.slice(1);
  const players = state.players.map((p) =>
    p.id === me.id ? { ...p, deck: rest, open: [...p.open, card] } : p,
  );
  let next: HalliState = {
    ...state,
    players,
    lastRing: null,
    log: [...state.log, { id: uid("l"), text: `${me.name} flips ${card.count} ${HALLI_LABEL[card.fruit].toLowerCase()}.` }],
  };
  next = finishIfNeeded(next);
  if (next.phase === "over") return next;
  next.turn = nextLivingTurn(next);
  return next;
}

export function ringHalli(state: HalliState, actorId: string): HalliState {
  if (state.phase !== "play") return state;
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor || actor.out) return state;
  const fruit = ringingFruit(state);
  const key = uid("ring");

  if (fruit) {
    let taken = 0;
    const players = state.players.map((p) => {
      if (p.out) return p;
      taken += p.open.length;
      return { ...p, open: [] as HalliCard[] };
    });
    const withScore = players.map((p) => (p.id === actorId ? { ...p, score: p.score + taken } : p));
    let next: HalliState = {
      ...state,
      players: withScore,
      lastRing: { playerId: actorId, ok: true, fruit, key },
      log: [
        ...state.log,
        { id: uid("l"), text: `${actor.name} rings — five ${HALLI_LABEL[fruit].toLowerCase()}! +${taken}.` },
      ],
    };
    next = finishIfNeeded(next);
    if (next.phase === "over") return next;
    if (currentHalli(next).deck.length === 0) next.turn = nextLivingTurn(next);
    return next;
  }

  const others = state.players.filter((p) => p.id !== actorId && !p.out);
  let stock = [...actor.deck];
  const fromOpen = stock.length === 0;
  if (fromOpen) stock = [...actor.open];
  const gifts: HalliCard[] = [];
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
    return gift ? { ...p, open: [...p.open, gift] } : p;
  });
  let next: HalliState = {
    ...state,
    players,
    lastRing: { playerId: actorId, ok: false, fruit: null, key },
    log: [...state.log, { id: uid("l"), text: `${actor.name} rings too early and pays cards.` }],
  };
  next = finishIfNeeded(next);
  if (next.phase === "over") return next;
  if (currentHalli(next).out || currentHalli(next).deck.length === 0) next.turn = nextLivingTurn(next);
  return next;
}

export type HalliAction = { type: "flip" } | { type: "ring" } | { type: "start" };

export function applyHalliAction(state: HalliState, actorId: string, action: HalliAction): HalliState {
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

export function aiHalli(state: HalliState): HalliAction {
  if (ringingFruit(state)) return { type: "ring" };
  return { type: "flip" };
}

export function viewHalli(state: HalliState, viewerId: string): HalliState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === viewerId
        ? p
        : {
            ...p,
            deck: p.deck.map((_, i) => ({ id: `${p.id}-d${i}`, fruit: "cherry" as HalliFruit, count: 0 })),
          },
    ),
  };
}
