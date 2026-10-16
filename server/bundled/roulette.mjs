// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/roulette/engine.ts
var CHAMBERS = 6;
var BULLETS_DEFAULT = 1;
function seat(p) {
  return { id: p.id, name: p.name, human: p.human !== false };
}
function spinCylinder(chambers, bullets) {
  const n = Math.max(1, Math.min(chambers - 1, bullets));
  const indices = Array.from({ length: chambers }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = indices[i];
    indices[i] = indices[j];
    indices[j] = a;
  }
  const loaded = indices.slice(0, n).sort((a, b) => a - b);
  const hammer = Math.floor(Math.random() * chambers);
  return { loaded, hammer };
}
function startRouletteLobby(people) {
  const players = people.slice(0, 2).map(seat);
  return {
    players,
    phase: "lobby",
    turn: 0,
    chambers: CHAMBERS,
    bullets: BULLETS_DEFAULT,
    loaded: [],
    hammer: 0,
    last: null,
    winnerId: null,
    loserId: null,
    pulls: 0,
    log: [
      {
        id: uid("l"),
        text: `Table ${players.length}/2. Open table, add a CPU or invite, then start. ${CHAMBERS} chambers \xB7 ${BULLETS_DEFAULT} bullet.`
      }
    ]
  };
}
function startRouletteDuel(a, b) {
  return beginRouletteMatch([a, b]);
}
function startRoulettePractice() {
  return startRouletteDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}
function beginRouletteMatch(people) {
  const players = people.slice(0, 2).map(seat);
  const { loaded, hammer } = spinCylinder(CHAMBERS, BULLETS_DEFAULT);
  const first = Math.floor(Math.random() * players.length);
  return {
    players,
    phase: "play",
    turn: first,
    chambers: CHAMBERS,
    bullets: BULLETS_DEFAULT,
    loaded,
    hammer,
    last: null,
    winnerId: null,
    loserId: null,
    pulls: 0,
    log: [
      {
        id: uid("l"),
        text: `Cylinder spun. ${CHAMBERS} chambers, ${BULLETS_DEFAULT} live. ${players[first]?.name || "Player"} goes first.`
      }
    ]
  };
}
function applyRouletteAction(state, actorId, action) {
  if (action.type === "start") {
    if (state.phase !== "lobby") return state;
    if (state.players[0]?.id !== actorId) return state;
    if (state.players.length < 2) return state;
    return beginRouletteMatch(state.players);
  }
  if (state.phase !== "play") return state;
  const cur = state.players[state.turn];
  if (!cur || cur.id !== actorId) return state;
  if (action.type === "spin") {
    const { loaded, hammer } = spinCylinder(state.chambers, state.bullets);
    return {
      ...state,
      loaded,
      hammer,
      last: null,
      log: [...state.log, { id: uid("l"), text: `${cur.name} spins the cylinder.` }]
    };
  }
  if (action.type === "pull") {
    const bang = state.loaded.includes(state.hammer);
    if (bang) {
      const rival = state.players.find((p) => p.id !== cur.id);
      return {
        ...state,
        phase: "over",
        last: "bang",
        loserId: cur.id,
        winnerId: rival?.id ?? null,
        pulls: state.pulls + 1,
        log: [
          ...state.log,
          { id: uid("l"), text: `${cur.name} pulls \u2014 BANG. ${rival?.name || "Rival"} wins.` }
        ]
      };
    }
    const nextHammer = (state.hammer + 1) % state.chambers;
    const nextTurn = (state.turn + 1) % state.players.length;
    return {
      ...state,
      hammer: nextHammer,
      turn: nextTurn,
      last: "click",
      pulls: state.pulls + 1,
      log: [
        ...state.log,
        {
          id: uid("l"),
          text: `${cur.name} pulls \u2014 click. Empty. ${state.players[nextTurn]?.name || "Next"}\u2019s turn.`
        }
      ]
    };
  }
  return state;
}
function aiRoulette(state) {
  const remaining = state.chambers - state.pulls;
  if (remaining > 2 && Math.random() < 0.18) return { type: "spin" };
  return { type: "pull" };
}
function viewRoulette(state, _viewerId) {
  return {
    ...state,
    // Clients know bullet count and hammer index for UI tension, but not which slots are live
    // until bang. We still send `loaded` length via bullets; clear indices.
    loaded: []
  };
}
function oddsHint(state) {
  const left = Math.max(1, state.chambers - state.pulls % state.chambers);
  return `~${state.bullets}/${left} after spin \xB7 pull #${state.pulls + 1}`;
}
export {
  BULLETS_DEFAULT,
  CHAMBERS,
  aiRoulette,
  applyRouletteAction,
  oddsHint,
  startRouletteDuel,
  startRouletteLobby,
  startRoulettePractice,
  viewRoulette
};
