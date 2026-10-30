import { shuffle, uid } from "../../lib/shuffle";

export type WolfRole = "werewolf" | "villager" | "seer" | "witch";
export type WolfPhase =
  | "lobby"
  | "night_wolves"
  | "night_seer"
  | "night_witch"
  | "dawn"
  | "vote"
  | "over";

export type WPlayer = {
  id: string;
  name: string;
  human: boolean;
  role: WolfRole | null;
  alive: boolean;
  voteFor: string | null;
};

export type WState = {
  players: WPlayer[];
  phase: WolfPhase;
  day: number;
  /** Living wolves' kill picks this night. */
  wolfVotes: Record<string, string>;
  wolfTarget: string | null;
  seerChecked: string | null;
  seerResult: { targetId: string; isWolf: boolean } | null;
  witchSaveLeft: boolean;
  witchPoisonLeft: boolean;
  witchSaved: boolean;
  witchPoisonTarget: string | null;
  witchDone: boolean;
  nightDeaths: string[];
  lastEliminated: string | null;
  winner: "wolves" | "village" | null;
  log: Array<{ id: string; text: string }>;
};

export type WAction =
  | { type: "start" }
  | { type: "ready" }
  | { type: "wolf_kill"; targetId: string }
  | { type: "seer_check"; targetId: string }
  | { type: "witch"; save?: boolean; poisonId?: string | null }
  | { type: "to_vote" }
  | { type: "vote"; targetId: string };

export const WOLF_MIN = 4;
export const WOLF_MAX = 8;

const ROLE_LABEL: Record<WolfRole, string> = {
  werewolf: "Werewolf",
  villager: "Villager",
  seer: "Seer",
  witch: "Witch",
};

export function roleLabel(role: WolfRole | null | undefined) {
  return role ? ROLE_LABEL[role] : "—";
}

function seat(p: { id: string; name: string; human?: boolean }): WPlayer {
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    role: null,
    alive: true,
    voteFor: null,
  };
}

function rolesFor(n: number): WolfRole[] {
  const wolves = n >= 6 ? 2 : 1;
  const roles: WolfRole[] = [];
  for (let i = 0; i < wolves; i++) roles.push("werewolf");
  roles.push("seer", "witch");
  while (roles.length < n) roles.push("villager");
  return shuffle(roles).slice(0, n);
}

export function startWerewolfLobby(people: Array<{ id: string; name: string; human?: boolean }>): WState {
  const players = people.slice(0, WOLF_MAX).map(seat);
  return {
    players,
    phase: "lobby",
    day: 0,
    wolfVotes: {},
    wolfTarget: null,
    seerChecked: null,
    seerResult: null,
    witchSaveLeft: true,
    witchPoisonLeft: true,
    witchSaved: false,
    witchPoisonTarget: null,
    witchDone: false,
    nightDeaths: [],
    lastEliminated: null,
    winner: null,
    log: [
      {
        id: uid("l"),
        text: `Table ${players.length}/${WOLF_MAX}. Need ${WOLF_MIN}–${WOLF_MAX}. Open table, add CPUs or invite, then start.`,
      },
    ],
  };
}

/** Local guest practice — you plus CPUs. Default is five CPUs. */
export function startWerewolfPractice(seats = 6): WState {
  const n = Math.max(WOLF_MIN, Math.min(WOLF_MAX, Math.floor(seats) || 6));
  return beginWerewolfMatch(
    Array.from({ length: n }, (_, i) => ({
      id: i === 0 ? "you" : `cpu-${i}`,
      name: i === 0 ? "YOU" : i === 1 ? "CPU" : `CPU ${i}`,
      human: i === 0,
    })),
  );
}

function beginWerewolfMatch(people: Array<{ id: string; name: string; human?: boolean }>): WState {
  const n = Math.max(WOLF_MIN, Math.min(WOLF_MAX, people.length));
  const players = people.slice(0, n).map(seat);
  const roles = rolesFor(players.length);
  const dealt = players.map((p, i) => ({ ...p, role: roles[i]!, alive: true, voteFor: null }));
  const wolfN = dealt.filter((p) => p.role === "werewolf").length;
  return {
    players: dealt,
    phase: "night_wolves",
    day: 1,
    wolfVotes: {},
    wolfTarget: null,
    seerChecked: null,
    seerResult: null,
    witchSaveLeft: true,
    witchPoisonLeft: true,
    witchSaved: false,
    witchPoisonTarget: null,
    witchDone: false,
    nightDeaths: [],
    lastEliminated: null,
    winner: null,
    log: [
      {
        id: uid("l"),
        text: `Night 1. ${wolfN} werewolf${wolfN > 1 ? "s" : ""}, Seer, Witch, and villagers. Wolves choose a victim.`,
      },
    ],
  };
}

