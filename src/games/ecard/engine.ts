import { uid } from "../../lib/shuffle";

export type EKind = "emperor" | "slave" | "citizen";
export type ERole = "emperor" | "slave";
export type RpsThrow = "rock" | "paper" | "scissors";
export type RpsReveal = { aId: string; a: RpsThrow; bId: string; b: RpsThrow };

export const RPS_REVEAL_MS = 2800;

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

export type EPhase = "rps" | "role" | "pick" | "reveal" | "over";

export type EState = {
  players: EPlayer[];
  phase: EPhase;
  round: number;
  set: number;
  tricksInSet: number;
  rpsThrows: Partial<Record<string, RpsThrow>>;
  rpsReveal: RpsReveal | null;
  roleChooserId: string | null;
  last: {
    aId: string;
    a: EKind;
    bId: string;
    b: EKind;
    result: "a" | "b" | "draw" | "match";
    matchWinnerId: string | null;
  } | null;
  winnerId: string | null;
  wins: Record<string, number>;
  log: Array<{ id: string; text: string }>;
  goal: number;
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

export function startEcardDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): EState {
  return {
    players: [seat(a), seat(b)],
    phase: "rps",
    round: 1,
    set: 1,
    tricksInSet: 0,
    rpsThrows: {},
    rpsReveal: null,
    roleChooserId: null,
    last: null,
    winnerId: null,
    wins: { [a.id]: 0, [b.id]: 0 },
    goal: 3,
    log: [
      {
        id: uid("l"),
        text: "Rock-paper-scissors. Winner picks Emperor or Slave. First to 3 match wins.",
      },
    ],
  };
}

