import Redis from "ioredis";
import { loadMods } from "./game-mods.mjs";

const ONLINE_SEC = 20;
const INVITE_SEC = 60;
const ROOM_SEC = 7200;
const INVITE_COOLDOWN_MS = 5000;
const USER_SEC = 90 * 24 * 3600;

const mem = new Map();
let redis = null;
let redisTried = false;
let modsCache = null;

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function lobbyStoreKind() {
  return process.env.REDIS_URL ? "redis" : "memory";
}

function client() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis && !redisTried) {
    redisTried = true;
    const tls = url.startsWith("rediss://") ? { rejectUnauthorized: true } : undefined;
    redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
      connectTimeout: 8000,
      tls,
    });
    redis.on("error", () => {});
  }
  return redis;
}

function memGet(key) {
  const row = mem.get(key);
  if (!row) return null;
  if (row.exp && Date.now() > row.exp) {
    mem.delete(key);
    return null;
  }
  return row.raw;
}

function memSet(key, raw, ttlSec) {
  mem.set(key, { raw, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
}

async function kvGet(key) {
  const r = client();
  if (r) {
    try {
      const v = await r.get(key);
      if (v != null) return v;
    } catch {
      /* memory */
    }
  }
  return memGet(key);
}

async function kvSet(key, value, ttlSec) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const r = client();
  if (r) {
    try {
      if (ttlSec) await r.set(key, raw, "EX", ttlSec);
      else await r.set(key, raw);
      return;
    } catch {
      /* memory */
    }
  }
  memSet(key, raw, ttlSec);
}

async function kvDel(key) {
  const r = client();
  if (r) {
    try {
      await r.del(key);
    } catch {
      /* memory */
    }
  }
  mem.delete(key);
}

async function sadd(key, member, ttlSec) {
  const r = client();
  if (r) {
    try {
      await r.sadd(key, member);
      if (ttlSec) await r.expire(key, ttlSec);
      return;
    } catch {
      /* memory */
    }
  }
  const cur = JSON.parse(memGet(key) || "[]");
  if (!cur.includes(member)) cur.push(member);
  memSet(key, JSON.stringify(cur), ttlSec || 0);
}

async function srem(key, member) {
  const r = client();
  if (r) {
    try {
      await r.srem(key, member);
      return;
    } catch {
      /* memory */
    }
  }
  const cur = JSON.parse(memGet(key) || "[]").filter((x) => x !== member);
  memSet(key, JSON.stringify(cur), 3600);
}

async function smembers(key) {
  const r = client();
  if (r) {
    try {
      return await r.smembers(key);
    } catch {
      /* memory */
    }
  }
  return JSON.parse(memGet(key) || "[]");
}

async function getMods() {
  if (!modsCache) modsCache = await loadMods();
  return modsCache;
}

function playerName(user) {
  return user.name || user.login || user.email || "PLAYER";
}

async function readJson(key) {
  const raw = await kvGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listPresence() {
  const ids = await smembers("axiom:online");
  const now = Date.now();
  const out = [];
  const r = client();
  if (r && ids.length) {
    try {
      const keys = ids.map((id) => `axiom:p:${id}`);
      const rows = await r.mget(...keys);
      for (let i = 0; i < ids.length; i++) {
        const raw = rows[i];
        if (!raw) {
          await srem("axiom:online", ids[i]);
          continue;
        }
        let p;
        try {
          p = JSON.parse(raw);
        } catch {
          continue;
        }
        if (!p || now - p.seenAt > ONLINE_SEC * 1000) {
          await srem("axiom:online", ids[i]);
          await kvDel(`axiom:p:${ids[i]}`);
          continue;
        }
        out.push(p);
      }
      return out;
    } catch {
      /* fallback */
    }
  }
  for (const id of ids) {
    const p = await readJson(`axiom:p:${id}`);
    if (!p || now - p.seenAt > ONLINE_SEC * 1000) {
      await srem("axiom:online", id);
      await kvDel(`axiom:p:${id}`);
      continue;
    }
    out.push(p);
  }
  return out;
}

export async function rememberPlayer(user) {
  const id = String(user.id);
  const rec = {
    id,
    name: playerName(user),
    avatar: user.avatar || "",
    email: user.email || "",
  };
  await kvSet(`axiom:u:${id}`, rec, USER_SEC);
  await sadd("axiom:users", id);
}

export async function saveAccount(user) {
  const id = String(user.id);
  await kvSet(`axiom:acct:${id}`, user, USER_SEC);
  if (user.email) await kvSet(`axiom:acctemail:${String(user.email).toLowerCase()}`, id, USER_SEC);
  await rememberPlayer(user);
}

export async function findAccountById(id) {
  return readJson(`axiom:acct:${String(id)}`);
}

export async function findAccountByEmail(email) {
  const id = await kvGet(`axiom:acctemail:${String(email).toLowerCase()}`);
  if (!id) return null;
  return findAccountById(id);
}

export async function stashVerify(email, payload) {
  await kvSet(`axiom:verify:${String(email).toLowerCase()}`, payload, 600);
}

export async function takeVerify(email) {
  return readJson(`axiom:verify:${String(email).toLowerCase()}`);
}

export async function clearVerify(email) {
  await kvDel(`axiom:verify:${String(email).toLowerCase()}`);
}


async function listRoster(viewerId) {
  const live = await listPresence();
  const liveMap = new Map(live.map((p) => [String(p.id), p]));
  let ids = await smembers("axiom:users");
  for (const p of live) {
    const id = String(p.id);
    if (!ids.includes(id)) ids.push(id);
  }
  ids = [...new Set(ids.map(String))].filter((id) => id !== String(viewerId)).slice(0, 200);
  const r = client();
  const profiles = new Map();
  if (r && ids.length) {
    try {
      const rows = await r.mget(...ids.map((id) => `axiom:u:${id}`));
      for (let i = 0; i < ids.length; i++) {
        const raw = rows[i];
        if (!raw) continue;
        try {
          profiles.set(ids[i], JSON.parse(raw));
        } catch {
          /* skip */
        }
      }
    } catch {
      /* fallback */
    }
  }
  if (!profiles.size) {
    for (const id of ids) {
      const p = (await readJson(`axiom:u:${id}`)) || liveMap.get(id);
      if (p) profiles.set(id, p);
    }
  }
  const out = [];
  for (const id of ids) {
    const saved = profiles.get(id);
    const liveP = liveMap.get(id);
    const name = liveP?.name || saved?.name || "PLAYER";
    const avatar = liveP?.avatar || saved?.avatar || "";
    if (!saved && !liveP) continue;
    out.push({
      id,
      name,
      avatar,
      online: Boolean(liveP),
      roomId: liveP?.roomId || null,
    });
  }
  out.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return out;
}

async function getSeat(userId) {
  return (await kvGet(`axiom:seat:${userId}`)) || null;
}

async function getRoomRecord(roomId) {
  return readJson(`axiom:room:${roomId}`);
}

async function saveRoom(room) {
  const rec = {
    id: room.id,
    game: room.game,
    seats: room.seats,
    state: room.state,
    endsAt: room.endsAt,
    seq: room.seq || 0,
  };
  await kvSet(`axiom:room:${room.id}`, rec, ROOM_SEC);
  for (const id of room.seats) await kvSet(`axiom:seat:${id}`, room.id, ROOM_SEC);
}

async function attachMods(rec) {
  if (!rec) return null;
  return { ...rec, mods: await getMods() };
}

export async function heartbeat(user, href = "", light = false) {
  const id = String(user.id);
  const seat = await getSeat(id);
  const rec = {
    id,
    name: playerName(user),
    email: user.email || "",
    avatar: user.avatar || "",
    seenAt: Date.now(),
    href,
    roomId: seat,
  };
  await kvSet(`axiom:p:${id}`, rec, ONLINE_SEC);
  await sadd("axiom:online", id, ONLINE_SEC + 5);
  await rememberPlayer(user);
  return snapshot(id, light);
}

export async function snapshot(userId, light = false) {
  const online = light ? [] : await listRoster(userId);
  const inviteIds = await smembers(`axiom:uinv:${userId}`);
  const invites = [];
  for (const id of inviteIds) {
    const inv = await readJson(`axiom:inv:${id}`);
    if (!inv) {
      await srem(`axiom:uinv:${userId}`, id);
      continue;
    }
    invites.push(inv);
  }
  const rid = await getSeat(userId);
  let room = null;
  if (rid) {
    const rec = await attachMods(await getRoomRecord(rid));
    if (rec) {
      await expireArrange(rec);
      room = publicRoom(rec, userId);
    }
  }
  return { online, invites, room, store: lobbyStoreKind(), light: Boolean(light) };
}

async function expireArrange(room) {
  if (room.game !== "coda" || !room.endsAt || Date.now() < room.endsAt) return;
  room.state = room.mods.coda.finishArrange(room.state);
  room.endsAt = null;
  await saveRoom(room);
}

export async function createInvite(from, toId, game, meta = {}) {
  const fromId = String(from.id);
  toId = String(toId);
  if (fromId === toId) throw new Error("You cannot invite yourself");
  const last = Number((await kvGet(`axiom:invcd:${fromId}`)) || 0);
  if (last && Date.now() - last < INVITE_COOLDOWN_MS) {
    throw new Error("Wait 5 seconds before inviting again");
  }
  const target = await readJson(`axiom:p:${toId}`);
  if (!target) throw new Error("They are not online");
  const fromSeat = await getSeat(fromId);
  const toSeat = await getSeat(toId);
  if (toSeat) throw new Error("Someone is already in a game");
  if (fromSeat) {
    const rec = await getRoomRecord(fromSeat);
    const lobby = rec && rec.game === "guandan" && rec.state?.phase === "lobby";
    if (!lobby) throw new Error("Someone is already in a game");
    if (rec.seats[0] !== fromId) throw new Error("Only the host can invite");
    if (rec.seats.length >= 4) throw new Error("The table is full");
    if (rec.seats.includes(toId)) throw new Error("They are already seated");
    if (game !== "guandan") throw new Error("This table is Guandan");
  }
  const id = uid("inv");
  const invite = {
    id,
    game,
    fromId,
    fromName: playerName(from),
    fromAvatar: from.avatar || "",
    toId,
    toName: target.name,
    toAvatar: target.avatar || "",
    meta,
    createdAt: Date.now(),
  };
  await kvSet(`axiom:inv:${id}`, invite, INVITE_SEC);
  await sadd(`axiom:uinv:${fromId}`, id, INVITE_SEC);
  await sadd(`axiom:uinv:${toId}`, id, INVITE_SEC);
  await kvSet(`axiom:invcd:${fromId}`, String(Date.now()), 15);
  return invite;
}

export async function respondInvite(user, inviteId, accept, mods) {
  const invite = await readJson(`axiom:inv:${inviteId}`);
  if (!invite) throw new Error("Invite expired");
  if (invite.toId !== user.id) throw new Error("This invite is not for you");
  await kvDel(`axiom:inv:${inviteId}`);
  await srem(`axiom:uinv:${invite.fromId}`, inviteId);
  await srem(`axiom:uinv:${invite.toId}`, inviteId);
  if (!accept) return { ok: true, declined: true };
  if (invite.game === "guandan") {
    return joinGuandanTable(user, invite, mods);
  }
  if ((await getSeat(invite.fromId)) || (await getSeat(invite.toId))) throw new Error("Someone is already in a game");
  const from = await readJson(`axiom:p:${invite.fromId}`);
  if (!from) throw new Error("They went offline");
  const room = startRoom(invite, from, user, mods);
  await saveRoom(room);
  return { ok: true, room: publicRoom({ ...room, mods }, user.id) };
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
  } else if (invite.game === "uno") {
    state = mods.uno.startUnoDuel(a, b);
  } else if (invite.game === "holdem") {
    state = mods.holdem.startHoldemDuel(a, b);
  } else {
    throw new Error("Unknown game");
  }
  return {
    id: uid("room"),
    game: invite.game,
    seats: [a.id, b.id],
    state,
    endsAt,
    seq: 1,
  };
}

async function joinGuandanTable(user, invite, mods) {
  const hostId = String(invite.fromId);
  const joiner = { id: String(user.id), name: playerName(user) };
  if (await getSeat(joiner.id)) throw new Error("You are already in a game");
  const hostSeat = await getSeat(hostId);
  let rec = hostSeat ? await getRoomRecord(hostSeat) : null;
  const host = await readJson(`axiom:p:${hostId}`);
  if (!host) throw new Error("They went offline");
  if (rec && rec.game === "guandan" && rec.state?.phase === "lobby") {
    if (rec.seats.includes(joiner.id)) throw new Error("Already seated");
    if (rec.seats.length >= 4) throw new Error("The table is full");
    rec.seats = [...rec.seats, joiner.id];
    rec.state = mods.guandan.startGuandanLobby(
      rec.seats.map((id) => {
        const existing = rec.state.players.find((p) => p.id === id);
        if (existing) return { id, name: existing.name };
        return joiner;
      }),
    );
    if (rec.seats.length === 4) {
      rec.state = mods.guandan.startGuandanTable(rec.state.players.map((p) => ({ id: p.id, name: p.name })));
    }
    rec.seq = (rec.seq || 0) + 1;
    rec.mods = mods;
    await saveRoom(rec);
    return { ok: true, room: publicRoom(rec, user.id) };
  }
  if (hostSeat) throw new Error("Host is already in a game");
  const state = mods.guandan.startGuandanLobby([
    { id: hostId, name: host.name },
    joiner,
  ]);
  const room = {
    id: uid("room"),
    game: "guandan",
    seats: [hostId, joiner.id],
    state,
    endsAt: null,
    seq: 1,
    mods,
  };
  await saveRoom(room);
  return { ok: true, room: publicRoom(room, user.id) };
}

export async function applyRoomAction(user, roomId, action, mods) {
  mods = mods || (await getMods());
  const rec = await getRoomRecord(roomId);
  if (!rec || !rec.seats.includes(user.id)) throw new Error("Game not found");
  const room = { ...rec, mods };
  await expireArrange(room);
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
  } else if (room.game === "uno") {
    room.state = mods.uno.applyUnoAction(room.state, user.id, action);
  } else if (room.game === "holdem") {
    room.state = mods.holdem.applyHoldemAction(room.state, user.id, action);
  } else if (room.game === "guandan") {
    if (room.state?.phase === "play") {
      room.state = mods.guandan.applyGuandanAction(room.state, user.id, action);
    }
  }
  room.seq = (room.seq || 0) + 1;
  await saveRoom(room);
  return publicRoom(room, user.id);
}

