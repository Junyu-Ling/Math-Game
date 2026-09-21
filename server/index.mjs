import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Redis from "ioredis";
import nodemailer from "nodemailer";
import { WebSocketServer } from "ws";
import { applyAction, ARRANGE_MS, finishArrange, startCodaMatch, viewFor } from "./coda-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const DATA = path.join(__dirname, "data", "users.json");

fs.mkdirSync(path.dirname(DATA), { recursive: true });
if (!fs.existsSync(DATA)) fs.writeFileSync(DATA, "[]");

const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    return Math.min(4000, 400 * times);
  },
});
let redisReady = false;
const memKv = new Map();
const memQueue = [];

redis.on("ready", () => {
  redisReady = true;
  console.log("Redis 已连接，验证码与匹配走 Redis。");
});
redis.on("close", () => {
  redisReady = false;
});
redis.on("error", (err) => {
  redisReady = false;
  if (err.message.includes("ECONNREFUSED") || err.message.includes("ENOTFOUND")) return;
  console.error("Redis：", err.message);
});

function memSet(key, value, ttlSec) {
  memKv.set(key, { value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
}
function memGet(key) {
  const hit = memKv.get(key);
  if (!hit) return null;
  if (hit.exp && Date.now() > hit.exp) {
    memKv.delete(key);
    return null;
  }
  return hit.value;
}

async function cacheSet(key, value, ttlSec = 600) {
  if (redisReady) {
    try {
      await redis.set(key, value, "EX", ttlSec);
      return;
    } catch {
      redisReady = false;
    }
  }
  memSet(key, value, ttlSec);
}

async function cacheGet(key) {
  if (redisReady) {
    try {
      return await redis.get(key);
    } catch {
      redisReady = false;
    }
  }
  return memGet(key);
}

async function cacheDel(key) {
  if (redisReady) {
    try {
      await redis.del(key);
      return;
    } catch {
      redisReady = false;
    }
  }
  memKv.delete(key);
}

const mailer =
  process.env.SMTP_HOST && process.env.SMTP_USER
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

const app = express();
app.use(cors());
app.use(express.json());

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function readUsers() {
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}

function writeUsers(users) {
  fs.writeFileSync(DATA, JSON.stringify(users, null, 2));
}

function publicUser(u) {
  return { id: u.id, email: u.email, chips: u.chips, createdAt: u.createdAt };
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "未登录" });
  }
}

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    redis: redisReady ? "PONG" : "memory",
    smtp: Boolean(mailer),
    match: true,
  });
});

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "邮箱格式不正确" });
  }
  if (password.length < 6) return res.status(400).json({ error: "密码至少 6 位" });
  if (readUsers().some((u) => u.email === email)) {
    return res.status(400).json({ error: "该邮箱已注册" });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = bcrypt.hashSync(password, 10);
  await cacheSet(`verify:${email}`, JSON.stringify({ hash, code }), 600);
  if (mailer) {
    await mailer.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "AXIOM 验证码",
      text: `你的验证码是 ${code}，10 分钟内有效。`,
    });
    res.json({ needCode: true, hint: "验证码已发到邮箱，10 分钟内有效。" });
    return;
  }
  console.log(`[mock mail] ${email} code = ${code}`);
  res.json({ needCode: true, hint: `未配置 SMTP，验证码是 ${code}` });
});

app.post("/api/auth/verify", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "");
  const raw = await cacheGet(`verify:${email}`);
  if (!raw) return res.status(400).json({ error: "验证码不存在或已过期" });
  const pending = JSON.parse(raw);
  if (pending.code !== code) return res.status(400).json({ error: "验证码不正确" });
  const users = readUsers();
  const user = {
    id: `u_${Date.now()}`,
    email,
    passwordHash: pending.hash,
    chips: 1000,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  await cacheDel(`verify:${email}`);
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = readUsers().find((u) => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(400).json({ error: "邮箱或密码错误" });
  }
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: publicUser(user) });
});

