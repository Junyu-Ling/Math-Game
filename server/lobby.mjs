import Redis from "ioredis";
import { loadMods } from "./game-mods.mjs";
import { rapfiAvailable, rapfiSuggest } from "./rapfi.mjs";

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

const CPU_NAMES = ["CPU", "CPU 2", "CPU 3", "CPU 4", "CPU 5", "CPU 6", "CPU 7", "CPU 8", "CPU 9", "CPU 10", "CPU 11", "CPU 12", "CPU 13", "CPU 14", "CPU 15"];

function tableMax(game) {
  if (game === "flip7") return 16;
  if (game === "werewolf") return 8;
  if (game === "gomoku" || game === "ecard" || game === "bj" || game === "m24" || game === "holdem")
    return 2;
  return 4;
}

function isLobbyState(state) {
  return Boolean(state && (state.phase === "lobby" || state.street === "lobby"));
}

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

async function kvSetNx(key, value, ttlSec) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const r = client();
  if (r) {
    try {
      const ok = ttlSec ? await r.set(key, raw, "EX", ttlSec, "NX") : await r.set(key, raw, "NX");
      return ok === "OK";
    } catch {
      /* memory */
    }
  }
  if (memGet(key) != null) return false;
  memSet(key, raw, ttlSec);
  return true;
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

const CODE_SEND_MS = 60_000;

function codeSendKey(kind, email) {
  return `axiom:codesend:${String(kind)}:${String(email).toLowerCase()}`;
}

