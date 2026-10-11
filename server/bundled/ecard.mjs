// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/ecard/engine.ts
function handFor(role) {
  const special = role === "emperor" ? "emperor" : "slave";
  return [
    { id: uid("e"), kind: special },
    ...Array.from({ length: 4 }, () => ({ id: uid("e"), kind: "citizen" }))
  ];
}
function seat(p, role) {
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    role,
    hand: handFor(role),
    selectedId: null
  };
}
function startEcardDuel(a, b) {
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
    log: [{ id: uid("l"), text: `${a.name} is Emperor \xB7 ${b.name} is Slave. First to 3 match wins. Roles swap every 3 matches.` }]
  };
}
function startEcardPractice() {
  return startEcardDuel({ id: "you", name: "YOU", human: true }, { id: "cpu", name: "CPU", human: false });
}
function cardLabel(kind) {
  if (kind === "emperor") return "EMPEROR";
  if (kind === "slave") return "SLAVE";
  return "CITIZEN";
}
function cardArt(kind) {
  if (kind === "emperor") return "/ecard-emperor.png";
  if (kind === "slave") return "/ecard-slave.png";
  return "/ecard-citizen.png";
}
function clash(a, b) {
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
function refillRoles(state, swap) {
  const p0 = state.players[0];
  const p1 = state.players[1];
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
      { ...p1, role: r1, hand: handFor(r1), selectedId: null }
    ],
    phase: "pick",
    last: null
  };
}
function applyEcardAction(state, actorId, action) {
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
      players: state.players.map((p) => p.id === actorId ? { ...p, selectedId: action.cardId } : p)
    };
  }
  if (action.type === "lock") {
    if (!me.selectedId) return state;
    let next = {
      ...state,
      players: state.players.map((p) => p.id === actorId ? { ...p, selectedId: me.selectedId } : p)
    };
    const a = next.players[0];
    const b = next.players[1];
    if (!a.selectedId || !b.selectedId) return next;
    return reveal(next);
  }
  return state;
}
function reveal(state) {
  const a = state.players[0];
  const b = state.players[1];
  const ca = a.hand.find((c) => c.id === a.selectedId);
  const cb = b.hand.find((c) => c.id === b.selectedId);
  const { result, matchEnd } = clash(ca.kind, cb.kind);
  let log = [
    ...state.log,
    {
      id: uid("l"),
      text: `${a.name} plays ${cardLabel(ca.kind)} \xB7 ${b.name} plays ${cardLabel(cb.kind)}.`
    }
  ];
  let players = state.players.map((p) => {
    const mine = p.id === a.id ? ca : cb;
    const theirs = p.id === a.id ? cb : ca;
    const myResult = result === "draw" ? "draw" : result === "a" && p.id === a.id || result === "b" && p.id === b.id ? "win" : "lose";
    let hand = p.hand.filter((c) => c.id !== mine.id);
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
  let winnerId = null;
  let phase = "reveal";
  if (matchEnd) {
    const matchWinner = result === "a" ? a.id : b.id;
    wins[matchWinner] = (wins[matchWinner] || 0) + 1;
    log = [...log, { id: uid("l"), text: `${result === "a" ? a.name : b.name} takes the match point! (${wins[a.id]}\u2013${wins[b.id]})` }];
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
    tricksInSet: state.tricksInSet + 1
  };
}
function continueAfterReveal(state) {
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
          text: swap ? `Roles swap. ${next.players[0].name} is ${next.players[0].role}. Fresh hands.` : "Fresh hands for the next match."
        }
      ]
    };
  }
  return { ...state, phase: "pick", last: null, round: state.round + 1 };
}
function viewEcard(state, viewerId) {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id === viewerId || state.phase === "reveal" || state.phase === "over") return p;
      return {
        ...p,
        hand: p.hand.map((c) => ({ id: c.id, kind: "citizen" })),
        selectedId: p.selectedId ? "ready" : null
      };
    })
  };
}
function aiEcard(state, cpuId) {
  const me = state.players.find((p) => p.id === cpuId);
  if (!me) return { type: "lock" };
  if (state.phase === "reveal") return { type: "next" };
  if (!me.selectedId) {
    const citizens = me.hand.filter((c) => c.kind === "citizen");
    const special = me.hand.find((c) => c.kind !== "citizen");
    const pick = citizens.length && (me.hand.length > 2 || Math.random() < 0.7) ? citizens[Math.floor(Math.random() * citizens.length)] : special || me.hand[0];
    return { type: "select", cardId: pick.id };
  }
  return { type: "lock" };
}
export {
  aiEcard,
  applyEcardAction,
  cardArt,
  cardLabel,
  clash,
  startEcardDuel,
  startEcardPractice,
  viewEcard
};
