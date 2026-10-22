import { uid } from "../../lib/shuffle";

export type EKind = "emperor" | "slave" | "citizen";
export type ERole = "emperor" | "slave";
export type RpsThrow = "rock" | "paper" | "scissors";
export type RpsReveal = { aId: string; a: RpsThrow; bId: string; b: RpsThrow };

export const RPS_REVEAL_MS = 2800;
/** Full match: 12 rounds in 4 sets of 3. */
export const TOTAL_ROUNDS = 12;
export const ROUNDS_PER_SET = 3;
/** Slave-side round win pays 5× an Emperor-side round win. */
export const EMPEROR_WIN_POINTS = 1;
export const SLAVE_WIN_POINTS = 5;

export type ECard = { id: string; kind: EKind };

export type EPlayer = {
  id: string;
  name: string;
  human: boolean;
  role: ERole | null;
  hand: ECard[];
  selectedId: string | null;
  locked: boolean;
};

export type EPhase = "lobby" | "rps" | "role" | "pick" | "reveal" | "over";

export type EState = {
  players: EPlayer[];
  phase: EPhase;
  /** Current round 1..12 (increments when a round is decided). */
  round: number;
  /** Current set 1..4. */
  set: number;
  rpsThrows: Partial<Record<string, RpsThrow>>;
  rpsReveal: RpsReveal | null;
  roleChooserId: string | null;
  last: {
    aId: string;
    a: EKind;
    bId: string;
    b: EKind;
    result: "a" | "b" | "draw" | "round";
    /** Player who won the round (role-based payout already applied). */
    roundWinnerId: string | null;
    /** Which role won the round. */
    winningRole: ERole | null;
  } | null;
  winnerId: string | null;
  /** Cumulative payout score (Emperor win +1, Slave win +5). */
  score: Record<string, number>;
  log: Array<{ id: string; text: string }>;
};

function handFor(role: ERole): ECard[] {
  const special: EKind = role === "emperor" ? "emperor" : "slave";
  return [
    { id: uid("e"), kind: special },
    ...Array.from({ length: 4 }, () => ({ id: uid("e"), kind: "citizen" as const })),
  ];
}

function seat(p: { id: string; name: string; human?: boolean }): EPlayer {
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    role: null,
    hand: [],
    selectedId: null,
    locked: false,
  };
}

export function startEcardLobby(people: Array<{ id: string; name: string; human?: boolean }>): EState {
  const players = people.slice(0, 2).map(seat);
  return {
    players,
    phase: "lobby",
    round: 1,
    set: 1,
    rpsThrows: {},
    rpsReveal: null,
    roleChooserId: null,
    last: null,
    winnerId: null,
    score: Object.fromEntries(players.map((p) => [p.id, 0])),
    log: [
      {
        id: uid("l"),
        text: `Table ${players.length}/2. Open table, add a CPU or invite, then start.`,
      },
    ],
  };
}

export function startEcardDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): EState {
  return beginEcardMatch([a, b]);
}

/** Local guest practice — no lobby / Open table. */
export function startEcardPractice(): EState {
  return startEcardDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}

function beginEcardMatch(people: Array<{ id: string; name: string; human?: boolean }>): EState {
  const players = people.slice(0, 2).map(seat);
  return {
    players,
    phase: "rps",
    round: 1,
    set: 1,
    rpsThrows: {},
    rpsReveal: null,
    roleChooserId: null,
    last: null,
    winnerId: null,
    score: Object.fromEntries(players.map((p) => [p.id, 0])),
    log: [
      {
        id: uid("l"),
        text: `Rock-paper-scissors. Winner picks the opening side. ${TOTAL_ROUNDS} rounds · roles swap every ${ROUNDS_PER_SET}. Emperor beats Citizen +${EMPEROR_WIN_POINTS} and returns. Slave beats Emperor +${SLAVE_WIN_POINTS}.`,
      },
    ],
  };
}

export function cardLabel(kind: EKind) {
  if (kind === "emperor") return "EMPEROR";
  if (kind === "slave") return "SLAVE";
  return "CITIZEN";
}

export function cardArt(kind: EKind) {
  if (kind === "emperor") return "/ecard-emperor.png";
  if (kind === "slave") return "/ecard-slave.png";
  return "/ecard-citizen.png";
}

export function cardBack() {
  return "/ecard-back.png";
}