app.get("/api/me", auth, (req, res) => {
  const user = readUsers().find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  res.json({ user: publicUser(user) });
});

function seedDemo() {
  const users = readUsers();
  const demos = [
    { email: "player1@axiom.local", password: "axiom123" },
    { email: "player2@axiom.local", password: "axiom123" },
  ];
  let changed = false;
  for (const d of demos) {
    if (users.some((u) => u.email === d.email)) continue;
    users.push({
      id: `u_demo_${d.email.replace(/[^a-z0-9]/g, "_")}`,
      email: d.email,
      passwordHash: bcrypt.hashSync(d.password, 10),
      chips: 1000,
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }
  if (changed) writeUsers(users);
}

seedDemo();

const QUEUE = "queue:coda";
const ENQUEUE = `
redis.call('LPUSH', KEYS[1], ARGV[1])
if redis.call('LLEN', KEYS[1]) >= 2 then
  return { redis.call('RPOP', KEYS[1]), redis.call('RPOP', KEYS[1]) }
end
return nil
`;

const rooms = new Map();
const sockets = new Map();
const userRoom = new Map();

function send(ws, payload) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function displayName(email) {
  return String(email || "PLAYER").split("@")[0].toUpperCase();
}

function persistRoom(room) {
  return cacheSet(
    `room:${room.id}`,
    JSON.stringify({ id: room.id, seats: room.seats, state: room.state }),
    7200,
  );
}

function broadcast(room) {
  for (const uid of room.seats) {
    send(sockets.get(uid), {
      type: "state",
      roomId: room.id,
      view: viewFor(room.state, uid),
      arrangeEndsAt: room.endsAt ?? null,
    });
  }
}

function scheduleArrange(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.endsAt = null;
  if (room.state.phase !== "arrange") return;
  room.endsAt = Date.now() + ARRANGE_MS;
  room.timer = setTimeout(() => {
    room.state = finishArrange(room.state);
    persistRoom(room);
    scheduleArrange(room);
    broadcast(room);
  }, ARRANGE_MS);
}

async function createMatch(a, b) {
  const id = `coda_${Date.now().toString(36)}`;
  const state = startCodaMatch(
    Boolean(a.useJokers && b.useJokers),
    { id: a.userId, name: displayName(a.email), black: a.black, white: a.white },
    { id: b.userId, name: displayName(b.email), black: b.black, white: b.white },
  );
  const room = { id, seats: [a.userId, b.userId], state, timer: null, endsAt: null };
  rooms.set(id, room);
  userRoom.set(a.userId, id);
  userRoom.set(b.userId, id);
  scheduleArrange(room);
  await persistRoom(room);
  send(sockets.get(a.userId), { type: "matched", roomId: id, youId: a.userId });
  send(sockets.get(b.userId), { type: "matched", roomId: id, youId: b.userId });
  broadcast(room);
}

async function enqueuePlayer(ticket) {
  await leaveQueue(ticket.userId);
  if (redisReady) {
    try {
      const pair = await redis.eval(ENQUEUE, 1, QUEUE, JSON.stringify(ticket));
      if (!pair) return false;
      const [rawA, rawB] = pair;
      if (!rawA || !rawB) return false;
      await createMatch(JSON.parse(rawA), JSON.parse(rawB));
      return true;
    } catch {
      redisReady = false;
    }
  }
  memQueue.push(ticket);
  if (memQueue.length < 2) return false;
  const a = memQueue.shift();
  const b = memQueue.shift();
  await createMatch(a, b);
  return true;
}

async function leaveQueue(userId) {
  for (let i = memQueue.length - 1; i >= 0; i--) {
    if (memQueue[i].userId === userId) memQueue.splice(i, 1);
  }
  if (!redisReady) return;
  try {
    const items = await redis.lrange(QUEUE, 0, -1);
    for (const raw of items) {
      try {
        if (JSON.parse(raw).userId === userId) await redis.lrem(QUEUE, 0, raw);
      } catch {
        /* skip */
      }
    }
  } catch {
    redisReady = false;
  }
}

app.patch("/api/me/chips", auth, (req, res) => {
  const chips = Number(req.body?.chips);
  if (!Number.isFinite(chips) || chips < 0) {
    return res.status(400).json({ error: "筹码不合法" });
  }
  const users = readUsers();
  const user = users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  user.chips = Math.floor(chips);
  writeUsers(users);
  res.json({ user: publicUser(user) });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/", "http://localhost");
  let user;
  try {
    user = jwt.verify(url.searchParams.get("token") || "", JWT_SECRET);
  } catch {
    send(ws, { type: "error", error: "未登录，无法匹配。" });
    ws.close();
    return;
  }
  const account = readUsers().find((u) => u.id === user.id);
  if (!account) {
    send(ws, { type: "error", error: "用户不存在" });
    ws.close();
    return;
  }

  const prev = sockets.get(user.id);
  if (prev && prev !== ws) prev.close();
  sockets.set(user.id, ws);

  const existing = userRoom.get(user.id);
  if (existing && rooms.get(existing)) {
    const room = rooms.get(existing);
    send(ws, { type: "matched", roomId: room.id, youId: user.id });
    send(ws, { type: "state", roomId: room.id, view: viewFor(room.state, user.id), arrangeEndsAt: room.endsAt ?? null });
  }

  ws.on("message", async (buf) => {
    let msg;
    try {
      msg = JSON.parse(String(buf));
    } catch {
      return;
    }
    if (msg.type === "queue") {
      if (userRoom.get(user.id) && rooms.get(userRoom.get(user.id))) {
        send(ws, { type: "error", error: "你已在一局中。" });
        return;
      }
      const ticket = {
        userId: user.id,
        email: account.email,
        black: Math.max(0, Math.min(4, Number(msg.black) || 2)),
        white: Math.max(0, Math.min(4, Number(msg.white) || 2)),
        useJokers: Boolean(msg.useJokers),
      };
      if (ticket.black + ticket.white !== 4) {
        ticket.white = 4 - ticket.black;
      }
      send(ws, { type: "queued" });
      await enqueuePlayer(ticket);
      return;
    }
    if (msg.type === "leave") {
      await leaveQueue(user.id);
      const rid = userRoom.get(user.id);
      if (rid) {
        const room = rooms.get(rid);
        if (room && room.state.phase !== "over") {
          room.state = {
            ...room.state,
            phase: "over",
            winnerId: room.seats.find((id) => id !== user.id) || null,
            log: [...room.state.log, { id: `l-${Date.now()}`, text: `${displayName(account.email)} 离开，对手获胜。` }],
          };
          broadcast(room);
        }
        userRoom.delete(user.id);
      }
      send(ws, { type: "left" });
      return;
    }
    if (msg.type === "action") {
      const room = rooms.get(msg.roomId);
      if (!room || !room.seats.includes(user.id)) return;
      const before = room.state;
      room.state = applyAction(room.state, user.id, msg.action);
      if (room.state === before) return;
      if (room.state.phase === "arrange" && before.phase !== "arrange") scheduleArrange(room);
      await persistRoom(room);
      broadcast(room);
    }
  });

  ws.on("close", () => {
    if (sockets.get(user.id) === ws) sockets.delete(user.id);
    leaveQueue(user.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`AXIOM API  http://localhost:${PORT}`);
  console.log(`WebSocket  ws://localhost:${PORT}/ws`);
  console.log("演示账号  player1@axiom.local / axiom123");
  console.log("演示账号  player2@axiom.local / axiom123");
  console.log(mailer ? "SMTP 已配置" : "未配置 SMTP：验证码会显示在注册页，并打印在本终端");
  console.log(redisReady ? "匹配队列：Redis" : "匹配队列：内存（可稍后启动 Redis，会自动切过去）");
});
