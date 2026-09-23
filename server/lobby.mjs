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

const CPU_NAMES = ["CPU", "CPU 2", "CPU 3"];

function isCpuId(id) {
  return /^(cpu|bot|ai)/i.test(String(id || ""));
}

function humanSeatIds(seats) {
  return (seats || []).filter((id) => !isCpuId(id));
}

function isCpuPlayer(p) {
  return Boolean(p && (p.human === false || isCpuId(p.id)));
}

function nextCpu(seats) {
  const used = new Set((seats || []).map(String));
  let i = 1;
  while (used.has(`cpu-${i}`)) i += 1;
  const n = [...used].filter(isCpuId).length;
  return { id: `cpu-${i}`, name: CPU_NAMES[n] || `CPU ${n + 1}`, human: false };
}

function peopleFromSeats(rec, extra) {
  return (rec.seats || []).map((id) => {
    const existing = rec.state?.players?.find((p) => p.id === id);
    const cpu = isCpuId(id);
    if (existing) return { id, name: existing.name, human: !cpu && existing.human !== false };
    if (extra && extra.id === id) return { id, name: extra.name, human: extra.human !== false && !cpu };
    if (cpu) return { id, name: "CPU", human: false };
    return { id, name: "Player", human: true };
  });
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
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      connectTimeout: 4000,
      lazyConnect: false,
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

const waiters = new Map();
const WAKE_CH = "axiom:wakepub";
let redisSub = null;

function wakeLocal(ids) {
  for (const id of ids) {
    const list = waiters.get(id);
    if (!list?.length) continue;
    waiters.delete(id);
    for (const fn of list) fn();
  }
}

function ensureSub() {
  const r = client();
  if (!r || redisSub) return redisSub;
  try {
    redisSub = r.duplicate();
    redisSub.on("error", () => {});
    redisSub.on("message", (_ch, payload) => {
      try {
        const ids = JSON.parse(String(payload || "[]"));
        if (Array.isArray(ids)) wakeLocal(ids.map(String));
      } catch {
        wakeLocal(String(payload || "").split(",").filter(Boolean));
      }
    });
    void redisSub.subscribe(WAKE_CH);
  } catch {
    redisSub = null;
  }
  return redisSub;
}

function waitLocal(userId, timeoutMs) {
  const id = String(userId);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      const list = waiters.get(id) || [];
      waiters.set(
        id,
        list.filter((fn) => fn !== onWake),
      );
      resolve(ok);
    };
    const onWake = () => finish(true);
    const t = setTimeout(() => finish(false), Math.max(0, timeoutMs));
    const list = waiters.get(id) || [];
    list.push(onWake);
    waiters.set(id, list);
  });
}

export async function wakeUsers(ids) {
  const uniq = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!uniq.length) return;
  wakeLocal(uniq);
  const r = client();
  if (!r) return;
  try {
    const pipe = r.pipeline();
    for (const id of uniq) {
      pipe.lpush(`axiom:wakeq:${id}`, "1");
      pipe.ltrim(`axiom:wakeq:${id}`, 0, 7);
      pipe.expire(`axiom:wakeq:${id}`, 30);
    }
    pipe.publish(WAKE_CH, JSON.stringify(uniq));
    await pipe.exec();
  } catch {
    /* memory */
  }
}

export async function waitWake(userId, timeoutMs) {
  const id = String(userId);
  const r = client();
  ensureSub();
  if (r) {
    try {
      const queued = await r.lpop(`axiom:wakeq:${id}`);
      if (queued) return true;
    } catch {
      /* fall through */
    }
  }
  const hit = await waitLocal(id, timeoutMs);
  if (hit) return true;
  if (r) {
    try {
      return Boolean(await r.lpop(`axiom:wakeq:${id}`));
    } catch {
      return false;
    }
  }
  return false;
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
  await kvSet(`axiom:u:${id}`, rec);
  await sadd("axiom:users", id);
}

