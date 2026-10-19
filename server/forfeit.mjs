/** Solo casino tables have no opponent. Leaving just exits. */
export const SOLO_GAMES = new Set(["roulette", "slots"]);

function isCpuId(id) {
  return /^(cpu|bot|ai)/i.test(String(id || ""));
}

function isCpuPlayer(p) {
  return Boolean(p && (p.human === false || isCpuId(p.id)));
}

export function isLobbyState(state) {
  return Boolean(state && (state.phase === "lobby" || state.street === "lobby"));
}

export function isMatchOver(game, state) {
  if (!state) return false;
  if (game === "holdem") return state.street === "over";
  return state.phase === "over";
}

/** In progress: not the waiting table, and nobody has won yet. */
export function isLiveMatchState(game, state) {
  if (!state || SOLO_GAMES.has(game)) return false;
  if (isLobbyState(state) || isMatchOver(game, state)) return false;
  return true;
}

export function leaverName(state, leaverId) {
  const id = String(leaverId);
  const found = (state?.players || []).find((p) => String(p.id) === id);
  return found?.name || "A player";
}

/** Humans still seated win. The leaver loses. CPUs are not a forfeit result. */
export function winnerIdsFor(state, leaverId) {
  const id = String(leaverId);
  return (state?.players || [])
    .filter((p) => String(p.id) !== id && !isCpuPlayer(p))
    .map((p) => String(p.id));
}

export function forfeitMessage(state, viewerId) {
  const name = leaverName(state, state?.forfeitId);
  const winners = (state?.winnerIds || []).map(String);
  if (String(viewerId) === String(state?.forfeitId)) return "You left. You lose.";
  if (winners.includes(String(viewerId))) return `${name} left. You win.`;
  if (winners.length === 1) {
    const w = (state?.players || []).find((p) => String(p.id) === winners[0]);
    return `${name} left. ${w?.name || "The other player"} wins.`;
  }
  if (winners.length > 1) {
    const names = winners
      .map((id) => (state?.players || []).find((p) => String(p.id) === id)?.name || "Player")
      .join(", ");
    return `${name} left. ${names} win.`;
  }
  return `${name} left and loses.`;
}

export function applyForfeit(state, game, leaverId) {
  const id = String(leaverId);
  const winnerIds = winnerIdsFor(state, id);
  const name = leaverName(state, id);
  const message = winnerIds.length ? `${name} left. Match over.` : `${name} left and loses.`;
  const next = {
    ...state,
    phase: "over",
    winnerId: winnerIds.length === 1 ? winnerIds[0] : null,
    winnerIds,
    forfeit: true,
    forfeitId: id,
    message,
  };
  if (game === "holdem") next.street = "over";
  if (game === "werewolf") next.winner = null;
  if (Array.isArray(state?.log)) {
    next.log = [...state.log, { id: `forfeit_${id}_${Date.now().toString(36)}`, text: message }];
  }
  return next;
}

export function withForfeitView(view, state, game, viewerId) {
  if (!state?.forfeit || !view) return view;
  return {
    ...view,
    phase: "over",
    street: game === "holdem" ? "over" : view.street,
    forfeit: true,
    forfeitId: state.forfeitId,
    winnerId: state.winnerId ?? null,
    winnerIds: state.winnerIds || [],
    winner: game === "werewolf" ? null : view.winner,
    message: forfeitMessage(state, viewerId),
  };
}