export type ClashOutcome = {
  result: "a" | "b" | "draw";
  roundEnd: boolean;
  payout: number;
  /** Emperor returns unless it was played onto Slave. */
  recycle: "a" | "b" | null;
};

/**
 * Emperor beats Citizen: +1, Emperor returns, round continues.
 * Citizen vs Citizen: +0, both leave.
 * Citizen beats Slave: +1, round ends.
 * Slave beats Emperor: +5, round ends. Emperor was played on Slave, so it stays out.
 */
export function clash(a: EKind, b: EKind): ClashOutcome {
  if (a === "citizen" && b === "citizen") return { result: "draw", roundEnd: false, payout: 0, recycle: null };
  if (a === "emperor" && b === "citizen") return { result: "a", roundEnd: false, payout: EMPEROR_WIN_POINTS, recycle: "a" };
  if (a === "citizen" && b === "emperor") return { result: "b", roundEnd: false, payout: EMPEROR_WIN_POINTS, recycle: "b" };
  if (a === "citizen" && b === "slave") return { result: "a", roundEnd: true, payout: EMPEROR_WIN_POINTS, recycle: null };
  if (a === "slave" && b === "citizen") return { result: "b", roundEnd: true, payout: EMPEROR_WIN_POINTS, recycle: null };
  if (a === "slave" && b === "emperor") return { result: "a", roundEnd: true, payout: SLAVE_WIN_POINTS, recycle: null };
  if (a === "emperor" && b === "slave") return { result: "b", roundEnd: true, payout: SLAVE_WIN_POINTS, recycle: null };
  return { result: "draw", roundEnd: false, payout: 0, recycle: null };
}

function dealWithRoles(state: EState, r0: ERole, r1: ERole, note: string): EState {
  const p0 = state.players[0]!;
  const p1 = state.players[1]!;
  return {
    ...state,
    players: [
      { ...p0, role: r0, hand: handFor(r0), selectedId: null, locked: false },
      { ...p1, role: r1, hand: handFor(r1), selectedId: null, locked: false },
    ],
    phase: "pick",
    roleChooserId: null,
    rpsThrows: {},
    rpsReveal: null,
    last: null,
    log: [...state.log, { id: uid("l"), text: note }],
  };
}

function refillHands(state: EState, swap: boolean): EState {
  const p0 = state.players[0]!;
  const p1 = state.players[1]!;
  let r0 = p0.role ?? "emperor";
  let r1 = p1.role ?? "slave";
  if (swap) {
    r0 = r0 === "emperor" ? "slave" : "emperor";
    r1 = r1 === "emperor" ? "slave" : "emperor";
  }
  return {
    ...state,
    players: [
      { ...p0, role: r0, hand: handFor(r0), selectedId: null, locked: false },
      { ...p1, role: r1, hand: handFor(r1), selectedId: null, locked: false },
    ],
    phase: "pick",
    last: null,
  };
}

const RPS_LABEL: Record<RpsThrow, string> = { rock: "rock", paper: "paper", scissors: "scissors" };