export async function leaveRoom(userId) {
  const rid = await getSeat(userId);
  if (!rid) return snapshot(userId);
  const rec = await attachMods(await getRoomRecord(rid));
  if (rec?.game === "guandan" && rec.state?.phase === "lobby") {
    const hostLeft = rec.seats[0] === userId;
    await kvDel(`axiom:seat:${userId}`);
    if (hostLeft || rec.seats.length <= 2) {
      for (const id of rec.seats) await kvDel(`axiom:seat:${id}`);
      await kvDel(`axiom:room:${rid}`);
      return snapshot(userId);
    }
    rec.seats = rec.seats.filter((id) => id !== userId);
    rec.state = rec.mods.guandan.startGuandanLobby(
      rec.state.players.filter((p) => p.id !== userId).map((p) => ({ id: p.id, name: p.name })),
    );
    await saveRoom(rec);
    return snapshot(userId);
  }
  if (rec && rec.state?.phase !== "over") {
    rec.state = {
      ...rec.state,
      phase: "over",
      winnerId: rec.seats.find((id) => id !== userId) || null,
      winnerTeam: null,
      message: "A player left.",
    };
    await saveRoom(rec);
  }
  for (const id of rec?.seats || [userId]) await kvDel(`axiom:seat:${id}`);
  await kvDel(`axiom:room:${rid}`);
  return snapshot(userId);
}

function publicRoom(room, viewerId) {
  if (!room) return null;
  let view = room.state;
  const mods = room.mods;
  if (mods) {
    if (room.game === "coda") view = mods.coda.viewFor(room.state, viewerId);
    if (room.game === "bj") view = mods.bj.viewBjDuel(room.state, viewerId);
    if (room.game === "m24") view = mods.m24.viewM24(room.state, viewerId);
    if (room.game === "uno") view = mods.uno.viewUno(room.state, viewerId);
    if (room.game === "flip7") view = mods.flip.viewFlip7(room.state, viewerId);
    if (room.game === "holdem") view = mods.holdem.viewHoldem(room.state, viewerId);
    if (room.game === "guandan") view = mods.guandan.viewGuandan(room.state, viewerId);
  }
  return {
    id: room.id,
    game: room.game,
    seats: room.seats,
    endsAt: room.endsAt,
    seq: room.seq || 0,
    view,
  };
}
