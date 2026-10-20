/** Flying chess rules — run: node scripts/test-ludo.mjs */
import {
  COLORS,
  FINISH,
  FLY_FROM,
  FLY_TO,
  HOME,
  LAST_OUTER,
  START_AT,
  TRACK,
  applyLudoAction,
  applyLudoRoll,
  homeCount,
  legalMoves,
  startLudoLobby,
  startLudoPractice,
  trackIndex,
} from "../src/games/ludo/engine.ts";

function assert(name, cond) {
  if (!cond) throw new Error(`FAIL ${name}`);
  console.log(`ok ${name}`);
}

function abs(colorIdx, pos) {
  return trackIndex(colorIdx, pos);
}

function posOn(colorIdx, targetAbs) {
  for (let pos = 0; pos <= LAST_OUTER; pos += 1) {
    if (abs(colorIdx, pos) === targetAbs) return pos;
  }
  throw new Error(`no pos for color ${colorIdx} on ${targetAbs}`);
}

function withPlanes(state, actorId, positions, dice) {
  const turn = state.players.findIndex((p) => p.id === actorId);
  const players = state.players.map((p) => {
    if (p.id !== actorId && !positions[p.id]) return p;
    const mine = positions[p.id];
    if (!mine) return p;
    return {
      ...p,
      planes: p.planes.map((plane) => ({ ...plane, pos: mine[plane.slot] ?? plane.pos })),
    };
  });
  return { ...state, players, turn, phase: "move", dice, sixes: 0 };
}

{
  assert("52 track squares", TRACK.length === 52);
  const keys = TRACK.map(([r, c]) => `${r},${c}`);
  assert("track cells unique", new Set(keys).size === 52);
  let area = 0;
  for (let i = 0; i < TRACK.length; i += 1) {
    const a = TRACK[i];
    const b = TRACK[(i + 1) % TRACK.length];
    area += a[1] * b[0] - b[1] * a[0];
  }
  assert("track is clockwise", area > 0);
  COLORS.forEach((color, i) => {
    assert(`${color} home is 6`, HOME[i].length === 6);
    for (const [r, c] of HOME[i]) assert(`${color} home off the track`, !keys.includes(`${r},${c}`));
  });
  assert("blue ready", TRACK[START_AT[0]][0] === 6 && TRACK[START_AT[0]][1] === 13);
  assert("red ready", TRACK[START_AT[1]][0] === 1 && TRACK[START_AT[1]][1] === 6);
  assert("yellow ready", TRACK[START_AT[2]][0] === 8 && TRACK[START_AT[2]][1] === 1);
  assert("green ready", TRACK[START_AT[3]][0] === 13 && TRACK[START_AT[3]][1] === 8);
  assert("blue door", abs(0, LAST_OUTER) === 14 && TRACK[14][0] === 7 && TRACK[14][1] === 14);
  assert("red door", abs(1, LAST_OUTER) === 1 && TRACK[1][0] === 0 && TRACK[1][1] === 7);
  assert("shared fly offset", [0, 1, 2, 3].every((i) => abs(i, FLY_FROM) != null && abs(i, FLY_TO) != null));
  const blueIn = abs(0, FLY_FROM);
  const blueOut = abs(0, FLY_TO);
  assert("blue shortcut is vertical", TRACK[blueIn][1] === TRACK[blueOut][1] && TRACK[blueOut][0] > TRACK[blueIn][0]);
  const greenIn = abs(3, FLY_FROM);
  const greenOut = abs(3, FLY_TO);
  assert("green shortcut is horizontal", TRACK[greenIn][0] === TRACK[greenOut][0] && TRACK[greenOut][1] < TRACK[greenIn][1]);
  const redIn = abs(1, FLY_FROM);
  const redOut = abs(1, FLY_TO);
  assert("red shortcut points right", TRACK[redIn][0] === TRACK[redOut][0] && TRACK[redOut][1] > TRACK[redIn][1]);
  const yellowIn = abs(2, FLY_FROM);
  const yellowOut = abs(2, FLY_TO);
  assert("yellow shortcut points up", TRACK[yellowIn][1] === TRACK[yellowOut][1] && TRACK[yellowOut][0] < TRACK[yellowIn][0]);
}

{
  const lobby = startLudoLobby([
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ]);
  assert("lobby waits", lobby.phase === "lobby" && lobby.players.length === 3);
  assert("guest cannot start", applyLudoAction(lobby, "b", { type: "start" }) === lobby);
  const live = applyLudoAction(lobby, "a", { type: "start" });
  assert("host starts", live.phase === "roll" && live.players.map((p) => p.color).join() === "blue,red,yellow");
}