function rpsWins(a: RpsThrow, b: RpsThrow): boolean {
  return (
    (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
  );
}

function beginRpsReveal(state: EState, aId: string, a: RpsThrow, bId: string, b: RpsThrow): EState {
  return {
    ...state,
    rpsThrows: { [aId]: a, [bId]: b },
    rpsReveal: { aId, a, bId, b },
  };
}

export function finishEcardRps(state: EState): EState {
  if (state.phase !== "rps" || !state.rpsReveal) return state;
  const { aId, a, bId, b } = state.rpsReveal;
  if (a === b) {
    return {
      ...state,
      rpsThrows: {},
      rpsReveal: null,
      log: [...state.log, { id: uid("l"), text: `Tie, both ${RPS_LABEL[a]}. Throw again.` }],
    };
  }
  const winnerId = rpsWins(a, b) ? aId : bId;
  const winner = state.players.find((p) => p.id === winnerId);
  return {
    ...state,
    phase: "role",
    roleChooserId: winnerId,
    rpsThrows: {},
    rpsReveal: null,
    log: [
      ...state.log,
      {
        id: uid("l"),
        text: `${state.players.find((p) => p.id === aId)?.name} ${RPS_LABEL[a]} vs ${state.players.find((p) => p.id === bId)?.name} ${RPS_LABEL[b]}. ${winner?.name || "Winner"} picks Emperor or Slave.`,
      },
    ],
  };
}

function playRps(state: EState, actorId: string, you: RpsThrow): EState {
  if (state.phase !== "rps" || state.rpsReveal) return state;
  const me = state.players.find((p) => p.id === actorId);
  const foe = state.players.find((p) => p.id !== actorId);
  if (!me || !foe) return state;
  if (state.rpsThrows[me.id]) return state;
  if (!foe.human) {
    const ai = (["rock", "paper", "scissors"] as const)[Math.floor(Math.random() * 3)]!;
    return beginRpsReveal(state, me.id, you, foe.id, ai);
  }
  const theirs = state.rpsThrows[foe.id];
  if (!theirs) {
    return {
      ...state,
      rpsThrows: { ...state.rpsThrows, [me.id]: you },
      log: [...state.log, { id: uid("l"), text: `${me.name} is ready. Waiting for the other hand.` }],
    };
  }
  return beginRpsReveal({ ...state, rpsThrows: { ...state.rpsThrows, [me.id]: you } }, me.id, you, foe.id, theirs);
}

export type EAction =
  | { type: "start" }
  | { type: "rps"; throw: RpsThrow }
  | { type: "role"; role: ERole }
  | { type: "select"; cardId: string }
  | { type: "lock" }
  | { type: "next" };

export function applyEcardAction(state: EState, actorId: string, action: EAction): EState {
  if (state.phase === "over") return state;
  const me = state.players.find((p) => p.id === actorId);
  if (!me) return state;

  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      return beginEcardMatch(state.players);
    }
    return state;
  }

  if (state.phase === "rps") {
    if (action.type === "rps") return playRps(state, actorId, action.throw);
    return state;
  }

  if (state.phase === "role") {
    if (action.type !== "role") return state;
    if (state.roleChooserId !== actorId) return state;
    const other = state.players.find((p) => p.id !== actorId);
    if (!other) return state;
    const mine = action.role;
    const theirs: ERole = mine === "emperor" ? "slave" : "emperor";
    const r0 = state.players[0]!.id === actorId ? mine : theirs;
    const r1 = state.players[1]!.id === actorId ? mine : theirs;
    return dealWithRoles(
      state,
      r0,
      r1,
      `${me.name} chooses ${mine.toUpperCase()} · ${other.name} is ${theirs.toUpperCase()}. Round 1/${TOTAL_ROUNDS}.`,
    );
  }

  if (state.phase === "reveal" && action.type === "next") {
    return continueAfterReveal(state);
  }

  if (state.phase !== "pick") return state;

  if (action.type === "select") {
    if (me.locked) return state;
    if (!me.hand.some((c) => c.id === action.cardId)) return state;
    return {
      ...state,
      players: state.players.map((p) => (p.id === actorId ? { ...p, selectedId: action.cardId } : p)),
    };
  }

  if (action.type === "lock") {
    if (!me.selectedId || me.locked) return state;
    const next: EState = {
      ...state,
      players: state.players.map((p) => (p.id === actorId ? { ...p, locked: true } : p)),
      log: [...state.log, { id: uid("l"), text: `${me.name} locks a card.` }],
    };
    if (!next.players.every((p) => p.locked && p.selectedId)) return next;
    return reveal(next);
  }

  return state;
}

function clashLine(a: EKind, b: EKind, winnerName: string): string {
  const who = winnerName ? `${winnerName} · ` : "";
  if (a === "citizen" && b === "citizen") return "Citizen vs Citizen +0.";
  if ((a === "emperor" && b === "citizen") || (a === "citizen" && b === "emperor")) {
    return `${who}Emperor beats Citizen +${EMPEROR_WIN_POINTS}. Emperor returns.`;
  }
  if ((a === "slave" && b === "emperor") || (a === "emperor" && b === "slave")) {
    return `${who}Slave beats Emperor +${SLAVE_WIN_POINTS}.`;
  }
  return `${who}Citizen beats Slave +${EMPEROR_WIN_POINTS}.`;
}

