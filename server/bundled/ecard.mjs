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
function seat(p) {
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    role: null,
    rolePick: null,
    roleReady: false,
    hand: [],
    selectedId: null,
    locked: false
  };
}
function startEcardDuel(a, b) {
  return {
    players: [seat(a), seat(b)],
    phase: "role",
    round: 1,
    set: 1,
    tricksInSet: 0,
    last: null,
    winnerId: null,
    wins: { [a.id]: 0, [b.id]: 0 },
    goal: 3,
    log: [
      {
        id: uid("l"),
        text: "Choose Emperor or Slave. First to 3 match wins. Match winner plays Emperor next; loser plays Slave."
      }
    ]
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
function dealWithRoles(state, r0, r1, note) {
  const p0 = state.players[0];
  const p1 = state.players[1];
  return {
    ...state,
    players: [
      { ...p0, role: r0, rolePick: r0, roleReady: true, hand: handFor(r0), selectedId: null, locked: false },
      { ...p1, role: r1, rolePick: r1, roleReady: true, hand: handFor(r1), selectedId: null, locked: false }
    ],
    phase: "pick",
    last: null,
    log: [...state.log, { id: uid("l"), text: note }]
  };
}
function resolveRoles(state) {
  const p0 = state.players[0];
  const p1 = state.players[1];
  const a = p0.rolePick;
  const b = p1.rolePick;
  if (!a || !b) return state;
  if (a !== b) {
    return dealWithRoles(
      state,
      a,
      b,
      `${p0.name} is ${a.toUpperCase()} \xB7 ${p1.name} is ${b.toUpperCase()}.`
    );
  }
  const keepFirst = Math.random() < 0.5;
  const r0 = keepFirst ? a : a === "emperor" ? "slave" : "emperor";
  const r1 = r0 === "emperor" ? "slave" : "emperor";
  return dealWithRoles(
    state,
    r0,
    r1,
    `Both wanted ${a}. Coin flip \u2192 ${p0.name} ${r0.toUpperCase()} \xB7 ${p1.name} ${r1.toUpperCase()}.`
  );
}
function refillRoles(state, matchWinnerId) {
  const p0 = state.players[0];
  const p1 = state.players[1];
  let r0 = p0.role ?? "emperor";
  let r1 = p1.role ?? "slave";
  if (matchWinnerId) {
    r0 = p0.id === matchWinnerId ? "emperor" : "slave";
    r1 = p1.id === matchWinnerId ? "emperor" : "slave";
  }
  return {
    ...state,
    players: [
      { ...p0, role: r0, rolePick: r0, roleReady: true, hand: handFor(r0), selectedId: null, locked: false },
      { ...p1, role: r1, rolePick: r1, roleReady: true, hand: handFor(r1), selectedId: null, locked: false }
    ],
    phase: "pick",
    last: null
  };
}
function applyEcardAction(state, actorId, action) {
  if (state.phase === "over") return state;
  const me = state.players.find((p) => p.id === actorId);
  if (!me) return state;
  if (state.phase === "role") {
    if (action.type === "role") {
      if (me.roleReady) return state;
      return {
        ...state,
        players: state.players.map((p) => p.id === actorId ? { ...p, rolePick: action.role } : p)
      };
    }
    if (action.type === "confirmRole") {
      if (!me.rolePick || me.roleReady) return state;
      const next = {
        ...state,
        players: state.players.map((p) => p.id === actorId ? { ...p, roleReady: true } : p),
        log: [...state.log, { id: uid("l"), text: `${me.name} locks in ${me.rolePick}.` }]
      };
      if (next.players.every((p) => p.roleReady && p.rolePick)) return resolveRoles(next);
      return next;
    }
    return state;
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
      players: state.players.map((p) => p.id === actorId ? { ...p, selectedId: action.cardId } : p)
    };
  }
  if (action.type === "lock") {
    if (!me.selectedId || me.locked) return state;
    const next = {
      ...state,
      players: state.players.map((p) => p.id === actorId ? { ...p, locked: true } : p),
      log: [...state.log, { id: uid("l"), text: `${me.name} locks a card.` }]
    };
    if (!next.players.every((p) => p.locked && p.selectedId)) return next;
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
  const players = state.players.map((p) => {
    const mine = p.id === a.id ? ca : cb;
    const myResult = result === "draw" ? "draw" : result === "a" && p.id === a.id || result === "b" && p.id === b.id ? "win" : "lose";
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
        text: winCard === "emperor" ? `${winner.name} wins \u2014 Emperor returns to hand.` : `${winner.name} wins the clash \u2014 card returns.`
      }
    ];
  } else {
    const winner = result === "a" ? a : b;
    log = [...log, { id: uid("l"), text: `${winner.name} wins the clash.` }];
  }
  let wins = { ...state.wins };
  let winnerId = null;
  let phase = "reveal";
  let matchWinnerId = null;
  if (matchEnd) {
    matchWinnerId = result === "a" ? a.id : b.id;
    wins[matchWinnerId] = (wins[matchWinnerId] || 0) + 1;
    log = [...log, { id: uid("l"), text: `${result === "a" ? a.name : b.name} takes the match point! (${wins[a.id]}\u2013${wins[b.id]})` }];
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
      matchWinnerId
    },
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
          text: matchWinnerId ? `${emp?.name || "Winner"} plays Emperor next \xB7 ${slv?.name || "Loser"} plays Slave. Fresh hands.` : "Fresh hands for the next match."
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
      if (state.phase === "role") {
        if (p.id !== viewerId) return { ...p, rolePick: p.roleReady ? p.rolePick : null };
        return p;
      }
      if (p.id === viewerId || state.phase === "reveal" || state.phase === "over") return p;
      return {
        ...p,
        hand: p.hand.map((c) => ({ id: c.id, kind: "citizen" })),
        // Hide which card until locked; only show that they locked.
        selectedId: p.locked ? "ready" : null
      };
    })
  };
}
function pickWeighted(weights) {
  const floor = weights.map((x) => ({ card: x.card, w: Math.max(0.01, x.w) }));
  const sum = floor.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * sum;
  for (const x of floor) {
    r -= x.w;
    if (r <= 0) return x.card;
  }
  return floor[floor.length - 1].card;
}
function seriesPressure(state, meId, rivalId) {
  const mine = state.wins[meId] || 0;
  const theirs = state.wins[rivalId] || 0;
  const need = state.goal - mine;
  const theyNeed = state.goal - theirs;
  return { mine, theirs, need, theyNeed, behind: mine < theirs, matchPoint: need === 1, rivalMatchPoint: theyNeed === 1 };
}
function aiPickEmperor(me, rivalHandSize, pressure, last) {
  const citizens = me.hand.filter((c) => c.kind === "citizen");
  const special = me.hand.find((c) => c.kind === "emperor");
  if (rivalHandSize <= 1 && citizens[0]) return citizens[0];
  if (!citizens.length) return special;
  const pSlave = 1 / Math.max(1, rivalHandSize);
  let wCitizen = 1.15 + pSlave * 3.2 + citizens.length * 0.15;
  let wEmperor = 0.55 + (1 - pSlave) * 1.8 - pSlave * 4.5;
  if (me.hand.length >= 4) {
    wCitizen += 0.9;
    wEmperor -= 0.5;
  }
  if (rivalHandSize <= 2) {
    wEmperor -= 1.6;
    wCitizen += 1.1;
  }
  if (last && last.result !== "match") {
    const iPlayedE = last.aId === me.id && last.a === "emperor" || last.bId === me.id && last.b === "emperor";
    if (iPlayedE && last.result !== "draw") {
      wEmperor += 0.7;
      wCitizen += 0.35;
    }
  }
  if (pressure.behind) wCitizen += 0.55;
  if (pressure.matchPoint) {
    wEmperor -= 0.8;
    wCitizen += 0.5;
  }
  if (pressure.rivalMatchPoint) {
    wEmperor -= 1.2;
  }
  wCitizen *= 0.85 + Math.random() * 0.3;
  wEmperor *= 0.85 + Math.random() * 0.3;
  const choice = pickWeighted([
    ...citizens.map((c) => ({ card: c, w: wCitizen / citizens.length })),
    { card: special, w: wEmperor }
  ]);
  return choice;
}
function aiPickSlave(me, rivalHandSize, pressure, last) {
  const citizens = me.hand.filter((c) => c.kind === "citizen");
  const special = me.hand.find((c) => c.kind === "slave");
  if (rivalHandSize <= 1) return special;
  if (!citizens.length) return special;
  const pEmperor = 1 / Math.max(1, rivalHandSize);
  let wCitizen = 1.2 + (1 - pEmperor) * 1.4 + citizens.length * 0.12;
  let wSlave = 0.35 + pEmperor * 4.2 - (1 - pEmperor) * 3.8;
  if (me.hand.length >= 4) {
    wCitizen += 1;
    wSlave -= 0.8;
  }
  if (rivalHandSize <= 2) {
    wSlave += 1.8;
    wCitizen -= 0.4;
  }
  if (last && last.result !== "match") {
    const theyPlayedE = last.aId !== me.id && last.a === "emperor" || last.bId !== me.id && last.b === "emperor";
    if (theyPlayedE) {
      wSlave -= 0.6;
      wCitizen += 0.5;
    }
  }
  if (pressure.behind || pressure.matchPoint) {
    wSlave += rivalHandSize >= 3 ? 0.9 : 1.4;
  }
  if (pressure.rivalMatchPoint) {
    wSlave += 0.7;
  }
  wCitizen *= 0.85 + Math.random() * 0.3;
  wSlave *= 0.85 + Math.random() * 0.3;
  return pickWeighted([
    ...citizens.map((c) => ({ card: c, w: wCitizen / citizens.length })),
    { card: special, w: wSlave }
  ]);
}
function aiEcard(state, cpuId) {
  const me = state.players.find((p) => p.id === cpuId);
  if (!me) return { type: "lock" };
  const rival = state.players.find((p) => p.id !== cpuId);
  if (state.phase === "role") {
    if (!me.rolePick) {
      if (rival?.rolePick === "emperor") return { type: "role", role: "slave" };
      if (rival?.rolePick === "slave") return { type: "role", role: "emperor" };
      const ahead = (state.wins[cpuId] || 0) > (state.wins[rival?.id || ""] || 0);
      const role = Math.random() < (ahead ? 0.58 : 0.42) ? "emperor" : "slave";
      return { type: "role", role };
    }
    if (!me.roleReady) return { type: "confirmRole" };
    return { type: "confirmRole" };
  }
  if (state.phase === "reveal") return { type: "next" };
  if (me.locked) return { type: "lock" };
  if (!me.selectedId) {
    if (!rival || !me.role) {
      return { type: "select", cardId: me.hand[0].id };
    }
    const pressure = seriesPressure(state, me.id, rival.id);
    const card = me.role === "emperor" ? aiPickEmperor(me, rival.hand.length, pressure, state.last) : aiPickSlave(me, rival.hand.length, pressure, state.last);
    return { type: "select", cardId: card.id };
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