function alive(state: WState) {
  return state.players.filter((p) => p.alive);
}

function livingWolves(state: WState) {
  return alive(state).filter((p) => p.role === "werewolf");
}

function livingVillage(state: WState) {
  return alive(state).filter((p) => p.role !== "werewolf");
}

function checkWin(state: WState): WState {
  const wolves = livingWolves(state);
  const village = livingVillage(state);
  if (wolves.length === 0) {
    return {
      ...state,
      phase: "over",
      winner: "village",
      log: [...state.log, { id: uid("l"), text: "All werewolves are dead. Village wins." }],
    };
  }
  if (wolves.length >= village.length) {
    return {
      ...state,
      phase: "over",
      winner: "wolves",
      log: [...state.log, { id: uid("l"), text: "Werewolves equal or outnumber the village. Wolves win." }],
    };
  }
  return state;
}

function majorityTarget(votes: Record<string, string>, wolfIds: string[]): string | null {
  const counts = new Map<string, number>();
  for (const wid of wolfIds) {
    const t = votes[wid];
    if (!t) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    } else if (n === bestN) {
      best = null; // tie → no kill preference; pick first later
    }
  }
  if (best) return best;
  const picks = wolfIds.map((id) => votes[id]).filter(Boolean) as string[];
  return picks[0] ?? null;
}

function advanceAfterWolves(state: WState): WState {
  const wolves = livingWolves(state);
  const target = majorityTarget(state.wolfVotes, wolves.map((w) => w.id));
  const withTarget = { ...state, wolfTarget: target };
  const seer = alive(withTarget).find((p) => p.role === "seer");
  if (seer) {
    return {
      ...withTarget,
      phase: "night_seer",
      seerChecked: null,
      seerResult: null,
      log: [...withTarget.log, { id: uid("l"), text: "Wolves have chosen. Seer, check one player." }],
    };
  }
  return advanceAfterSeer(withTarget);
}

function advanceAfterSeer(state: WState): WState {
  const witch = alive(state).find((p) => p.role === "witch");
  if (witch && (state.witchSaveLeft || state.witchPoisonLeft)) {
    return {
      ...state,
      phase: "night_witch",
      witchSaved: false,
      witchPoisonTarget: null,
      witchDone: false,
      log: [
        ...state.log,
        {
          id: uid("l"),
          text: state.wolfTarget
            ? `Witch’s turn. Someone is marked tonight. Save / poison / pass.`
            : "Witch’s turn. No wolf kill locked in — poison or pass.",
        },
      ],
    };
  }
  return resolveNight(state);
}

function resolveNight(state: WState): WState {
  const deaths = new Set<string>();
  if (state.wolfTarget && !state.witchSaved) deaths.add(state.wolfTarget);
  if (state.witchPoisonTarget) deaths.add(state.witchPoisonTarget);

  const players = state.players.map((p) => (deaths.has(p.id) ? { ...p, alive: false, voteFor: null } : { ...p, voteFor: null }));
  const nightDeaths = [...deaths];
  const names = nightDeaths.map((id) => players.find((p) => p.id === id)?.name || "Someone").join(", ");
  let next: WState = {
    ...state,
    players,
    phase: "dawn",
    nightDeaths,
    wolfVotes: {},
    seerChecked: null,
    witchDone: false,
    log: [
      ...state.log,
      {
        id: uid("l"),
        text: nightDeaths.length
          ? `Dawn of day ${state.day}. Dead: ${names}.`
          : `Dawn of day ${state.day}. No one died.`,
      },
    ],
  };
  next = checkWin(next);
  return next;
}

