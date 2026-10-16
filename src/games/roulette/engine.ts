import { uid } from "../../lib/shuffle";

export const CHAMBERS = 6;
export const BULLETS_DEFAULT = 1;

export type RPhase = "lobby" | "play" | "over";

export type RPlayer = {
  id: string;
  name: string;
  human: boolean;
};

export type RState = {
  players: RPlayer[];
  phase: RPhase;
  turn: number;
  chambers: number;
  bullets: number;
  /** Indices 0..chambers-1 that hold a bullet after the last spin. */
  loaded: number[];
  /** Next chamber under the hammer (0..chambers-1). */
  hammer: number;
  last: "click" | "bang" | null;
  winnerId: string | null;
  loserId: string | null;
  pulls: number;
  log: Array<{ id: string; text: string }>;
};

export type RAction = { type: "start" } | { type: "spin" } | { type: "pull" };

function seat(p: { id: string; name: string; human?: boolean }): RPlayer {
  return { id: p.id, name: p.name, human: p.human !== false };
}

function spinCylinder(chambers: number, bullets: number): { loaded: number[]; hammer: number } {
  const n = Math.max(1, Math.min(chambers - 1, bullets));
  const indices = Array.from({ length: chambers }, (_, i) => i);
  // Fisher–Yates partial
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = a;
  }
  const loaded = indices.slice(0, n).sort((a, b) => a - b);
  const hammer = Math.floor(Math.random() * chambers);
  return { loaded, hammer };
}

export function startRouletteLobby(people: Array<{ id: string; name: string; human?: boolean }>): RState {
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
        text: `Table ${players.length}/2. Open table, add a CPU or invite, then start. ${CHAMBERS} chambers · ${BULLETS_DEFAULT} bullet.`,
      },
    ],
  };
}

export function startRouletteDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): RState {
  return beginRouletteMatch([a, b]);
}

/** Local guest practice — no lobby / Open table. */
export function startRoulettePractice(): RState {
  return startRouletteDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}

function beginRouletteMatch(people: Array<{ id: string; name: string; human?: boolean }>): RState {
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
        text: `Cylinder spun. ${CHAMBERS} chambers, ${BULLETS_DEFAULT} live. ${players[first]?.name || "Player"} goes first.`,
      },
    ],
  };
}

export function applyRouletteAction(state: RState, actorId: string, action: RAction): RState {
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
      log: [...state.log, { id: uid("l"), text: `${cur.name} spins the cylinder.` }],
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
          { id: uid("l"), text: `${cur.name} pulls — BANG. ${rival?.name || "Rival"} wins.` },
        ],
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
          text: `${cur.name} pulls — click. Empty. ${state.players[nextTurn]?.name || "Next"}’s turn.`,
        },
      ],
    };
  }

  return state;
}

export function aiRoulette(state: RState): RAction {
  // Rarely re-spin when a few empties remain (tension / bluff), else pull.
  const remaining = state.chambers - state.pulls;
  if (remaining > 2 && Math.random() < 0.18) return { type: "spin" };
  return { type: "pull" };
}

/** Hide exact loaded chambers from clients — only server keeps truth; practice keeps full state. */
export function viewRoulette(state: RState, _viewerId: string): RState {
  return {
    ...state,
    // Clients know bullet count and hammer index for UI tension, but not which slots are live
    // until bang. We still send `loaded` length via bullets; clear indices.
    loaded: [],
  };
}

/** Chambers remaining until wrap (for UI odds hint). */
export function oddsHint(state: RState): string {
  const left = Math.max(1, state.chambers - (state.pulls % state.chambers));
  return `~${state.bullets}/${left} after spin · pull #${state.pulls + 1}`;
}