/** Returns remaining wait seconds, or 0 if a new code may be sent. */
export async function codeSendWaitSec(kind, email) {
  const raw = await kvGet(codeSendKey(kind, email));
  if (raw == null) return 0;
  const sentAt = Number(raw);
  if (!Number.isFinite(sentAt)) return Math.ceil(CODE_SEND_MS / 1000);
  const left = CODE_SEND_MS - (Date.now() - sentAt);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Atomically claim a 60s send window. False if another send is already in flight or cooling down. */
export async function claimCodeSend(kind, email) {
  const wait = await codeSendWaitSec(kind, email);
  if (wait > 0) return { ok: false, wait };
  const now = Date.now();
  const got = await kvSetNx(codeSendKey(kind, email), String(now), Math.ceil(CODE_SEND_MS / 1000));
  if (!got) {
    const again = await codeSendWaitSec(kind, email);
    return { ok: false, wait: Math.max(1, again || Math.ceil(CODE_SEND_MS / 1000)) };
  }
  return { ok: true, wait: 0, sentAt: now };
}

export { CODE_SEND_MS };


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

let rosterScan = { at: 0, live: [], ids: [] };

async function rosterSource() {
  if (Date.now() - rosterScan.at < 15000) return rosterScan;
  const live = await listPresence();
  const ids = [...(await smembers("axiom:users")), ...live.map((p) => String(p.id))];
  rosterScan = { at: Date.now(), live, ids };
  return rosterScan;
}

async function listRoster(viewerId) {
  const { live, ids } = await rosterSource();
  const liveMap = new Map(live.map((p) => [String(p.id), p]));
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
  out.sort((a, b) => {
    const rank = (p) => (p.online ? (p.roomId ? 1 : 2) : 0);
    return rank(b) - rank(a) || a.name.localeCompare(b.name);
  });
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
    cpuReadyAt: room.cpuReadyAt || null,
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
    let cpuIn = 0;
    const rid = await getSeat(id);
    if (rid) {
      const rec = await attachMods(await getRoomRecord(rid));
      if (rec?.cpuReadyAt) {
        if (Date.now() + 40 >= rec.cpuReadyAt) await pumpCpu(rec);
        else cpuIn = rec.cpuReadyAt - Date.now();
      }
    }
    const snap = await snapshot(id, true);
    const roomSeq = snap.room?.seq || 0;
    if (roomSeq !== wantSeq) return snap;
    if (wantInv >= 0 && snap.invites.length !== wantInv) return snap;
    const left = timeoutMs - (Date.now() - started);
    const slice = cpuIn > 0 ? Math.min(left, cpuIn) : left;
    if (slice < 20) break;
    await waitWake(id, slice);
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
  if (!room.endsAt || Date.now() < room.endsAt) return;
  if (room.game === "coda") {
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
  } else if (room.game === "ecard" && room.state.rpsReveal && room.mods.ecard.finishEcardRps) {
    room.state = room.mods.ecard.finishEcardRps(room.state);
  } else if (room.game === "gomoku" && room.state.rpsReveal && room.mods.gomoku.finishGomokuRps) {
    room.state = room.mods.gomoku.finishGomokuRps(room.state);
  } else {
    return;
  }
  room.endsAt = null;
  armCpuThink(room);
  room.seq = (room.seq || 0) + 1;
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
    const lobby = rec && OPEN_TABLES.has(rec.game) && isLobbyState(rec.state);
    if (!lobby) throw new Error("Someone is already in a game");
    if (rec.seats[0] !== fromId) throw new Error("Only the host can invite");
    if (rec.seats.length >= tableMax(rec.game)) throw new Error("The table is full");
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
  } else if (invite.game === "halli") {
    state = mods.halli.startHalliLobby([a, b]);
  } else if (invite.game === "holdem") {
    state = mods.holdem.startHoldemDuel(a, b);
  } else if (invite.game === "ecard") {
    state = mods.ecard.startEcardDuel(a, b);
  } else if (invite.game === "gomoku") {
    state = mods.gomoku.startGomokuDuel(a, b);
  } else if (invite.game === "werewolf") {
    state = mods.werewolf.startWerewolfLobby([a, b]);
  } else if (invite.game === "ludo") {
    state = mods.ludo.startLudoDuel(a, b);
  } else if (invite.game === "animal") {
    state = mods.animal.startAnimalDuel(a, b);
  } else if (invite.game === "army") {
    state = mods.army.startArmyDuel(a, b);
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
  if (rec && rec.game === game && isLobbyState(rec.state)) {
    if (rec.seats.includes(joiner.id)) throw new Error("Already seated");
    if (rec.seats.length >= tableMax(game)) throw new Error("The table is full");
    rec.seats = [...rec.seats, joiner.id];
    rec.state = rebuildLobby(rec, joiner, mods);
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
  if (game === "uno") return mods.uno.startUnoLobby(people);
  if (game === "coda") return mods.coda.startCodaLobby(people, Boolean(meta?.useJokers));
  if (game === "flip7") return mods.flip.startFlip7Lobby(people);
  if (game === "halli") return mods.halli.startHalliLobby(people);
  if (game === "gomoku") return mods.gomoku.startGomokuLobby(people);
  if (game === "ecard") return mods.ecard.startEcardLobby(people);
  if (game === "bj") return mods.bj.startBjLobby(people);
  if (game === "m24") return mods.m24.startM24Lobby(people);
  if (game === "holdem") return mods.holdem.startHoldemLobby(people);
  if (game === "werewolf") return mods.werewolf.startWerewolfLobby(people);
  throw new Error("Unknown table game");
}

function rebuildLobby(rec, joiner, mods) {
  const people = peopleFromSeats(rec, joiner);
  if (rec.game === "uno") return mods.uno.startUnoLobby(people);
  if (rec.game === "flip7") return mods.flip.startFlip7Lobby(people);
  if (rec.game === "halli") return mods.halli.startHalliLobby(people);
  if (rec.game === "gomoku") return mods.gomoku.startGomokuLobby(people);
  if (rec.game === "ecard") return mods.ecard.startEcardLobby(people);
  if (rec.game === "bj") return mods.bj.startBjLobby(people);
  if (rec.game === "m24") return mods.m24.startM24Lobby(people);
  if (rec.game === "holdem") return mods.holdem.startHoldemLobby(people);
  if (rec.game === "werewolf") return mods.werewolf.startWerewolfLobby(people);
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

const CPU_THINK_MS = 1000;

function cpuIsToAct(room) {
  const s = room?.state;
  if (!s || s.phase === "over" || isLobbyState(s) || s.phase === "arrange" || s.street === "over") return false;
  if (room.game === "holdem") {
    if (s.street === "lobby" || s.street === "over" || s.street === "showdown") return false;
    const cur = s.players[s.turn];
    return Boolean(isCpuPlayer(cur));
  }
  if (room.game === "bj") {
    if (s.phase !== "play") return false;
    const cur = s.players[s.turn];
    return Boolean(isCpuPlayer(cur));
  }
  if (room.game === "m24") {
    if (s.phase !== "play") return false;
    return s.players.some((p) => isCpuPlayer(p));
  }
  if (room.game === "coda") {
    if (s.phase === "rps" && !s.rpsReveal) {
      return s.players.some((p) => isCpuPlayer(p) && !s.rpsThrows?.[p.id]);
    }
    const cur = s.players[s.turn];
    return Boolean(isCpuPlayer(cur) && (s.phase === "draw" || s.phase === "guess" || s.phase === "continue" || s.phase === "penalty"));
  }
  if (room.game === "uno" || room.game === "flip7") {
    const cur = s.players[s.turn];
    if (!isCpuPlayer(cur)) return false;
    if (room.game === "flip7") return s.phase === "target" || s.phase === "action";
    return true;
  }
  if (room.game === "halli") {
    if (s.phase !== "play") return false;
    if (room.mods?.halli?.ringingFruit?.(s)) {
      return s.players.some((p) => isCpuPlayer(p) && !p.out);
    }
    const cur = s.players[s.turn];
    return Boolean(isCpuPlayer(cur) && !cur.out);
  }
  if (room.game === "gomoku") {
    if (s.rpsReveal) return false;
    if (s.phase === "rps") {
      return s.players.some((p) => isCpuPlayer(p) && !s.rpsThrows?.[p.id]);
    }
    if (s.phase !== "play") return false;
    const cur = s.players[s.turn];
    return Boolean(isCpuPlayer(cur));
  }
  if (room.game === "ecard") {
    if (s.rpsReveal) return false;
    if (s.phase === "rps") {
      return s.players.some((p) => isCpuPlayer(p) && !s.rpsThrows?.[p.id]);
    }
    if (s.phase === "role") {
      const chooser = s.players.find((p) => p.id === s.roleChooserId);
      return Boolean(chooser && isCpuPlayer(chooser));
    }
    if (s.phase === "reveal") {
      return s.players.some((p) => isCpuPlayer(p));
    }
    if (s.phase === "pick") {
      return s.players.some((p) => isCpuPlayer(p) && !p.locked);
    }
  }
  if (room.game === "bj") {
    if (s.phase !== "play") return false;
    const cur = s.players[s.turn];
    return Boolean(isCpuPlayer(cur) && !cur.stood);
  }
  if (room.game === "m24") {
    if (s.phase !== "play") return false;
    return s.players.some((p) => isCpuPlayer(p));
  }
  if (room.game === "holdem") {
    if (s.street === "lobby" || s.street === "over" || s.street === "showdown") return false;
    const cur = s.players[s.turn];
    return Boolean(isCpuPlayer(cur));
  }
  if (room.game === "werewolf") {
    if (s.phase === "night_wolves") {
      return s.players.some((p) => isCpuPlayer(p) && p.alive && p.role === "werewolf" && !s.wolfVotes?.[p.id]);
    }
    if (s.phase === "night_seer") {
      return s.players.some((p) => isCpuPlayer(p) && p.alive && p.role === "seer" && !s.seerChecked);
    }
    if (s.phase === "night_witch") {
      return s.players.some((p) => isCpuPlayer(p) && p.alive && p.role === "witch" && !s.witchDone);
    }
    if (s.phase === "dawn") {
      return s.players.some((p) => isCpuPlayer(p));
    }
    if (s.phase === "vote") {
      return s.players.some((p) => isCpuPlayer(p) && p.alive && !p.voteFor);
    }
    return false;
  }
  return false;
}

function armCpuThink(room) {
  if (!cpuIsToAct(room)) {
    room.cpuReadyAt = null;
    return;
  }
  // RAPFI already spends wall-clock time thinking; don't add a full extra second.
  // Make 24 races humans �?give the CPU a few seconds like local practice.
  const delay =
    room.game === "gomoku" && rapfiAvailable() ? 180 : room.game === "m24" ? 8000 : CPU_THINK_MS;
  room.cpuReadyAt = Date.now() + delay;
}

async function pumpCpu(room) {
  if (!room?.id || !room.cpuReadyAt || Date.now() + 40 < room.cpuReadyAt) return false;
  const lockTtl = room.game === "gomoku" && rapfiAvailable() ? 30 : 4;
  if (!(await kvSetNx(`axiom:cpustep:${room.id}`, "1", lockTtl))) return false;
  try {
    const fresh = await attachMods(await getRoomRecord(room.id));
    if (!fresh) return false;
    fresh.mods = fresh.mods || room.mods;
    if (!fresh.cpuReadyAt || Date.now() + 40 < fresh.cpuReadyAt || !cpuIsToAct(fresh)) return false;
    const ok = await playOneCpuTurn(fresh);
    if (!ok) {
      fresh.cpuReadyAt = null;
    } else {
      fresh.cpuReadyAt = cpuIsToAct(fresh) ? Date.now() + CPU_THINK_MS : null;
    }
    fresh.seq = (fresh.seq || 0) + 1;
    await saveRoom(fresh);
    Object.assign(room, fresh);
    return true;
  } finally {
    await kvDel(`axiom:cpustep:${room.id}`);
  }
}

async function playOneCpuTurn(room) {
  const mods = room.mods;
  const s = room.state;
  if (!mods || !s || !cpuIsToAct(room)) return false;

  if (room.game === "coda") {
    if (s.phase === "rps" && !s.rpsReveal) {
      const cpu = s.players.find((p) => isCpuPlayer(p) && !s.rpsThrows?.[p.id]);
      if (!cpu) return false;
      const hand = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
      room.state = mods.coda.applyAction(s, cpu.id, { type: "rps", throw: hand });
      return true;
    }
    const cur = s.players[s.turn];
    if (s.phase === "draw") {
      room.state = mods.coda.applyAction(s, cur.id, { type: "draw", color: mods.coda.aiDrawColor(s) });
      return true;
    }
    if (s.phase === "guess") {
      const g = mods.coda.aiGuess(s);
      if (!g) return false;
      if (!s.selected || s.selected.playerId !== g.playerId || s.selected.index !== g.index) {
        room.state = mods.coda.applyAction(s, cur.id, { type: "select", playerId: g.playerId, index: g.index });
        return true;
      }
      room.state = mods.coda.applyAction(s, cur.id, { type: "guess", value: g.value });
      return true;
    }
    if (s.phase === "continue") {
      const keep = mods.coda.aiShouldContinue(s);
      room.state = mods.coda.applyAction(s, cur.id, { type: keep ? "continue" : "stay" });
      return true;
    }
    if (s.phase === "penalty") {
      const index = mods.coda.aiPenaltyIndex(s);
      if (index < 0) return false;
      room.state = mods.coda.applyAction(s, cur.id, { type: "penalty", index });
      return true;
    }
    return false;
  }

  if (room.game === "uno") {
    const cur = s.players[s.turn];
    room.state = mods.uno.applyUnoAction(s, cur.id, mods.uno.aiUno(s));
    return true;
  }

  if (room.game === "flip7") {
    const cur = s.players[s.turn];
    if (s.phase === "target") {
      room.state = mods.flip.applyFlipAction(s, cur.id, { type: "target", targetId: mods.flip.aiTarget(s) });
      return true;
    }
    if (s.phase === "action") {
      room.state = mods.flip.applyFlipAction(s, cur.id, { type: mods.flip.aiDecide(s) });
      return true;
    }
    return false;
  }

  if (room.game === "halli") {
    if (mods.halli.ringingFruit(s)) {
      const cpu = s.players.find((p) => isCpuPlayer(p) && !p.out);
      if (!cpu) return false;
      room.state = mods.halli.applyHalliAction(s, cpu.id, { type: "ring" });
      return true;
    }
    const cur = s.players[s.turn];
    if (!isCpuPlayer(cur) || cur.out) return false;
    room.state = mods.halli.applyHalliAction(s, cur.id, mods.halli.aiHalli(s));
    return true;
  }

  if (room.game === "gomoku") {
    if (s.phase === "rps" && !s.rpsReveal) {
      const cpu = s.players.find((p) => isCpuPlayer(p) && !s.rpsThrows?.[p.id]);
      if (!cpu) return false;
      room.state = mods.gomoku.applyGomokuAction(s, cpu.id, mods.gomoku.aiGomoku(s));
      return true;
    }
    const cur = s.players[s.turn];
    if (!isCpuPlayer(cur) || !cur.stone) return false;
    // Prefer RAPFI (Gomocup) when RAPFI_PATH / server/engines is configured.
    if (s.phase === "play" && rapfiAvailable()) {
      const move = await rapfiSuggest(s.board, cur.stone);
      if (move) {
        const next = mods.gomoku.applyGomokuAction(s, cur.id, { type: "place", r: move.r, c: move.c });
        if (next.last?.r === move.r && next.last?.c === move.c) {
          room.state = next;
          return true;
        }
      }
    }
    room.state = mods.gomoku.applyGomokuAction(s, cur.id, mods.gomoku.aiGomoku(s));
    return true;
  }

  if (room.game === "ecard") {
    if (s.phase === "reveal") {
      const cpu = s.players.find((p) => isCpuPlayer(p));
      if (!cpu) return false;
      room.state = mods.ecard.applyEcardAction(s, cpu.id, { type: "next" });
      return true;
    }
    if (s.phase === "rps" && !s.rpsReveal) {
      const cpu = s.players.find((p) => isCpuPlayer(p) && !s.rpsThrows?.[p.id]);
      if (!cpu) return false;
      room.state = mods.ecard.applyEcardAction(s, cpu.id, mods.ecard.aiEcard(s, cpu.id));
      return true;
    }
    if (s.phase === "role") {
      const cpu = s.players.find((p) => p.id === s.roleChooserId && isCpuPlayer(p));
      if (!cpu) return false;
      room.state = mods.ecard.applyEcardAction(s, cpu.id, mods.ecard.aiEcard(s, cpu.id));
      return true;
    }
    if (s.phase === "pick") {
      const cpu = s.players.find((p) => isCpuPlayer(p) && !p.locked);
      if (!cpu) return false;
      let next = s;
      const act = mods.ecard.aiEcard(next, cpu.id);
      next = mods.ecard.applyEcardAction(next, cpu.id, act);
      const after = next.players.find((p) => p.id === cpu.id);
      if (after && after.selectedId && !after.locked) {
        next = mods.ecard.applyEcardAction(next, cpu.id, { type: "lock" });
      }
      room.state = next;
      return true;
    }
  }

  if (room.game === "bj") {
    const cur = s.players[s.turn];
    if (!isCpuPlayer(cur)) return false;
    room.state = mods.bj.applyBjDuelAction(s, cur.id, mods.bj.aiBjAction(s));
    return true;
  }

  if (room.game === "m24") {
    const cpu = s.players.find((p) => isCpuPlayer(p));
    if (!cpu || !s.solution) return false;
    room.state = mods.m24.applyM24Action(s, cpu.id, { type: "submit", expr: s.solution });
    return true;
  }

  if (room.game === "holdem") {
    const cur = s.players[s.turn];
    if (!isCpuPlayer(cur)) return false;
    try {
      room.state = mods.holdem.applyHoldemAction(s, cur.id, mods.holdem.holdemBotAct(s, cur.id));
    } catch {
      try {
        room.state = mods.holdem.applyHoldemAction(s, cur.id, { type: "call" });
      } catch {
        try {
          room.state = mods.holdem.applyHoldemAction(s, cur.id, { type: "check" });
        } catch {
          room.state = mods.holdem.applyHoldemAction(s, cur.id, { type: "fold" });
        }
      }
    }
    return true;
  }

  if (room.game === "werewolf") {
    let cpu = null;
    if (s.phase === "night_wolves") {
      cpu = s.players.find((p) => isCpuPlayer(p) && p.alive && p.role === "werewolf" && !s.wolfVotes?.[p.id]);
    } else if (s.phase === "night_seer") {
      cpu = s.players.find((p) => isCpuPlayer(p) && p.alive && p.role === "seer" && !s.seerChecked);
    } else if (s.phase === "night_witch") {
      cpu = s.players.find((p) => isCpuPlayer(p) && p.alive && p.role === "witch" && !s.witchDone);
    } else if (s.phase === "dawn") {
      cpu = s.players.find((p) => isCpuPlayer(p));
    } else if (s.phase === "vote") {
      cpu = s.players.find((p) => isCpuPlayer(p) && p.alive && !p.voteFor);
    }
    if (!cpu) return false;
    room.state = mods.werewolf.applyWerewolfAction(s, cpu.id, mods.werewolf.aiWerewolf(s, cpu.id));
    return true;
  }

  return false;
}

const OPEN_TABLES = new Set([
  "coda",
  "uno",
  "flip7",
  "halli",
  "gomoku",
  "ecard",
  "bj",
  "m24",
  "holdem",
  "werewolf",
]);

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
  } else if (room.game === "halli") {
    room.state = mods.halli.applyHalliAction(room.state, user.id, action);
  } else if (room.game === "holdem") {
    room.state = mods.holdem.applyHoldemAction(room.state, user.id, action);
  } else if (room.game === "ecard") {
    room.state = mods.ecard.applyEcardAction(room.state, user.id, action);
    if (room.state.rpsReveal && !before.rpsReveal) {
      room.endsAt = Date.now() + (mods.ecard.RPS_REVEAL_MS || 2800);
    }
  } else if (room.game === "gomoku") {
    room.state = mods.gomoku.applyGomokuAction(room.state, user.id, action);
    if (room.state.rpsReveal && !before.rpsReveal) {
      room.endsAt = Date.now() + (mods.gomoku.RPS_REVEAL_MS || 2800);
    }
  } else if (room.game === "werewolf") {
    room.state = mods.werewolf.applyWerewolfAction(room.state, user.id, action);
  } else if (room.game === "ludo") {
    room.state = mods.ludo.applyLudoAction(room.state, user.id, action);
  } else if (room.game === "animal") {
    room.state = mods.animal.applyAnimalAction(room.state, user.id, action);
  } else if (room.game === "army") {
    room.state = mods.army.applyArmyAction(room.state, user.id, action);
  }
  armCpuThink(room);
  room.seq = (room.seq || 0) + 1;
  await saveRoom(room, { skipRemember: true });
  return publicRoom(room, user.id);
}

export async function leaveRoom(userId) {
  const rid = await getSeat(userId);
  if (!rid) return snapshot(userId);
  const rec = await attachMods(await getRoomRecord(rid));
  if (rec?.game && OPEN_TABLES.has(rec.game) && isLobbyState(rec.state)) {
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

  // Mid-match or settlement: leaving closes the table for everyone so nobody stays stuck on "over".
  const humans = humanSeatIds(rec?.seats || [userId]);
  for (const id of humans) await kvDel(`axiom:seat:${id}`);
  await kvDel(`axiom:room:${rid}`);
  await wakeUsers(humans);
  return snapshot(userId);
}

function publicRoom(room, viewerId) {
  if (!room) return null;
  let view = room.state;
  const mods = room.mods;
  if (mods) {
    try {
      if (room.game === "coda") view = mods.coda.viewFor(room.state, viewerId);
      else if (room.game === "bj") view = mods.bj.viewBjDuel(room.state, viewerId);
      else if (room.game === "m24") view = mods.m24.viewM24(room.state, viewerId);
      else if (room.game === "uno") view = mods.uno.viewUno(room.state, viewerId);
      else if (room.game === "flip7") view = mods.flip.viewFlip7(room.state, viewerId);
      else if (room.game === "halli") view = mods.halli.viewHalli(room.state, viewerId);
      else if (room.game === "holdem") view = mods.holdem.viewHoldem(room.state, viewerId);
      else if (room.game === "ecard") view = mods.ecard.viewEcard(room.state, viewerId);
      else if (room.game === "gomoku") {
        const st = typeof mods.gomoku.normalizeGomoku === "function" ? mods.gomoku.normalizeGomoku(room.state) : room.state;
        view = mods.gomoku.viewGomoku(st, viewerId);
      } else if (room.game === "werewolf") view = mods.werewolf.viewWerewolf(room.state, viewerId);
      else if (room.game === "ludo") view = mods.ludo.viewLudo(room.state, viewerId);
      else if (room.game === "animal") view = mods.animal.viewAnimal(room.state, viewerId);
      else if (room.game === "army") view = mods.army.viewArmy(room.state, viewerId);
    } catch (err) {
      console.error(`publicRoom view failed (${room.game}):`, err?.message || err);
      view = room.state;
    }
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

/** Drop this user from a seat; close the room if they were host or last human. */
async function vacateSeat(userId, rec) {
  if (!rec) return;
  const id = String(userId);
  await kvDel(`axiom:seat:${id}`);
  const hostLeft = rec.seats[0] === id;
  const humansLeft = humanSeatIds(rec.seats).filter((x) => x !== id);
  if (hostLeft || humansLeft.length < 1) {
    for (const hid of humanSeatIds(rec.seats)) await kvDel(`axiom:seat:${hid}`);
    await kvDel(`axiom:room:${rec.id}`);
    await wakeUsers(humanSeatIds(rec.seats));
    return;
  }
  rec.seats = rec.seats.filter((x) => x !== id);
  rec.state = rebuildLobby(rec, null, rec.mods);
  rec.seq = (rec.seq || 0) + 1;
  await saveRoom(rec);
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
  const open = mode === "open";
  const inLobbyHere = Boolean(rec && rec.game === game && isLobbyState(rec.state));

  // Open table / start fresh: leave any stuck finished/other-game seat first.
  if (open) {
    if (inLobbyHere && rec.seats[0] === userId) {
      return { ok: true, room: publicRoom(rec, userId) };
    }
    if (rec) await vacateSeat(userId, rec);
    const host = { id: userId, name: playerName(user), human: true };
    const fresh = {
      id: uid("room"),
      game,
      seats: [host.id],
      state: newLobbyState(game, [host], mods, meta),
      endsAt: null,
      seq: 1,
      mods,
    };
    armCpuThink(fresh);
    await saveRoom(fresh);
    return { ok: true, room: publicRoom(fresh, userId) };
  }

  if (!rec || !inLobbyHere) {
    if (!add) throw new Error("Open a table first");
    // Add CPU with no lobby �?open table then seat one CPU.
    if (rec) await vacateSeat(userId, rec);
    const host = { id: userId, name: playerName(user), human: true };
    rec = {
      id: uid("room"),
      game,
      seats: [host.id],
      state: newLobbyState(game, [host], mods, meta),
      endsAt: null,
      seq: 1,
      mods,
    };
    const cpu = nextCpu(rec.seats);
    rec.seats = [...rec.seats, cpu.id];
    rec.state = rebuildLobby(rec, cpu, mods);
    armCpuThink(rec);
    await saveRoom(rec);
    return { ok: true, room: publicRoom(rec, userId) };
  }

  if (rec.seats[0] !== userId) throw new Error("Only the host can add CPUs");

  if (add) {
    const max = tableMax(game);
    const target = fill
      ? game === "flip7"
        ? Math.min(max, rec.seats.length + 3)
        : max
      : Math.min(max, rec.seats.length + 1);
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
  armCpuThink(rec);
  rec.seq = (rec.seq || 0) + 1;
  await saveRoom(rec);
  return { ok: true, room: publicRoom(rec, userId) };
}