{
  let s = startLudoPractice();
  assert("practice seats", s.players[0].color === "blue" && s.players[1].id === "cpu-1");
  s = applyLudoRoll(s, "you", 5);
  assert("5 cannot take off", s.turn === 1 && s.players[0].planes.every((p) => p.pos === -1) && s.phase === "roll");
  s = applyLudoRoll(s, "cpu-1", 6);
  const takeoff = legalMoves(s, 1);
  assert("6 offers four takeoffs", takeoff.length === 4);
  s = applyLudoAction(s, "cpu-1", { type: "move", pieceId: takeoff[0] });
  assert("takeoff lands on ready", s.players[1].planes.filter((p) => p.pos === 0).length === 1);
  assert("6 rolls again", s.turn === 1 && s.phase === "roll" && s.sixes === 1);
}

{
  let s = startLudoPractice();
  for (let n = 0; n < 3; n += 1) {
    s = applyLudoRoll(s, "you", 6);
    const id = s.players[0].planes.find((p) => p.pos < 0 && legalMoves(s, 0).includes(p.id)).id;
    s = applyLudoAction(s, "you", { type: "move", pieceId: id });
  }
  assert("third six passes", s.turn === 1 && s.sixes === 0 && s.phase === "roll");
  assert("three planes out", s.players[0].planes.filter((p) => p.pos === 0).length === 3);
}

{
  let s = startLudoPractice();
  const redOn = posOn(1, abs(0, 21));
  s = withPlanes(s, "you", { you: { 0: 20 }, "cpu-1": { 0: redOn } }, 1);
  const id = s.players[0].planes[0].id;
  s = applyLudoAction(s, "you", { type: "move", pieceId: id });
  assert("capture sends opponent home", s.players[1].planes[0].pos === -1 && s.players[0].planes[0].pos === 21);
}

{
  let s = startLudoPractice();
  const redOn = posOn(1, abs(0, 21));
  s = withPlanes(s, "you", { you: { 0: 20 }, "cpu-1": { 0: redOn, 1: redOn } }, 1);
  assert("stack blocks landing", legalMoves(s, 0).length === 0);
}

{
  let s = startLudoPractice();
  s = withPlanes(s, "you", { you: { 0: 16 } }, 1);
  s = applyLudoAction(s, "you", { type: "move", pieceId: s.players[0].planes[0].id });
  assert("exact landing flies", s.players[0].planes[0].pos === FLY_TO);
}

{
  let s = startLudoPractice();
  s = withPlanes(s, "you", { you: { 0: 15 } }, 3);
  s = applyLudoAction(s, "you", { type: "move", pieceId: s.players[0].planes[0].id });
  assert("passing the arrow does not fly", s.players[0].planes[0].pos === 18);
}

{
  let s = startLudoPractice();
  const gate = abs(0, FLY_FROM);
  const redPos = posOn(1, gate);
  s = withPlanes(s, "cpu-1", { "cpu-1": { 0: redPos - 1 } }, 1);
  s = applyLudoAction(s, "cpu-1", { type: "move", pieceId: s.players[1].planes[0].id });
  assert("other colors ignore the shortcut", s.players[1].planes[0].pos === redPos);
}

{
  let s = startLudoPractice();
  const exit = abs(0, FLY_TO);
  const redPos = posOn(1, exit);
  s = withPlanes(s, "you", { you: { 0: 16 }, "cpu-1": { 0: redPos, 1: redPos } }, 1);
  s = applyLudoAction(s, "you", { type: "move", pieceId: s.players[0].planes[0].id });
  assert("blocked shortcut stays on the arrow", s.players[0].planes[0].pos === FLY_FROM);
}

{
  let s = startLudoPractice();
  s = withPlanes(s, "you", { you: { 0: 54 } }, 3);
  assert("overshoot is illegal", legalMoves(s, 0).length === 0);
  s = { ...s, dice: 2 };
  s = applyLudoAction(s, "you", { type: "move", pieceId: s.players[0].planes[0].id });
  assert("exact finish from the stretch", s.players[0].planes[0].pos === FINISH && homeCount(s.players[0]) === 1);
}

{
  let s = startLudoPractice();
  s = withPlanes(s, "you", { you: { 0: 55, 1: FINISH, 2: FINISH, 3: FINISH } }, 1);
  s = applyLudoAction(s, "you", { type: "move", pieceId: s.players[0].planes[0].id });
  assert("fourth plane wins", s.phase === "over" && s.winnerId === "you");
}

{
  let s = startLudoPractice();
  const startAbs = abs(0, 0);
  const redPos = posOn(1, startAbs);
  s = withPlanes(s, "you", { you: { 0: -1 }, "cpu-1": { 0: redPos } }, 6);
  s = applyLudoAction(s, "you", { type: "move", pieceId: s.players[0].planes[0].id });
  assert("takeoff captures the ready square", s.players[0].planes[0].pos === 0 && s.players[1].planes[0].pos === -1);
}

console.log("flying chess rules ok");
