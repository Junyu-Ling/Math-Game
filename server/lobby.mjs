const ONLINE_MS = 15000;
const presence = new Map();
const invites = new Map();
const rooms = new Map();
const userRoom = new Map();

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function prune() {
  const now = Date.now();
  for (const [id, p] of presence) {
    if (now - p.seenAt > ONLINE_MS) presence.delete(id);
  }
  for (const [id, inv] of invites) {
    if (now - inv.createdAt > 60000) invites.delete(id);
  }
}

export function heartbeat(user, href = "") {
  prune();
  const name = user.name || user.login || user.email || "PLAYER";
  presence.set(user.id, {
    id: user.id,
    name,
    email: user.email || "",
    avatar: user.avatar || "",
    seenAt: Date.now(),
    href,
    roomId: userRoom.get(user.id) || null,
  });
  return snapshot(user.id);
}

export function snapshot(userId) {
  prune();
  expireArrange();
  const online = [...presence.values()]
    .filter((p) => p.id !== userId)
    .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, roomId: p.roomId }));
  const mine = [...invites.values()].filter((i) => i.toId === userId || i.fromId === userId);
  const rid = userRoom.get(userId);
  const room = rid ? publicRoom(rooms.get(rid), userId) : null;
  return { online, invites: mine, room };
}

function expireArrange() {
  for (const room of rooms.values()) {
    if (room.game !== "coda" || !room.endsAt || Date.now() < room.endsAt) continue;
    room.state = room.mods.finishArrange(room.state);
    room.endsAt = null;
  }
}

export function createInvite(from, toId, game, meta = {}) {
  prune();
  if (from.id === toId) throw new Error("不能邀请自己");
  const target = presence.get(toId);
  if (!target) throw new Error("对方不在线");
  if (userRoom.get(from.id) || userRoom.get(toId)) throw new Error("有人已在对局中");
  const id = uid("inv");
  const invite = {
    id,
    game,
    fromId: from.id,
    fromName: from.name || from.login || from.email || "PLAYER",
    toId,
    toName: target.name,
    meta,
    createdAt: Date.now(),
  };
  invites.set(id, invite);
  return invite;
}

export async function respondInvite(user, inviteId, accept, mods) {
  const invite = invites.get(inviteId);
  if (!invite) throw new Error("邀请已失效");
  if (invite.toId !== user.id) throw new Error("不是给你的邀请");
  invites.delete(inviteId);
  if (!accept) return { ok: true, declined: true };
  if (userRoom.get(invite.fromId) || userRoom.get(invite.toId)) throw new Error("有人已在对局中");
  const from = presence.get(invite.fromId);
  if (!from) throw new Error("对方已离线");
  const room = startRoom(invite, from, user, mods);
  return { ok: true, room: publicRoom(room, user.id) };
}

function startRoom(invite, from, to, mods) {
  const a = { id: from.id, name: from.name };
  const b = { id: to.id, name: to.name };
  const meta = invite.meta || {};
  let state;
  let endsAt = null;
  if (invite.game === "coda") {
    const black = Math.max(0, Math.min(4, Number(meta.black) || 2));
    const white = 4 - black;
    state = mods.coda.startCodaMatch(Boolean(meta.useJokers), { ...a, black, white }, { ...b, black: 4 - black, white: 4 - white });
    if (state.phase === "arrange") endsAt = Date.now() + mods.coda.ARRANGE_MS;
  } else if (invite.game === "flip7") {
    state = mods.flip.startFlip7Duel(a, b);
  } else if (invite.game === "bj") {
    state = mods.bj.startBjDuel(a, b);
  } else if (invite.game === "m24") {
    state = mods.m24.startM24Duel(a, b);
  } else {
    throw new Error("未知游戏");
  }
  const room = {
    id: uid("room"),
    game: invite.game,
    seats: [a.id, b.id],
    state,
    endsAt,
    mods,
  };
  rooms.set(room.id, room);
  userRoom.set(a.id, room.id);
  userRoom.set(b.id, room.id);
  if (presence.get(a.id)) presence.get(a.id).roomId = room.id;
  if (presence.get(b.id)) presence.get(b.id).roomId = room.id;
  return room;
}

export function applyRoomAction(user, roomId, action, mods) {
  expireArrange();
  const room = rooms.get(roomId);
  if (!room || !room.seats.includes(user.id)) throw new Error("对局不存在");
  const before = room.state;
  if (room.game === "coda") {
    room.state = mods.coda.applyAction(room.state, user.id, action);
    if (room.state.phase === "arrange" && before.phase !== "arrange") {
      room.endsAt = Date.now() + mods.coda.ARRANGE_MS;
    }
  } else if (room.game === "flip7") {
    room.state = mods.flip.applyFlipAction(room.state, user.id, action);
  } else if (room.game === "bj") {
    room.state = mods.bj.applyBjDuelAction(room.state, user.id, action);
  } else if (room.game === "m24") {
    room.state = mods.m24.applyM24Action(room.state, user.id, action);
  }
  return publicRoom(room, user.id);
}

export function leaveRoom(userId) {
  const rid = userRoom.get(userId);
  if (!rid) return snapshot(userId);
  const room = rooms.get(rid);
  if (room && room.state?.phase !== "over") {
    room.state = {
      ...room.state,
      phase: "over",
      winnerId: room.seats.find((id) => id !== userId) || null,
      message: "对手离开。",
    };
  }
  for (const id of room?.seats || []) {
    userRoom.delete(id);
    if (presence.get(id)) presence.get(id).roomId = null;
  }
  rooms.delete(rid);
  return snapshot(userId);
}

function publicRoom(room, viewerId) {
  if (!room) return null;
  let view = room.state;
  if (room.game === "coda") view = room.mods.coda.viewFor(room.state, viewerId);
  if (room.game === "bj") view = room.mods.bj.viewBjDuel(room.state, viewerId);
  if (room.game === "m24") view = room.mods.m24.viewM24(room.state, viewerId);
  return {
    id: room.id,
    game: room.game,
    seats: room.seats,
    endsAt: room.endsAt,
    view,
  };
}