function reveal(state: EState): EState {
  const a = state.players[0]!;
  const b = state.players[1]!;
  const ca = a.hand.find((c) => c.id === a.selectedId)!;
  const cb = b.hand.find((c) => c.id === b.selectedId)!;
  const outcome = clash(ca.kind, cb.kind);
  const { result, roundEnd, payout, recycle } = outcome;
  let log = [
    ...state.log,
    {
      id: uid("l"),
      text: `${a.name} plays ${cardLabel(ca.kind)} · ${b.name} plays ${cardLabel(cb.kind)}.`,
    },
  ];

  const players = state.players.map((p) => {
    const mine = p.id === a.id ? ca : cb;
    const side = p.id === a.id ? "a" : "b";
    const hand = recycle === side ? p.hand : p.hand.filter((c) => c.id !== mine.id);
    return { ...p, hand, selectedId: null, locked: false };
  });

  let score = { ...state.score };
  let roundWinnerId: string | null = null;
  let winningRole: ERole | null = null;
  const winner = result === "a" ? a : result === "b" ? b : null;
  if (winner && payout > 0) {
    const winCard = result === "a" ? ca.kind : cb.kind;
    winningRole = winCard === "slave" ? "slave" : "emperor";
    roundWinnerId = winner.id;
    score[roundWinnerId] = (score[roundWinnerId] || 0) + payout;
  }
  log = [
    ...log,
    {
      id: uid("l"),
      text: `${clashLine(ca.kind, cb.kind, winner?.name ?? "")} (${score[a.id] || 0}–${score[b.id] || 0}).`,
    },
  ];

  return {
    ...state,
    players,
    phase: "reveal",
    last: {
      aId: a.id,
      a: ca.kind,
      bId: b.id,
      b: cb.kind,
      result: roundEnd ? "round" : result,
      roundWinnerId,
      winningRole,
    },
    score,
    log,
  };
}

function finishMatch(state: EState): EState {
  const p0 = state.players[0]!;
  const p1 = state.players[1]!;
  const s0 = state.score[p0.id] || 0;
  const s1 = state.score[p1.id] || 0;
  let winnerId: string | null = null;
  let text = `Final ${s0}–${s1}. `;
  if (s0 > s1) {
    winnerId = p0.id;
    text += `${p0.name} wins the match.`;
  } else if (s1 > s0) {
    winnerId = p1.id;
    text += `${p1.name} wins the match.`;
  } else {
    text += "Draw.";
  }
  return {
    ...state,
    phase: "over",
    winnerId,
    log: [...state.log, { id: uid("l"), text }],
  };
}

function continueAfterReveal(state: EState): EState {
  if (state.phase === "over") return state;

  // Citizen cancel — keep hands, stay in this round.
  if (state.last?.result !== "round") {
    return { ...state, phase: "pick", last: null };
  }

  // Round decided — reclaim cards for next round (or end after 12).
  if (state.round >= TOTAL_ROUNDS) {
    return finishMatch(state);
  }

  const nextRound = state.round + 1;
  const swap = state.round % ROUNDS_PER_SET === 0;
  const nextSet = swap ? state.set + 1 : state.set;
  const next = refillHands(state, swap);
  return {
    ...next,
    round: nextRound,
    set: nextSet,
    log: [
      ...state.log,
      {
        id: uid("l"),
        text: swap
          ? `Set ${state.set} done. Roles swap. ${next.players[0]!.name} is ${next.players[0]!.role?.toUpperCase()}. Round ${nextRound}/${TOTAL_ROUNDS}.`
          : `Cards reclaimed. Round ${nextRound}/${TOTAL_ROUNDS}.`,
      },
    ],
  };
}

export function viewEcard(state: EState, viewerId: string): EState {
  const throws = state.rpsThrows || {};
  const id = String(viewerId || "");
  return {
    ...state,
    rpsThrows: state.rpsReveal
      ? { [state.rpsReveal.aId]: state.rpsReveal.a, [state.rpsReveal.bId]: state.rpsReveal.b }
      : throws[id]
        ? { [id]: throws[id] }
        : {},
    rpsReveal: state.rpsReveal ?? null,
    score: state.score || {},
    players: (state.players || []).map((p) => {
      if (p.id === id || state.phase === "reveal" || state.phase === "over" || state.phase === "rps" || state.phase === "role") {
        return p;
      }
      return {
        ...p,
        hand: (p.hand || []).map((c) => ({ id: c.id, kind: "citizen" as const })),
        selectedId: p.locked ? "ready" : null,
      };
    }),
  };
}

function pickWeighted(weights: Array<{ card: ECard; w: number }>): ECard {
  const floor = weights.map((x) => ({ card: x.card, w: Math.max(0.01, x.w) }));
  const sum = floor.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * sum;
  for (const x of floor) {
    r -= x.w;
    if (r <= 0) return x.card;
  }
  return floor[floor.length - 1]!.card;
}

