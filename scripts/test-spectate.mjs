delete process.env.REDIS_URL;

const assert = (await import("node:assert/strict")).default;
const L = await import("../server/lobby.mjs");

const host = { id: "spec_host", name: "Host", email: "host@test.local" };
const fan = { id: "spec_fan", name: "Fan", email: "fan@test.local" };

await L.leaveRoom(host.id);
await L.leaveRoom(fan.id);
await L.touchPresence(host, "/play/ttt");
await L.touchPresence(fan, "/play/ttt");

const opened = await L.adjustCpu(host, "ttt", "open");
assert.ok(opened.room?.id, "cpu table opens");
const added = await L.adjustCpu(host, "ttt", "add");
assert.equal(added.room.seats.length, 2);
const started = await L.applyRoomAction(host, added.room.id, { type: "ready" });
assert.equal(started.view.phase, "play", "ready starts the cpu match");

await L.touchPresence(host, "/play/ttt");
const roster = await L.snapshot(fan.id);
const row = roster.online.find((p) => p.id === host.id);
assert.ok(row?.roomId, "invite list shows the host in a game");
assert.equal(row.online, true);

const watching = await L.spectateUser(fan, host.id);
assert.equal(watching.room?.spectate, true);
assert.ok((watching.room.tape?.length || 0) >= 1, "watch has a timeline");
assert.equal(watching.room.view.phase, "play");
assert.ok(watching.room.tape[0].views?.watch, "the table view is on every frame");
assert.ok(watching.room.tape[0].views[host.id], "a seat view is on every frame");

const hostStill = await L.snapshot(host.id);
assert.equal(hostStill.room?.id, added.room.id, "watching does not take the seat");
assert.equal(hostStill.room?.spectate, undefined);

const left = await L.leaveWatch(fan.id);
assert.equal(left.room, null, "exit watch is immediate");
const hostAfter = await L.snapshot(host.id);
assert.equal(hostAfter.room?.id, added.room.id, "exit watch does not forfeit the table");

async function waitCpu() {
  const cur = await L.snapshot(host.id);
  return L.watchLobby(host, cur.room?.seq || 0, -1, "", 900);
}

let guard = 0;
let view = hostAfter.room.view;
while (view.phase !== "over" && guard++ < 12) {
  const turn = view.players?.[view.turn];
  if (turn?.id === host.id) {
    const i = view.board.findIndex((cell) => !cell);
    assert.ok(i >= 0, "board has an empty cell");
    const step = await L.applyRoomAction(host, added.room.id, { type: "place", i });
    view = step.view;
  } else {
    const pumped = await waitCpu();
    view = pumped.room.view;
  }
}
assert.equal(view.phase, "over", "cpu match finishes");

const history = await L.listHistory(host.id);
assert.ok(history.some((row) => row.game === "ttt"), "the match is in the last 100");
const mine = history.find((row) => row.game === "ttt");
const tape = await L.loadHistoryTape(host, mine.id);
assert.ok(tape.tape.length >= 2, "recording can be scrubbed");
assert.equal(tape.tape[0].view.phase === "over", false);
assert.equal(tape.tape[tape.tape.length - 1].view.phase, "over");
assert.equal(tape.room.id.startsWith("replay:"), true);

console.log("ok", { frames: tape.tape.length, records: history.length });
