import { uid } from "../../lib/shuffle";

export type EKind = "emperor" | "slave" | "citizen";
export type ERole = "emperor" | "slave";

export type ECard = { id: string; kind: EKind };

export type EPlayer = {
  id: string;
  name: string;
  human: boolean;
  role: ERole;
  hand: ECard[];
  selectedId: string | null;
};

export type EPhase = "pick" | "reveal" | "over";

export type EState = {
  players: EPlayer[];
  phase: EPhase;
  round: number;
  set: number;
  tricksInSet: number;
  last: { aId: string; a: EKind; bId: string; b: EKind; result: "a" | "b" | "draw" | "match" } | null;
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

function seat(p: { id: string; name: string; human?: boolean }, role: ERole): EPlayer {
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    role,
    hand: handFor(role),
    selectedId: null,
  };
}

export function startEcardDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): EState {
  return {
    players: [seat(a, "emperor"), seat(b, "slave")],
    phase: "pick",
    round: 1,
    set: 1,
    tricksInSet: 0,
    last: null,
    winnerId: null,
    wins: { [a.id]: 0, [b.id]: 0 },
    goal: 3,
    log: [{ id: uid("l"), text: `${a.name} is Emperor · ${b.name} is Slave. First to 3 match wins. Roles swap every 3 matches.` }],
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

function refillRoles(state: EState, swap: boolean): EState {
  const p0 = state.players[0]!;
  const p1 = state.players[1]!;
  let r0 = p0.role;
  let r1 = p1.role;
  if (swap) {
    r0 = p0.role === "emperor" ? "slave" : "emperor";
    r1 = p1.role === "emperor" ? "slave" : "emperor";
  }
  return {
    ...state,
    players: [
      { ...p0, role: r0, hand: handFor(r0), selectedId: null },
      { ...p1, role: r1, hand: handFor(r1), selectedId: null },
    ],
    phase: "pick",
    last: null,
  };
}

export type EAction = { type: "select"; cardId: string } | { type: "lock" } | { type: "next" };

export function applyEcardAction(state: EState, actorId: string, action: EAction): EState {
  if (state.phase === "over") return state;
  const me = state.players.find((p) => p.id === actorId);
  if (!me) return state;

  if (state.phase === "reveal" && action.type === "next") {
    return continueAfterReveal(state);
  }

  if (state.phase !== "pick") return state;

  if (action.type === "select") {
    if (!me.hand.some((c) => c.id === action.cardId)) return state;
    return {
      ...state,
      players: state.players.map((p) => (p.id === actorId ? { ...p, selectedId: action.cardId } : p)),
    };
  }

  if (action.type === "lock") {
    if (!me.selectedId) return state;
    let next: EState = {
      ...state,
      players: state.players.map((p) => (p.id === actorId ? { ...p, selectedId: me.selectedId } : p)),
    };
    const a = next.players[0]!;
    const b = next.players[1]!;
    if (!a.selectedId || !b.selectedId) return next;
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

  let players = state.players.map((p) => {
    const mine = p.id === a.id ? ca : cb;
    const theirs = p.id === a.id ? cb : ca;
    const myResult = result === "draw" ? "draw" : (result === "a" && p.id === a.id) || (result === "b" && p.id === b.id) ? "win" : "lose";
    let hand = p.hand.filter((c) => c.id !== mine.id);
    // Winner's card returns (except citizen vs citizen both discarded).
    if (myResult === "win" && !(ca.kind === "citizen" && cb.kind === "citizen")) {
      hand = [...hand, mine];
    }
    void theirs;
    return { ...p, hand, selectedId: null };
  });

  if (result === "draw") {
    log = [...log, { id: uid("l"), text: "Citizens cancel. Both discarded." }];
  } else {
    const winner = result === "a" ? a : b;
    log = [...log, { id: uid("l"), text: `${winner.name} wins the clash.` }];
  }

  let wins = { ...state.wins };
  let winnerId: string | null = null;
  let phase: EPhase = "reveal";

  if (matchEnd) {
    const matchWinner = result === "a" ? a.id : b.id;
    wins[matchWinner] = (wins[matchWinner] || 0) + 1;
    log = [...log, { id: uid("l"), text: `${result === "a" ? a.name : b.name} takes the match point! (${wins[a.id]}–${wins[b.id]})` }];
    if (wins[matchWinner] >= state.goal) {
      phase = "over";
      winnerId = matchWinner;
      log = [...log, { id: uid("l"), text: `${result === "a" ? a.name : b.name} wins the E-Card duel.` }];
    }
  }

  return {
    ...state,
    players,
    phase,
    last: { aId: a.id, a: ca.kind, bId: b.id, b: cb.kind, result: matchEnd ? "match" : result },
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
    const matchesDone = Object.values(state.wins).reduce((s, n) => s + n, 0);
    const swap = matchesDone > 0 && matchesDone % 3 === 0;
    const next = refillRoles(state, swap);
    return {
      ...next,
      set: state.set + (swap ? 1 : 0),
      round: state.round + 1,
      tricksInSet: 0,
      log: [
        ...state.log,
        {
          id: uid("l"),
          text: swap
            ? `Roles swap. ${next.players[0]!.name} is ${next.players[0]!.role}. Fresh hands.`
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
    players: state.players.map((p) => {
      if (p.id === viewerId || state.phase === "reveal" || state.phase === "over") return p;
      return {
        ...p,
        hand: p.hand.map((c) => ({ id: c.id, kind: "citizen" as const })),
        selectedId: p.selectedId ? "ready" : null,
      };
    }),
  };
}

export function aiEcard(state: EState, cpuId: string): EAction {
  const me = state.players.find((p) => p.id === cpuId);
  if (!me) return { type: "lock" };
  if (state.phase === "reveal") return { type: "next" };
  if (!me.selectedId) {
    // Prefer citizen pressure; sometimes bluff special late.
    const citizens = me.hand.filter((c) => c.kind === "citizen");
    const special = me.hand.find((c) => c.kind !== "citizen");
    const pick =
      citizens.length && (me.hand.length > 2 || Math.random() < 0.7)
        ? citizens[Math.floor(Math.random() * citizens.length)]!
        : special || me.hand[0]!;
    return { type: "select", cardId: pick.id };
  }
  return { type: "lock" };
}