function seriesPressure(state: EState, meId: string, rivalId: string) {
  const mine = state.score[meId] || 0;
  const theirs = state.score[rivalId] || 0;
  const remaining = TOTAL_ROUNDS - state.round + 1;
  return {
    mine,
    theirs,
    behind: mine < theirs,
    late: remaining <= 3,
    remaining,
  };
}

function aiPickEmperor(me: EPlayer, rivalHandSize: number, pressure: ReturnType<typeof seriesPressure>): ECard {
  const citizens = me.hand.filter((c) => c.kind === "citizen");
  const special = me.hand.find((c) => c.kind === "emperor")!;
  if (rivalHandSize <= 1 && citizens[0]) return citizens[0];
  if (!citizens.length) return special;

  const pSlave = 1 / Math.max(1, rivalHandSize);
  // E vs C is +1 and Emperor returns. E vs S pays the rival +5 and spends Emperor.
  let wCitizen = 1.1 + pSlave * 4.0 + citizens.length * 0.1;
  let wEmperor = 1.6 + (1 - pSlave) * 2.8 - pSlave * 7.0;

  if (me.hand.length >= 4) {
    wCitizen += 0.5;
    wEmperor -= 0.2;
  }
  if (rivalHandSize <= 2) {
    wEmperor -= 2.0;
    wCitizen += 1.4;
  }
  if (pressure.behind) wEmperor += 0.35;
  if (pressure.late) wEmperor -= 0.25;

  wCitizen *= 0.85 + Math.random() * 0.3;
  wEmperor *= 0.85 + Math.random() * 0.3;

  return pickWeighted([
    ...citizens.map((c) => ({ card: c, w: wCitizen / citizens.length })),
    { card: special, w: wEmperor },
  ]);
}

function aiPickSlave(me: EPlayer, rivalHandSize: number, pressure: ReturnType<typeof seriesPressure>): ECard {
  const citizens = me.hand.filter((c) => c.kind === "citizen");
  const special = me.hand.find((c) => c.kind === "slave")!;
  if (rivalHandSize <= 1) return special;
  if (!citizens.length) return special;

  const pEmperor = 1 / Math.max(1, rivalHandSize);
  // Slave win is worth 5× — spring the trap when Emperor denser.
  let wCitizen = 1.15 + (1 - pEmperor) * 1.2 + citizens.length * 0.1;
  let wSlave = 0.4 + pEmperor * 5.0 - (1 - pEmperor) * 3.5;

  if (me.hand.length >= 4) {
    wCitizen += 0.9;
    wSlave -= 0.7;
  }
  if (rivalHandSize <= 2) {
    wSlave += 2.2;
    wCitizen -= 0.4;
  }
  if (pressure.behind || pressure.late) wSlave += 1.0;

  wCitizen *= 0.85 + Math.random() * 0.3;
  wSlave *= 0.85 + Math.random() * 0.3;

  return pickWeighted([
    ...citizens.map((c) => ({ card: c, w: wCitizen / citizens.length })),
    { card: special, w: wSlave },
  ]);
}

export function aiEcard(state: EState, cpuId: string): EAction {
  const me = state.players.find((p) => p.id === cpuId);
  if (!me) return { type: "lock" };
  const rival = state.players.find((p) => p.id !== cpuId);

  if (state.phase === "rps") {
    if (state.rpsReveal || state.rpsThrows[cpuId]) return { type: "rps", throw: "rock" };
    const hand = (["rock", "paper", "scissors"] as const)[Math.floor(Math.random() * 3)]!;
    return { type: "rps", throw: hand };
  }

  if (state.phase === "role") {
    if (state.roleChooserId !== cpuId) return { type: "role", role: "emperor" };
    // Prefer Slave slightly for the 5× payout upside.
    const role: ERole = Math.random() < 0.45 ? "emperor" : "slave";
    return { type: "role", role };
  }

  if (state.phase === "reveal") return { type: "next" };
  if (me.locked) return { type: "lock" };
  if (!me.selectedId) {
    if (!rival || !me.role) return { type: "select", cardId: me.hand[0]!.id };
    const pressure = seriesPressure(state, me.id, rival.id);
    const card =
      me.role === "emperor"
        ? aiPickEmperor(me, rival.hand.length, pressure)
        : aiPickSlave(me, rival.hand.length, pressure);
    return { type: "select", cardId: card.id };
  }
  return { type: "lock" };
}
