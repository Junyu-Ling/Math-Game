// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/ludo/engine.ts
var COLORS = ["blue", "red", "yellow", "green"];
var TRACK = [
  [0, 6],
  [0, 7],
  [0, 8],
  [1, 8],
  [2, 8],
  [3, 8],
  [4, 8],
  [5, 8],
  [6, 9],
  [6, 10],
  [6, 11],
  [6, 12],
  [6, 13],
  [6, 14],
  [7, 14],
  [8, 14],
  [8, 13],
  [8, 12],
  [8, 11],
  [8, 10],
  [8, 9],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
  [14, 8],
  [14, 7],
  [14, 6],
  [13, 6],
  [12, 6],
  [11, 6],
  [10, 6],
  [9, 6],
  [8, 5],
  [8, 4],
  [8, 3],
  [8, 2],
  [8, 1],
  [8, 0],
  [7, 0],
  [6, 0],
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [6, 5],
  [5, 6],
  [4, 6],
  [3, 6],
  [2, 6],
  [1, 6]
];
var START_AT = [42, 3, 16, 29];
var HOME = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]]
];
var FLY_FROM = 17;
var FLY_TO = 31;
var LAST_OUTER = 50;
var FINISH = 56;
var MAX_SIXES = 3;
var PAINT = ["red", "yellow", "blue", "green"];
function trackCell(index) {
  const n = TRACK.length;
  return TRACK[(index % n + n) % n] ?? [0, 6];
}
function trackColor(index) {
  return PAINT[index % PAINT.length] ?? "blue";
}
function startTrackIndex(colorIdx) {
  return START_AT[colorIdx] ?? 0;
}
function flyTrackIndex(colorIdx) {
  return (startTrackIndex(colorIdx) + FLY_FROM) % TRACK.length;
}
function trackIndex(colorIdx, pos) {
  if (pos < 0 || pos > LAST_OUTER) return null;
  return (startTrackIndex(colorIdx) + pos) % TRACK.length;
}
function planeCell(colorIdx, pos) {
  if (pos < 0) return null;
  if (pos <= LAST_OUTER) {
    const cell2 = trackCell(trackIndex(colorIdx, pos) ?? 0);
    return { r: cell2[0], c: cell2[1] };
  }
  if (pos > FINISH) return null;
  const cell = HOME[colorIdx]?.[pos - (LAST_OUTER + 1)];
  if (!cell) return null;
  return { r: cell[0], c: cell[1] };
}
function dirOf(dr, dc) {
  if (Math.abs(dc) > Math.abs(dr)) return dc > 0 ? "e" : "w";
  return dr > 0 ? "s" : "n";
}
function trackDir(index) {
  const here = trackCell(index);
  const next = trackCell(index + 1);
  return dirOf(next[0] - here[0], next[1] - here[1]);
}
function flyDir(colorIdx) {
  const from = trackCell(flyTrackIndex(colorIdx));
  const to = trackCell(startTrackIndex(colorIdx) + FLY_TO);
  return dirOf(to[0] - from[0], to[1] - from[1]);
}
function homeDir(colorIdx) {
  return ["e", "s", "w", "n"][colorIdx] ?? "e";
}
function planeHeading(colorIdx, pos) {
  if (pos < 0) return [90, 180, -90, 0][colorIdx] ?? 0;
  if (pos >= FINISH) return [0, 90, 180, -90][colorIdx] ?? 0;
  const here = planeCell(colorIdx, pos);
  const next = planeCell(colorIdx, pos + 1);
  if (!here || !next) return 0;
  const dir = dirOf(next.r - here.r, next.c - here.c);
  if (dir === "e") return 0;
  if (dir === "s") return 90;
  if (dir === "w") return 180;
  return -90;
}
function homeCount(player) {
  return player.planes.filter((p) => p.pos === FINISH).length;
}
function colorIdxOf(player) {
  const i = COLORS.indexOf(player.color);
  return i < 0 ? 0 : i;
}
function occupants(state, abs, ignoreId) {
  const found = [];
  state.players.forEach((pl, playerIdx) => {
    const ci = colorIdxOf(pl);
    for (const plane of pl.planes) {
      if (plane.id === ignoreId) continue;
      if (trackIndex(ci, plane.pos) === abs) found.push({ playerIdx, plane });
    }
  });
  return found;
}
function landingAt(state, moverIdx, abs, ignoreId) {
  const foes = occupants(state, abs, ignoreId).filter((o) => o.playerIdx !== moverIdx);
  if (foes.length >= 2) return { blocked: true, captures: [] };
  if (foes.length === 1) return { blocked: false, captures: [foes[0].plane.id] };
  return { blocked: false, captures: [] };
}
function planMove(state, moverIdx, plane, dice) {
  const ci = colorIdxOf(state.players[moverIdx]);
  if (plane.pos < 0) {
    if (dice !== 6) return null;
    const gate = landingAt(state, moverIdx, trackIndex(ci, 0) ?? 0, plane.id);
    if (gate.blocked) return null;
    return { pos: 0, flew: false, captures: gate.captures };
  }
  if (plane.pos >= FINISH) return null;
  const raw = plane.pos + dice;
  if (raw > FINISH) return null;
  if (raw > LAST_OUTER) return { pos: raw, flew: false, captures: [] };
  if (raw === FLY_FROM) {
    const entrance = landingAt(state, moverIdx, trackIndex(ci, FLY_FROM) ?? 0, plane.id);
    if (entrance.blocked) return null;
    const exit = landingAt(state, moverIdx, trackIndex(ci, FLY_TO) ?? 0, plane.id);
    if (!exit.blocked) {
      return { pos: FLY_TO, flew: true, captures: [...entrance.captures, ...exit.captures] };
    }
    return { pos: FLY_FROM, flew: false, captures: entrance.captures };
  }
  const land = landingAt(state, moverIdx, trackIndex(ci, raw) ?? 0, plane.id);
  if (land.blocked) return null;
  return { pos: raw, flew: false, captures: land.captures };
}
function legalMoves(state, playerIdx) {
  if (state.phase !== "move" || state.dice == null) return [];
  const me = state.players[playerIdx];
  if (!me) return [];
  const out = [];
  for (const plane of me.planes) {
    if (planMove(state, playerIdx, plane, state.dice)) out.push(plane.id);
  }
  return out;
}
function makePlayer(p, index) {
  const color = COLORS[index] ?? "blue";
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    color,
    planes: [0, 1, 2, 3].map((slot) => ({ id: uid(`p${index}${slot}`), slot, pos: -1 }))
  };
}
function startLudoLobby(people) {
  const players = people.slice(0, 4).map(makePlayer);
  return {
    players,
    turn: 0,
    dice: null,
    sixes: 0,
    phase: "lobby",
    winnerId: null,
    log: [{ id: uid("l"), text: `Table ${players.length}/4. Host starts at 2\u20134. Roll 6 to take off.` }]
  };
}
function startLudoTable(people) {
  const seated = people.slice(0, 4);
  if (seated.length < 2) return startLudoLobby(seated);
  const players = seated.map(makePlayer);
  return {
    players,
    turn: 0,
    dice: null,
    sixes: 0,
    phase: "roll",
    winnerId: null,
    log: [
      {
        id: uid("l"),
        text: `${players.map((p) => `${p.name} (${p.color})`).join(" \xB7 ")}. Roll 6 to leave the hangar. First to bring all 4 planes home wins.`
      }
    ]
  };
}
function startLudoPractice() {
  return startLudoTable([
    { id: "you", name: "YOU", human: true },
    { id: "cpu-1", name: "CPU", human: false }
  ]);
}
function startLudoDuel(a, b) {
  return startLudoTable([
    { id: a.id, name: a.name, human: a.human !== false },
    { id: b.id, name: b.name, human: b.human !== false }
  ]);
}
function endTurn(state, log) {
  const n = Math.max(1, state.players.length);
  return { ...state, log, phase: "roll", sixes: 0, turn: (state.turn + 1) % n };
}
function applyLanding(state, moverIdx, planeId, landing) {
  const capture = new Set(landing.captures);
  return state.players.map((pl, pi) => ({
    ...pl,
    planes: pl.planes.map((plane) => {
      if (capture.has(plane.id)) return { ...plane, pos: -1 };
      if (pi === moverIdx && plane.id === planeId) return { ...plane, pos: landing.pos };
      return plane;
    })
  }));
}
function capturedNames(state, ids) {
  const names = [];
  for (const id of ids) {
    const owner = state.players.find((p) => p.planes.some((pl) => pl.id === id));
    if (owner && !names.includes(owner.name)) names.push(owner.name);
  }
  return names;
}
function applyLudoRoll(state, actorId, dice) {
  if (state.phase === "over" || state.phase === "lobby") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;
  if (state.phase === "move") {
    if (legalMoves(state, state.turn).length === 0) {
      return endTurn(state, [...state.log, { id: uid("l"), text: "No legal move." }]);
    }
    return state;
  }
  const face = Math.trunc(dice);
  if (face < 1 || face > 6) return state;
  const rolled = {
    ...state,
    dice: face,
    phase: "move",
    log: [...state.log, { id: uid("l"), text: `${me.name} rolls ${face}.` }]
  };
  if (legalMoves(rolled, state.turn).length === 0) {
    return endTurn(rolled, [...rolled.log, { id: uid("l"), text: "No legal move." }]);
  }
  return rolled;
}
function applyLudoAction(state, actorId, action) {
  if (state.phase === "over") return state;
  if (!state.players.some((p) => p.id === actorId)) return state;
  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      return startLudoTable(state.players);
    }
    return state;
  }
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;
  if (action.type === "roll") {
    const face = 1 + Math.floor(Math.random() * 6);
    return applyLudoRoll(state, actorId, face);
  }
  if (action.type !== "move" || state.phase !== "move" || state.dice == null) return state;
  const plane = me.planes.find((p) => p.id === action.pieceId);
  if (!plane) return state;
  const landing = planMove(state, state.turn, plane, state.dice);
  if (!landing) return state;
  const players = applyLanding(state, state.turn, plane.id, landing);
  const mover = players[state.turn];
  const parked = mover ? homeCount(mover) : 0;
  const sent = capturedNames(state, landing.captures);
  const won = Boolean(mover && mover.planes.every((p) => p.pos === FINISH));
  let text = plane.pos < 0 ? `${me.name} takes off` : landing.pos === FINISH ? `${me.name} parks a plane (${parked}/4)` : `${me.name} moves`;
  if (landing.flew) text += " \xB7 flies the dotted shortcut";
  if (sent.length) text += ` \xB7 sends ${sent.join(" & ")} back to the hangar`;
  text += ".";
  if (!won && state.dice === 6 && state.sixes + 1 < MAX_SIXES) text += " Rolls again.";
  if (!won && state.dice === 6 && state.sixes + 1 >= MAX_SIXES) text += " Three sixes \u2014 turn passes.";
  const log = [...state.log, { id: uid("l"), text }];
  if (won && mover) {
    return {
      ...state,
      players,
      phase: "over",
      winnerId: mover.id,
      sixes: 0,
      log: [...log, { id: uid("l"), text: `${mover.name} brings all 4 planes home.` }]
    };
  }
  const moved = { ...state, players, log };
  if (state.dice === 6 && state.sixes + 1 < MAX_SIXES) {
    return { ...moved, phase: "roll", turn: state.turn, sixes: state.sixes + 1 };
  }
  return endTurn(moved, log);
}
function viewLudo(state, _viewerId) {
  return state;
}
function aiLudo(state) {
  if (state.phase !== "move" || state.dice == null) return { type: "roll" };
  const me = state.players[state.turn];
  const moves = legalMoves(state, state.turn);
  if (!me || moves.length === 0) return { type: "roll" };
  let best = moves[0];
  let bestScore = -Infinity;
  for (const id of moves) {
    const plane = me.planes.find((p) => p.id === id);
    if (!plane) continue;
    const landing = planMove(state, state.turn, plane, state.dice);
    if (!landing) continue;
    let score = landing.pos;
    if (landing.pos === FINISH) score += 2e3;
    if (landing.captures.length) score += 800;
    if (landing.flew) score += 500;
    if (plane.pos < 0) score += 450;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return { type: "move", pieceId: best };
}
export {
  COLORS,
  FINISH,
  FLY_FROM,
  FLY_TO,
  HOME,
  LAST_OUTER,
  MAX_SIXES,
  START_AT,
  TRACK,
  aiLudo,
  applyLudoAction,
  applyLudoRoll,
  flyDir,
  flyTrackIndex,
  homeCount,
  homeDir,
  legalMoves,
  planeCell,
  planeHeading,
  startLudoDuel,
  startLudoLobby,
  startLudoPractice,
  startLudoTable,
  startTrackIndex,
  trackColor,
  trackDir,
  trackIndex,
  viewLudo
};