export function startEcardPractice(): EState {
  return startEcardDuel({ id: "you", name: "YOU", human: true }, { id: "cpu", name: "CPU", human: false });
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

/** Returns who wins the clash: "a" | "b" | "draw". Match-ending if E or S loses. */
export function clash(a: EKind, b: EKind): { result: "a" | "b" | "draw"; matchEnd: boolean } {
  if (a === b && a === "citizen") return { result: "draw", matchEnd: false };
  if (a === b) return { result: "draw", matchEnd: false };
  if (a === "emperor" && b === "citizen") return { result: "a", matchEnd: false };
  if (a === "citizen" && b === "emperor") return { result: "b", matchEnd: false };
  if (a === "citizen" && b === "slave") return { result: "a", matchEnd: true };
  if (a === "slave" && b === "citizen") return { result: "b", matchEnd: true };
  if (a === "slave" && b === "emperor") return { result: "a", matchEnd: true };
  if (a === "emperor" && b === "slave") return { result: "b", matchEnd: true };
  return { result: "draw", matchEnd: false };
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

/** Winner of the match becomes Emperor; loser becomes Slave. */
function refillRoles(state: EState, matchWinnerId: string | null): EState {
  const p0 = state.players[0]!;
  const p1 = state.players[1]!;
  let r0 = p0.role ?? "emperor";
  let r1 = p1.role ?? "slave";
  if (matchWinnerId) {
    r0 = p0.id === matchWinnerId ? "emperor" : "slave";
    r1 = p1.id === matchWinnerId ? "emperor" : "slave";
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
  | { type: "rps"; throw: RpsThrow }
  | { type: "role"; role: ERole }
  | { type: "select"; cardId: string }
  | { type: "lock" }
  | { type: "next" };

export function applyEcardAction(state: EState, actorId: string, action: EAction): EState {
  if (state.phase === "over") return state;
  const me = state.players.find((p) => p.id === actorId);
  if (!me) return state;

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
      `${me.name} chooses ${mine.toUpperCase()} · ${other.name} is ${theirs.toUpperCase()}.`,
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

function reveal(state: EState): EState {
  const a = state.players[0]!;
  const b = state.players[1]!;
  const ca = a.hand.find((c) => c.id === a.selectedId)!;
  const cb = b.hand.find((c) => c.id === b.selectedId)!;
  const { result, matchEnd } = clash(ca.kind, cb.kind);
  let log = [
    ...state.log,
    {
      id: uid("l"),
      text: `${a.name} plays ${cardLabel(ca.kind)} · ${b.name} plays ${cardLabel(cb.kind)}.`,
    },
  ];

  // Original Kaiji: winner's card returns (Emperor after beating Citizen, Citizen after… only on non-match wins).
  // Citizen vs Citizen: both discarded. Match-ending clashes discard both and refill next match.
  const players = state.players.map((p) => {
    const mine = p.id === a.id ? ca : cb;
    const myResult =
      result === "draw" ? "draw" : (result === "a" && p.id === a.id) || (result === "b" && p.id === b.id) ? "win" : "lose";
    let hand = p.hand.filter((c) => c.id !== mine.id);
    if (!matchEnd && myResult === "win") {
      hand = [...hand, mine];
    }
    return { ...p, hand, selectedId: null, locked: false };
  });

  if (result === "draw") {
    log = [...log, { id: uid("l"), text: "Citizens cancel. Both discarded." }];
  } else if (!matchEnd) {
    const winner = result === "a" ? a : b;
    const winCard = result === "a" ? ca.kind : cb.kind;
    log = [
      ...log,
      {
        id: uid("l"),
        text:
          winCard === "emperor"
            ? `${winner.name} wins — Emperor returns to hand.`
            : `${winner.name} wins the clash — card returns.`,
      },
    ];
  } else {
    const winner = result === "a" ? a : b;
    log = [...log, { id: uid("l"), text: `${winner.name} wins the clash.` }];
  }

  let wins = { ...state.wins };
  let winnerId: string | null = null;
  let phase: EPhase = "reveal";

  let matchWinnerId: string | null = null;
  if (matchEnd) {
    matchWinnerId = result === "a" ? a.id : b.id;
    wins[matchWinnerId] = (wins[matchWinnerId] || 0) + 1;
    log = [...log, { id: uid("l"), text: `${result === "a" ? a.name : b.name} takes the match point! (${wins[a.id]}–${wins[b.id]})` }];
    if ((wins[matchWinnerId] || 0) >= state.goal) {
      phase = "over";
      winnerId = matchWinnerId;
      log = [...log, { id: uid("l"), text: `${result === "a" ? a.name : b.name} wins the E-Card duel.` }];
    }
  }

  return {
    ...state,
    players,
    phase,
    last: {
      aId: a.id,
      a: ca.kind,
      bId: b.id,
      b: cb.kind,
      result: matchEnd ? "match" : result,
      matchWinnerId,
    },
    wins,
    winnerId,
    log,
    tricksInSet: state.tricksInSet + 1,
  };
}

function continueAfterReveal(state: EState): EState {
  if (state.phase === "over") return state;
  const needFresh = state.last?.result === "match" || state.players.some((p) => p.hand.length === 0);
  if (needFresh) {
    const matchWinnerId = state.last?.result === "match" ? state.last.matchWinnerId : null;
    const next = refillRoles(state, matchWinnerId);
    const emp = next.players.find((p) => p.role === "emperor");
    const slv = next.players.find((p) => p.role === "slave");
    return {
      ...next,
      set: state.set + (matchWinnerId ? 1 : 0),
      round: state.round + 1,
      tricksInSet: 0,
      log: [
        ...state.log,
        {
          id: uid("l"),
          text: matchWinnerId
            ? `${emp?.name || "Winner"} plays Emperor next · ${slv?.name || "Loser"} plays Slave. Fresh hands.`
            : "Fresh hands for the next match.",
        },
      ],
    };
  }
  return { ...state, phase: "pick", last: null, round: state.round + 1 };
}

export function viewEcard(state: EState, viewerId: string): EState {
  return {
    ...state,
    rpsThrows: state.rpsReveal
      ? { [state.rpsReveal.aId]: state.rpsReveal.a, [state.rpsReveal.bId]: state.rpsReveal.b }
      : state.rpsThrows[viewerId]
        ? { [viewerId]: state.rpsThrows[viewerId] }
        : {},
    rpsReveal: state.rpsReveal,
    players: state.players.map((p) => {
      if (p.id === viewerId || state.phase === "reveal" || state.phase === "over" || state.phase === "rps" || state.phase === "role") {
        return p;
      }
      return {
        ...p,
        hand: p.hand.map((c) => ({ id: c.id, kind: "citizen" as const })),
        selectedId: p.locked ? "ready" : null,
      };
    }),
  };
}

/**
 * Psychological / game-theory AI for E-Card.
 *
 * Mid-match invariant (Kaiji rules): each side still holds its special until the match ends.
 * Hand size h ⇒ 1 special + (h−1) citizens. So forced plays are readable:
 *   h=1 → must play the special.
 * Emperor wants Citizen when rival h=1 (catch Slave). Slave wants Slave when rival h=1 (catch Emperor).
 */
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
  const mine = state.wins[meId] || 0;
  const theirs = state.wins[rivalId] || 0;
  const need = state.goal - mine;
  const theyNeed = state.goal - theirs;
  return { mine, theirs, need, theyNeed, behind: mine < theirs, matchPoint: need === 1, rivalMatchPoint: theyNeed === 1 };
}

function aiPickEmperor(me: EPlayer, rivalHandSize: number, pressure: ReturnType<typeof seriesPressure>, last: EState["last"]): ECard {
  const citizens = me.hand.filter((c) => c.kind === "citizen");
  const special = me.hand.find((c) => c.kind === "emperor")!;
  // Rival must play Slave — Citizen wins the match.
  if (rivalHandSize <= 1 && citizens[0]) return citizens[0];
  if (!citizens.length) return special;

  const pSlave = 1 / Math.max(1, rivalHandSize); // rival still holds Slave
  // EV sketch: Citizen can steal the match; Emperor risks instant loss to Slave.
  let wCitizen = 1.15 + pSlave * 3.2 + citizens.length * 0.15;
  let wEmperor = 0.55 + (1 - pSlave) * 1.8 - pSlave * 4.5;

  // Early match: probe with citizens (burn / fish for Slave).
  if (me.hand.length >= 4) {
    wCitizen += 0.9;
    wEmperor -= 0.5;
  }
  // Late: Slave is denser — hide Emperor unless a soft read suggests otherwise.
  if (rivalHandSize <= 2) {
    wEmperor -= 1.6;
    wCitizen += 1.1;
  }
  // After we just showed Emperor and won, humans often expect a safe Citizen next — sometimes double-bluff Emperor.
  if (last && last.result !== "match") {
    const iPlayedE =
      (last.aId === me.id && last.a === "emperor") || (last.bId === me.id && last.b === "emperor");
    if (iPlayedE && last.result !== "draw") {
      wEmperor += 0.7; // rare double press
      wCitizen += 0.35;
    }
  }
  // Score psychology: behind → more Citizen traps; match point → tighter, less Emperor gambling.
  if (pressure.behind) wCitizen += 0.55;
  if (pressure.matchPoint) {
    wEmperor -= 0.8;
    wCitizen += 0.5;
  }
  if (pressure.rivalMatchPoint) {
    // Must not gift the match — avoid Emperor unless Slave is diluted.
    wEmperor -= 1.2;
  }

  // Mix: never pure — keeps reads fuzzy.
  wCitizen *= 0.85 + Math.random() * 0.3;
  wEmperor *= 0.85 + Math.random() * 0.3;

  const choice = pickWeighted([
    ...citizens.map((c) => ({ card: c, w: wCitizen / citizens.length })),
    { card: special, w: wEmperor },
  ]);
  return choice;
}

function aiPickSlave(me: EPlayer, rivalHandSize: number, pressure: ReturnType<typeof seriesPressure>, last: EState["last"]): ECard {
  const citizens = me.hand.filter((c) => c.kind === "citizen");
  const special = me.hand.find((c) => c.kind === "slave")!;
  // Rival must play Emperor — Slave wins the match.
  if (rivalHandSize <= 1) return special;
  if (!citizens.length) return special;

  const pEmperor = 1 / Math.max(1, rivalHandSize);
  // Citizen vs Emperor continues (soft loss of a citizen); Slave vs Citizen ends the match in loss.
  let wCitizen = 1.2 + (1 - pEmperor) * 1.4 + citizens.length * 0.12;
  let wSlave = 0.35 + pEmperor * 4.2 - (1 - pEmperor) * 3.8;

  if (me.hand.length >= 4) {
    wCitizen += 1.0;
    wSlave -= 0.8; // bank the dagger
  }
  if (rivalHandSize <= 2) {
    wSlave += 1.8; // Emperor denser — spring the trap
    wCitizen -= 0.4;
  }
  // If Emperor just pressed E successfully, they often "take a breath" with Citizen — hold Slave one more beat.
  if (last && last.result !== "match") {
    const theyPlayedE =
      (last.aId !== me.id && last.a === "emperor") || (last.bId !== me.id && last.b === "emperor");
    if (theyPlayedE) {
      wSlave -= 0.6;
      wCitizen += 0.5;
    }
  }
  if (pressure.behind || pressure.matchPoint) {
    // Need an upset — raise Slave frequency when Emperor is still diluted enough.
    wSlave += rivalHandSize >= 3 ? 0.9 : 1.4;
  }
  if (pressure.rivalMatchPoint) {
    // Desperate steal attempts.
    wSlave += 0.7;
  }

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
    const ahead = (state.wins[cpuId] || 0) > (state.wins[rival?.id || ""] || 0);
    const role: ERole = Math.random() < (ahead ? 0.58 : 0.42) ? "emperor" : "slave";
    return { type: "role", role };
  }

  if (state.phase === "reveal") return { type: "next" };
  if (me.locked) return { type: "lock" };
  if (!me.selectedId) {
    if (!rival || !me.role) {
      return { type: "select", cardId: me.hand[0]!.id };
    }
    const pressure = seriesPressure(state, me.id, rival.id);
    const card =
      me.role === "emperor"
        ? aiPickEmperor(me, rival.hand.length, pressure, state.last)
        : aiPickSlave(me, rival.hand.length, pressure, state.last);
    return { type: "select", cardId: card.id };
  }
  return { type: "lock" };
}