function resolveVote(state: WState): WState {
  const voters = alive(state);
  const counts = new Map<string, number>();
  for (const p of voters) {
    if (!p.voteFor) continue;
    counts.set(p.voteFor, (counts.get(p.voteFor) || 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  let tie = false;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
      tie = false;
    } else if (n === bestN) {
      tie = true;
    }
  }
  if (!best || tie || bestN < 1) {
    return {
      ...state,
      phase: "night_wolves",
      day: state.day + 1,
      wolfVotes: {},
      wolfTarget: null,
      seerChecked: null,
      seerResult: null,
      witchSaved: false,
      witchPoisonTarget: null,
      witchDone: false,
      nightDeaths: [],
      lastEliminated: null,
      players: state.players.map((p) => ({ ...p, voteFor: null })),
      log: [...state.log, { id: uid("l"), text: "Vote tied or empty. No one is eliminated. Night falls." }],
    };
  }
  const players = state.players.map((p) =>
    p.id === best ? { ...p, alive: false, voteFor: null } : { ...p, voteFor: null },
  );
  const victim = players.find((p) => p.id === best);
  let next: WState = {
    ...state,
    players,
    lastEliminated: best,
    nightDeaths: [],
    log: [
      ...state.log,
      {
        id: uid("l"),
        text: `${victim?.name || "Someone"} is voted out (${roleLabel(victim?.role)}).`,
      },
    ],
  };
  next = checkWin(next);
  if (next.phase === "over") return next;
  return {
    ...next,
    phase: "night_wolves",
    day: state.day + 1,
    wolfVotes: {},
    wolfTarget: null,
    seerChecked: null,
    seerResult: null,
    witchSaved: false,
    witchPoisonTarget: null,
    witchDone: false,
    log: [...next.log, { id: uid("l"), text: `Night ${state.day + 1}. Wolves choose a victim.` }],
  };
}

export function applyWerewolfAction(state: WState, actorId: string, action: WAction): WState {
  if (action.type === "start") {
    if (state.phase !== "lobby") return state;
    if (state.players[0]?.id !== actorId) return state;
    if (state.players.length < WOLF_MIN) return state;
    return beginWerewolfMatch(state.players);
  }

  const me = state.players.find((p) => p.id === actorId);
  if (!me || !me.alive || state.phase === "over" || state.phase === "lobby") return state;

  if (action.type === "wolf_kill") {
    if (state.phase !== "night_wolves" || me.role !== "werewolf") return state;
    if (state.wolfVotes[me.id]) return state;
    const target = state.players.find((p) => p.id === action.targetId);
    if (!target || !target.alive || target.role === "werewolf") return state;
    const wolfVotes = { ...state.wolfVotes, [me.id]: action.targetId };
    const wolves = livingWolves(state);
    let next: WState = {
      ...state,
      wolfVotes,
      log: [...state.log, { id: uid("l"), text: `${me.name} marked a target.` }],
    };
    if (wolves.every((w) => wolfVotes[w.id])) {
      next = advanceAfterWolves(next);
    }
    return next;
  }

  if (action.type === "seer_check") {
    if (state.phase !== "night_seer" || me.role !== "seer") return state;
    if (state.seerChecked) return state;
    const target = state.players.find((p) => p.id === action.targetId);
    if (!target || !target.alive || target.id === me.id) return state;
    const isWolf = target.role === "werewolf";
    return advanceAfterSeer({
      ...state,
      seerChecked: target.id,
      seerResult: { targetId: target.id, isWolf },
      log: [
        ...state.log,
        {
          id: uid("l"),
          text: `Seer checked ${target.name}: ${isWolf ? "WEREWOLF" : "not a werewolf"}.`,
        },
      ],
    });
  }

  if (action.type === "witch") {
    if (state.phase !== "night_witch" || me.role !== "witch" || state.witchDone) return state;
    let witchSaveLeft = state.witchSaveLeft;
    let witchPoisonLeft = state.witchPoisonLeft;
    let witchSaved = false;
    let witchPoisonTarget: string | null = null;

    if (action.save) {
      if (!witchSaveLeft || !state.wolfTarget) return state;
      witchSaveLeft = false;
      witchSaved = true;
    }
    if (action.poisonId) {
      if (!witchPoisonLeft) return state;
      const t = state.players.find((p) => p.id === action.poisonId);
      if (!t || !t.alive || t.id === me.id) return state;
      if (witchSaved && t.id === state.wolfTarget) return state;
      witchPoisonLeft = false;
      witchPoisonTarget = t.id;
    }

    return resolveNight({
      ...state,
      witchSaveLeft,
      witchPoisonLeft,
      witchSaved,
      witchPoisonTarget,
      witchDone: true,
      log: [
        ...state.log,
        {
          id: uid("l"),
          text: witchSaved
            ? witchPoisonTarget
              ? "Witch saved the marked player and used poison."
              : "Witch used the save potion."
            : witchPoisonTarget
              ? "Witch used poison."
              : "Witch passes.",
        },
      ],
    });
  }

  if (action.type === "to_vote") {
    if (state.phase !== "dawn") return state;
    return {
      ...state,
      phase: "vote",
      players: state.players.map((p) => ({ ...p, voteFor: null })),
      log: [...state.log, { id: uid("l"), text: "Day vote. Each living player picks one to eliminate." }],
    };
  }

  if (action.type === "vote") {
    if (state.phase !== "vote") return state;
    if (me.voteFor) return state;
    const target = state.players.find((p) => p.id === action.targetId);
    if (!target || !target.alive || target.id === me.id) return state;
    const players = state.players.map((p) => (p.id === me.id ? { ...p, voteFor: action.targetId } : p));
    let next: WState = {
      ...state,
      players,
      log: [...state.log, { id: uid("l"), text: `${me.name} voted.` }],
    };
    const living = alive(next);
    if (living.every((p) => p.voteFor)) {
      next = resolveVote(next);
    }
    return next;
  }

  return state;
}

/** Simple CPU: wolves kill random villager; seer checks random; witch saves self/random; vote random non-self. */
export function aiWerewolf(state: WState, cpuId: string): WAction {
  const me = state.players.find((p) => p.id === cpuId);
  if (!me || !me.alive) return { type: "to_vote" };

  if (state.phase === "night_wolves" && me.role === "werewolf") {
    const targets = alive(state).filter((p) => p.role !== "werewolf");
    const t = targets[Math.floor(Math.random() * targets.length)];
    if (t) return { type: "wolf_kill", targetId: t.id };
  }

  if (state.phase === "night_seer" && me.role === "seer") {
    const targets = alive(state).filter((p) => p.id !== me.id);
    const t = targets[Math.floor(Math.random() * targets.length)];
    if (t) return { type: "seer_check", targetId: t.id };
  }

  if (state.phase === "night_witch" && me.role === "witch") {
    const save =
      Boolean(state.witchSaveLeft && state.wolfTarget) &&
      (state.wolfTarget === me.id || Math.random() < 0.35);
    let poisonId: string | null = null;
    if (state.witchPoisonLeft && Math.random() < 0.25) {
      const pool = alive(state).filter((p) => p.id !== me.id && p.id !== (save ? state.wolfTarget : null));
      poisonId = pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
    }
    return { type: "witch", save, poisonId };
  }

  if (state.phase === "dawn") return { type: "to_vote" };

  if (state.phase === "vote") {
    const others = alive(state).filter((p) => p.id !== me.id);
    if (me.role === "werewolf") {
      const village = others.filter((p) => p.role !== "werewolf");
      const t = village[Math.floor(Math.random() * village.length)] || others[0];
      if (t) return { type: "vote", targetId: t.id };
    }
    const t = others[Math.floor(Math.random() * others.length)];
    if (t) return { type: "vote", targetId: t.id };
  }

  return { type: "to_vote" };
}

/** Fog of war: hide other living roles; wolves see fellow wolves; dead/over reveal. */
export function viewWerewolf(state: WState, viewerId: string): WState {
  const me = state.players.find((p) => p.id === viewerId);
  const iAmWolf = me?.role === "werewolf";
  const revealAll = state.phase === "over";

  return {
    ...state,
    // Only the seer (and over) should see seerResult details in log — keep result for seer.
    seerResult: me?.role === "seer" || revealAll ? state.seerResult : null,
    wolfVotes: iAmWolf || revealAll ? state.wolfVotes : {},
    wolfTarget:
      me?.role === "witch" && state.phase === "night_witch"
        ? state.wolfTarget
        : iAmWolf || revealAll
          ? state.wolfTarget
          : null,
    players: state.players.map((p) => {
      if (p.id === viewerId || revealAll || !p.alive) return p;
      if (iAmWolf && p.role === "werewolf") return p;
      return { ...p, role: null };
    }),
    log: state.log.map((entry) => {
      // Hide seer private line from non-seers.
      if (
        me?.role !== "seer" &&
        !revealAll &&
        /Seer checked .+?: (WEREWOLF|not a werewolf)/.test(entry.text)
      ) {
        return { ...entry, text: "Seer used their check." };
      }
      return entry;
    }),
  };
}