export async function saveAccount(user) {
  const id = String(user.id);
  const prev = (await findAccountById(id)) || {};
  const merged = { ...prev, ...user, id };
  if (prev.passwordHash && !user.passwordHash) merged.passwordHash = prev.passwordHash;
  await kvSet(`axiom:acct:${id}`, merged);
  if (merged.email) await kvSet(`axiom:acctemail:${String(merged.email).toLowerCase()}`, id);
  await rememberPlayer(merged);
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

function loginCodeKey(email) {
  return `axiom:logincode:${String(email).toLowerCase()}`;
}

export async function stashLoginCode(email, payload) {
  await kvSet(loginCodeKey(email), payload, 600);
}

export async function takeLoginCode(email) {
  return readJson(loginCodeKey(email));
}

export async function clearLoginCode(email) {
  await kvDel(loginCodeKey(email));
}


async function scanKeys(matchPrefix) {
  const keys = [];
  const r = client();
  if (r) {
    try {
      let cursor = "0";
      do {
        const res = await r.scan(cursor, "MATCH", `${matchPrefix}*`, "COUNT", 100);
        cursor = String(res[0]);
        keys.push(...res[1]);
      } while (cursor !== "0");
    } catch {
      /* memory */
    }
  }
  for (const key of mem.keys()) {
    if (String(key).startsWith(matchPrefix) && memGet(key) != null) keys.push(key);
  }
  return [...new Set(keys)];
}

function idsFromKeys(keys, prefix) {
  return keys.map((key) => String(key).startsWith(prefix) ? String(key).slice(prefix.length) : "").filter(Boolean);
}

async function mgetJson(keys) {
  const map = new Map();
  if (!keys.length) return map;
  const r = client();
  if (r) {
    try {
      const rows = await r.mget(...keys);
      for (let i = 0; i < keys.length; i++) {
        const raw = rows[i];
        if (!raw) continue;
        try {
          map.set(keys[i], JSON.parse(raw));
        } catch {
          /* skip */
        }
      }
      return map;
    } catch {
      /* fallback */
    }
  }
  for (const key of keys) {
    const row = await readJson(key);
    if (row) map.set(key, row);
  }
  return map;
}

const RETIRED_EMAILS = ["player1@axiom.local", "player2@axiom.local"];
let retiredPurged = false;

export async function forgetAccount(email) {
  const needle = String(email || "").toLowerCase();
  if (!needle) return;
  const ids = new Set();
  const named = await findAccountByEmail(needle);
  if (named?.id) ids.add(String(named.id));
  ids.add(`u_demo_${needle.replace(/[^a-z0-9]/g, "_")}`);
  const roster = await smembers("axiom:users");
  const keys = roster.flatMap((id) => [`axiom:u:${id}`, `axiom:acct:${id}`]);
  const rows = await mgetJson(keys);
  for (const id of roster) {
    const rec = rows.get(`axiom:u:${id}`) || rows.get(`axiom:acct:${id}`);
    if (String(rec?.email || "").toLowerCase() === needle) ids.add(String(id));
  }
  for (const id of ids) {
    await srem("axiom:users", id);
    await srem("axiom:online", id);
    await kvDel(`axiom:u:${id}`);
    await kvDel(`axiom:acct:${id}`);
    await kvDel(`axiom:p:${id}`);
    await kvDel(`axiom:seat:${id}`);
  }
  await kvDel(`axiom:acctemail:${needle}`);
}

export async function purgeRetiredAccounts() {
  if (retiredPurged) return;
  retiredPurged = true;
  for (const email of RETIRED_EMAILS) await forgetAccount(email);
}

async function listRoster(viewerId) {
  const live = await listPresence();
  const liveMap = new Map(live.map((p) => [String(p.id), p]));
  const ids = [...(await smembers("axiom:users")), ...live.map((p) => String(p.id))];
  const unique = [...new Set(ids.map(String))].filter((id) => id && id !== String(viewerId)).slice(0, 200);
  const profiles = await mgetJson(unique.map((id) => `axiom:u:${id}`));
  const accounts = await mgetJson(unique.filter((id) => !profiles.has(`axiom:u:${id}`)).map((id) => `axiom:acct:${id}`));
  const out = [];
  for (const id of unique) {
    const saved = profiles.get(`axiom:u:${id}`) || accounts.get(`axiom:acct:${id}`);
    const liveP = liveMap.get(id);
    if (!saved && !liveP) continue;
    const name = liveP?.name || saved?.name || saved?.login || saved?.email || "PLAYER";
    const avatar = liveP?.avatar || saved?.avatar || "";
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

async function saveRoom(room, opts = {}) {
  const rec = {
    id: room.id,
    game: room.game,
    seats: room.seats,
    state: room.state,
    endsAt: room.endsAt,
    seq: room.seq || 0,
  };
  const r = client();
  if (r) {
    try {
      const pipe = r.pipeline();
      pipe.set(`axiom:room:${room.id}`, JSON.stringify(rec), "EX", ROOM_SEC);
      for (const id of humanSeatIds(room.seats)) pipe.set(`axiom:seat:${id}`, room.id, "EX", ROOM_SEC);
      await pipe.exec();
    } catch {
      await kvSet(`axiom:room:${room.id}`, rec, ROOM_SEC);
      for (const id of humanSeatIds(room.seats)) await kvSet(`axiom:seat:${id}`, room.id, ROOM_SEC);
    }
  } else {
    await kvSet(`axiom:room:${room.id}`, rec, ROOM_SEC);
    for (const id of humanSeatIds(room.seats)) await kvSet(`axiom:seat:${id}`, room.id, ROOM_SEC);
  }
  if (!opts.skipRemember) await rememberSeats(room);
  await wakeUsers(humanSeatIds(room.seats));
}

async function rememberSeats(room) {
  const seen = new Set();
  const add = async (p) => {
    if (!p || p.id == null) return;
    const id = String(p.id);
    if (seen.has(id) || /^(cpu|bot|ai)/i.test(id)) return;
    seen.add(id);
    const live = (await readJson(`axiom:p:${id}`)) || {};
    await rememberPlayer({
      id,
      name: p.name || live.name,
      avatar: p.avatar || live.avatar || "",
      email: live.email || p.email || "",
    });
  };
  for (const id of room.seats || []) await add({ id });
  for (const p of room.state?.players || []) await add(p);
}

async function attachMods(rec) {
  if (!rec) return null;
  return { ...rec, mods: await getMods() };
}

export async function heartbeat(user, href = "", light = false) {
  await touchPresence(user, href);
  return snapshot(String(user.id), light);
}

export async function touchPresence(user, href = "") {
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
}

export async function watchLobby(user, seq = 0, inviteCount = -1, href = "", timeoutMs = 8000) {
  const id = String(user.id);
  const wantSeq = Number(seq) || 0;
  const wantInv = Number(inviteCount);
  void touchPresence(user, href);
  ensureSub();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const snap = await snapshot(id, true);
    const roomSeq = snap.room?.seq || 0;
    if (roomSeq !== wantSeq) return snap;
    if (wantInv >= 0 && snap.invites.length !== wantInv) return snap;
    const left = timeoutMs - (Date.now() - started);
    if (left < 20) break;
    await waitWake(id, left);
  }
  return snapshot(id, true);
}

export async function snapshot(userId, light = false) {
  await purgeRetiredAccounts();
  const online = light ? [] : await listRoster(userId);
  const inviteIds = await smembers(`axiom:uinv:${userId}`);
  const invMap = await mgetJson(inviteIds.map((id) => `axiom:inv:${id}`));
  const invites = [];
  for (const id of inviteIds) {
    const inv = invMap.get(`axiom:inv:${id}`);
    if (inv) invites.push(inv);
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
  if (room.state.phase === "arrange") {
    const before = room.state.arrangeId;
    room.state = room.mods.coda.finishArrange(room.state);
    if (room.state.phase === "arrange" && room.state.arrangeId !== before) {
      room.endsAt = Date.now() + (room.mods.coda.ARRANGE_MS || 5000);
      await saveRoom(room);
      return;
    }
  } else if (room.state.rpsReveal && room.mods.coda.finishRps) {
    room.state = room.mods.coda.finishRps(room.state);
  }
  room.endsAt = null;
  playCpuTurns(room);
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
    const lobby = rec && OPEN_TABLES.has(rec.game) && rec.state?.phase === "lobby";
    if (!lobby) throw new Error("Someone is already in a game");
    if (rec.seats[0] !== fromId) throw new Error("Only the host can invite");
    if (rec.seats.length >= 4) throw new Error("The table is full");
    if (rec.seats.includes(toId)) throw new Error("They are already seated");
    if (game !== rec.game) throw new Error(`This table is ${rec.game}`);
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
  await wakeUsers([toId, fromId]);
  return invite;
}

export async function respondInvite(user, inviteId, accept, mods) {
  const invite = await readJson(`axiom:inv:${inviteId}`);
  if (!invite) throw new Error("Invite expired");
  if (invite.toId !== user.id) throw new Error("This invite is not for you");
  await kvDel(`axiom:inv:${inviteId}`);
  await srem(`axiom:uinv:${invite.fromId}`, inviteId);
  await srem(`axiom:uinv:${invite.toId}`, inviteId);
  await wakeUsers([invite.fromId, invite.toId]);
  if (!accept) return { ok: true, declined: true };
  if (OPEN_TABLES.has(invite.game)) {
    return joinOpenTable(user, invite, mods);
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
    state = mods.coda.startCodaLobby([a, b], Boolean(meta.useJokers));
  } else if (invite.game === "flip7") {
    state = mods.flip.startFlip7Lobby([a, b]);
  } else if (invite.game === "bj") {
    state = mods.bj.startBjDuel(a, b);
  } else if (invite.game === "m24") {
    state = mods.m24.startM24Duel(a, b);
  } else if (invite.game === "uno") {
    state = mods.uno.startUnoLobby([a, b]);
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

async function joinOpenTable(user, invite, mods) {
  const game = invite.game;
  const hostId = String(invite.fromId);
  const joiner = { id: String(user.id), name: playerName(user) };
  if (await getSeat(joiner.id)) throw new Error("You are already in a game");
  const hostSeat = await getSeat(hostId);
  let rec = hostSeat ? await getRoomRecord(hostSeat) : null;
  const host = await readJson(`axiom:p:${hostId}`);
  if (!host) throw new Error("They went offline");
  if (rec && rec.game === game && rec.state?.phase === "lobby") {
    if (rec.seats.includes(joiner.id)) throw new Error("Already seated");
    if (rec.seats.length >= 4) throw new Error("The table is full");
    rec.seats = [...rec.seats, joiner.id];
    rec.state = rebuildLobby(rec, joiner, mods);
    if (game === "guandan" && rec.seats.length === 4) {
      rec.state = mods.guandan.startGuandanTable(rec.state.players.map((p) => ({ id: p.id, name: p.name })));
      playCpuTurns(rec);
    }
    rec.seq = (rec.seq || 0) + 1;
    rec.mods = mods;
    await saveRoom(rec);
    return { ok: true, room: publicRoom(rec, user.id) };
  }
  if (hostSeat) throw new Error("Host is already in a game");
  const people = [{ id: hostId, name: host.name }, joiner];
  const state = newLobbyState(game, people, mods, invite.meta || {});
  const room = {
    id: uid("room"),
    game,
    seats: [hostId, joiner.id],
    state,
    endsAt: null,
    seq: 1,
    mods,
  };
  await saveRoom(room);
  return { ok: true, room: publicRoom(room, user.id) };
}

function newLobbyState(game, people, mods, meta) {
  if (game === "guandan") return mods.guandan.startGuandanLobby(people);
  if (game === "uno") return mods.uno.startUnoLobby(people);
  if (game === "coda") return mods.coda.startCodaLobby(people, Boolean(meta?.useJokers));
  if (game === "flip7") return mods.flip.startFlip7Lobby(people);
  throw new Error("Unknown table game");
}

function rebuildLobby(rec, joiner, mods) {
  const people = peopleFromSeats(rec, joiner);
  if (rec.game === "guandan") return mods.guandan.startGuandanLobby(people);
  if (rec.game === "uno") return mods.uno.startUnoLobby(people);
  if (rec.game === "flip7") return mods.flip.startFlip7Lobby(people);
  if (rec.game === "coda") {
    let state = mods.coda.startCodaLobby(people, Boolean(rec.state?.useJokers));
    for (const p of rec.state.players || []) {
      if (!people.some((x) => x.id === p.id)) continue;
      state = mods.coda.applyAction(state, p.id, { type: "pick", black: p.black ?? 2, white: p.white ?? 2 });
      if (p.ready && !isCpuId(p.id)) state = mods.coda.applyAction(state, p.id, { type: "ready" });
    }
    return readyCodaCpus(state, mods);
  }
  return rec.state;
}

function readyCodaCpus(state, mods) {
  let next = state;
  for (const p of next.players || []) {
    if (!isCpuPlayer(p)) continue;
    next = mods.coda.applyAction(next, p.id, { type: "pick", black: 2, white: 2 });
    next = mods.coda.applyAction(next, p.id, { type: "ready" });
  }
  return next;
}

function playCpuTurns(room) {
  const mods = room.mods;
  if (!mods || !room.state) return;
  let guard = 0;
  while (guard++ < 48) {
    const s = room.state;
    if (!s || s.phase === "over" || s.phase === "lobby" || s.phase === "arrange") break;

    if (room.game === "coda") {
      if (s.phase === "rps" && !s.rpsReveal) {
        const cpu = s.players.find((p) => isCpuPlayer(p) && !s.rpsThrows?.[p.id]);
        if (!cpu) break;
        const hand = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
        room.state = mods.coda.applyAction(s, cpu.id, { type: "rps", throw: hand });
        continue;
      }
      const cur = s.players[s.turn];
      if (!isCpuPlayer(cur)) break;
      if (s.phase === "draw") {
        room.state = mods.coda.applyAction(s, cur.id, { type: "draw", color: mods.coda.aiDrawColor(s) });
        continue;
      }
      if (s.phase === "guess") {
        const g = mods.coda.aiGuess(s);
        if (!g) break;
        if (!s.selected || s.selected.playerId !== g.playerId || s.selected.index !== g.index) {
          room.state = mods.coda.applyAction(s, cur.id, { type: "select", playerId: g.playerId, index: g.index });
          continue;
        }
        room.state = mods.coda.applyAction(s, cur.id, { type: "guess", value: g.value });
        continue;
      }
      if (s.phase === "continue") {
        const keep = mods.coda.aiShouldContinue(s);
        room.state = mods.coda.applyAction(s, cur.id, { type: keep ? "continue" : "stay" });
        continue;
      }
      break;
    }

    if (room.game === "uno") {
      const cur = s.players[s.turn];
      if (!isCpuPlayer(cur)) break;
      room.state = mods.uno.applyUnoAction(s, cur.id, mods.uno.aiUno(s));
      continue;
    }

    if (room.game === "flip7") {
      const cur = s.players[s.turn];
      if (!isCpuPlayer(cur)) break;
      if (s.phase === "target") {
        room.state = mods.flip.applyFlipAction(s, cur.id, { type: "target", targetId: mods.flip.aiTarget(s) });
        continue;
      }
      if (s.phase === "action") {
        room.state = mods.flip.applyFlipAction(s, cur.id, { type: mods.flip.aiDecide(s) });
        continue;
      }
      break;
    }

    if (room.game === "guandan") {
      if (s.phase !== "play") break;
      const cur = s.players[s.turn];
      if (!cur || !isCpuId(cur.id)) break;
      try {
        room.state = mods.guandan.applyGuandanAction(s, cur.id, mods.guandan.guandanBotAct(s, cur.id));
      } catch {
        try {
          room.state = mods.guandan.applyGuandanAction(s, cur.id, { type: "pass" });
        } catch {
          break;
        }
      }
      continue;
    }
    break;
  }
}

const OPEN_TABLES = new Set(["guandan", "coda", "uno", "flip7"]);

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
    } else if (room.state.rpsReveal && !before.rpsReveal) {
      room.endsAt = Date.now() + (mods.coda.RPS_REVEAL_MS || 2800);
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
  playCpuTurns(room);
  room.seq = (room.seq || 0) + 1;
  await saveRoom(room, { skipRemember: true });
  return publicRoom(room, user.id);
}

export async function leaveRoom(userId) {
  const rid = await getSeat(userId);
  if (!rid) return snapshot(userId);
  const rec = await attachMods(await getRoomRecord(rid));
  if (rec?.game && OPEN_TABLES.has(rec.game) && rec.state?.phase === "lobby") {
    const hostLeft = rec.seats[0] === userId;
    await kvDel(`axiom:seat:${userId}`);
    const humansLeft = humanSeatIds(rec.seats).filter((id) => id !== userId);
    if (hostLeft || humansLeft.length < 1) {
      for (const id of humanSeatIds(rec.seats)) await kvDel(`axiom:seat:${id}`);
      await kvDel(`axiom:room:${rid}`);
      await wakeUsers(humanSeatIds(rec.seats));
      return snapshot(userId);
    }
    rec.seats = rec.seats.filter((id) => id !== userId);
    rec.state = rebuildLobby(rec, null, rec.mods);
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
  await wakeUsers(rec?.seats || [userId]);
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

export async function adjustCpu(user, game, mode, mods, meta = {}) {
  mods = mods || (await getMods());
  game = String(game || "");
  if (!OPEN_TABLES.has(game)) throw new Error("This game has no open table");
  const userId = String(user.id);
  const hostSeat = await getSeat(userId);
  let rec = hostSeat ? await getRoomRecord(hostSeat) : null;
  if (rec) rec = { ...rec, mods };

  const add = mode === "add" || mode === "fill";
  const fill = mode === "fill";
  if (!rec) {
    if (!add) throw new Error("No table yet");
    const host = { id: userId, name: playerName(user), human: true };
    const cpu = nextCpu([]);
    const people = [host, cpu];
    const state = newLobbyState(game, people, mods, meta);
    rec = {
      id: uid("room"),
      game,
      seats: people.map((p) => p.id),
      state: game === "coda" ? readyCodaCpus(state, mods) : state,
      endsAt: null,
      seq: 1,
      mods,
    };
    if (fill) {
      while (rec.seats.length < 4) {
        const extra = nextCpu(rec.seats);
        rec.seats = [...rec.seats, extra.id];
        rec.state = rebuildLobby(rec, extra, mods);
      }
    }
    maybeDealGuandan(rec, mods);
    playCpuTurns(rec);
    await saveRoom(rec);
    return { ok: true, room: publicRoom(rec, userId) };
  }

  if (rec.game !== game) throw new Error("This table is already another game");
  if (rec.state?.phase !== "lobby") throw new Error("The game already started");
  if (rec.seats[0] !== userId) throw new Error("Only the host can add CPUs");

  if (add) {
    const target = fill ? 4 : Math.min(4, rec.seats.length + 1);
    while (rec.seats.length < target) {
      const cpu = nextCpu(rec.seats);
      rec.seats = [...rec.seats, cpu.id];
      rec.state = rebuildLobby(rec, cpu, mods);
    }
  } else {
    const lastCpu = [...rec.seats].reverse().find((id) => isCpuId(id));
    if (!lastCpu) throw new Error("No CPU to remove");
    rec.seats = rec.seats.filter((id) => id !== lastCpu);
    rec.state = rebuildLobby(rec, null, mods);
  }
  maybeDealGuandan(rec, mods);
  playCpuTurns(rec);
  rec.seq = (rec.seq || 0) + 1;
  await saveRoom(rec);
  return { ok: true, room: publicRoom(rec, userId) };
}

function maybeDealGuandan(rec, mods) {
  if (rec.game !== "guandan" || rec.seats.length !== 4 || rec.state?.phase !== "lobby") return;
  rec.state = mods.guandan.startGuandanTable(rec.state.players.map((p) => ({ id: p.id, name: p.name })));
}
