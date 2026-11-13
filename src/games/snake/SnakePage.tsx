import { useEffect, useRef, useState } from "react";
import {
  aiSnake,
  applySnakeAction,
  canBoost,
  ENERGY_MAX,
  HEAD_R,
  isShielded,
  newNetMemo,
  reconcileSnake,
  smoothPeers,
  SNAKE_WORLD_ID,
  startSnakePractice,
  stepSelfPredict,
  stepSnake,
  TICK_MS,
  VIEW_RADIUS,
  WORLD,
  type Food,
  type SnakeAction,
  type SnakeState,
} from "./engine";
import { ClickPop, RulesButton } from "../../components/GameRules";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";

function keyAim(key: string): number | null {
  if (key === "ArrowUp" || key === "w" || key === "W") return -Math.PI / 2;
  if (key === "ArrowDown" || key === "s" || key === "S") return Math.PI / 2;
  if (key === "ArrowLeft" || key === "a" || key === "A") return Math.PI;
  if (key === "ArrowRight" || key === "d" || key === "D") return 0;
  return null;
}

function hashKind(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 8;
}

function drawCandy(
  ctx: CanvasRenderingContext2D,
  f: Food,
  sx: number,
  sy: number,
  r: number,
  tMs: number,
) {
  const kind = Number.isFinite(f.kind) ? ((f.kind! % 8) + 8) % 8 : hashKind(f.id);
  const hue = Number.isFinite(f.hue) ? f.hue! : 42 + kind * 37;
  const spin = tMs / 900 + f.x * 0.07 + f.y * 0.05;
  const fill = `hsl(${hue} 78% 58%)`;
  const deep = `hsl(${hue} 72% 42%)`;
  const lite = `hsl(${hue} 90% 78%)`;
  const foil = `hsl(${(hue + 40) % 360} 55% 72%)`;
  const alt = `hsl(${(hue + 180) % 360} 70% 92%)`;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.sin(spin) * 0.18 + kind * 0.4);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.1);
  glow.addColorStop(0, `hsla(${hue} 85% 62% / 0.5)`);
  glow.addColorStop(1, `hsla(${hue} 85% 62% / 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3.1, 0, Math.PI * 2);
  ctx.fill();

  if (kind === 0) {
    // Wrapped twist candy
    ctx.fillStyle = foil;
    ctx.beginPath();
    ctx.moveTo(-r * 1.85, 0);
    ctx.lineTo(-r * 0.85, -r * 0.55);
    ctx.lineTo(-r * 0.85, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 1.85, 0);
    ctx.lineTo(r * 0.85, -r * 0.55);
    ctx.lineTo(r * 0.85, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = lite;
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, -r * 0.35);
    ctx.quadraticCurveTo(0, r * 0.15, r * 0.55, -r * 0.35);
    ctx.stroke();
  } else if (kind === 1) {
    // Lollipop
    ctx.strokeStyle = "rgba(241, 245, 249, 0.85)";
    ctx.lineWidth = Math.max(1.4, r * 0.28);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, r * 0.35);
    ctx.lineTo(0, r * 1.85);
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, -r * 0.15, r * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = alt;
    ctx.lineWidth = Math.max(1.2, r * 0.22);
    ctx.beginPath();
    ctx.arc(0, -r * 0.15, r * 0.55, -0.4, Math.PI * 1.4);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.42, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 2) {
    // Gumdrop
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, r * 0.55);
    ctx.quadraticCurveTo(-r * 1.05, -r * 0.2, 0, -r * 1.05);
    ctx.quadraticCurveTo(r * 1.05, -r * 0.2, r * 0.95, r * 0.55);
    ctx.quadraticCurveTo(0, r * 0.95, -r * 0.95, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, -r * 0.25, r * 0.28, r * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = deep;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.62, r * 0.72, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 3) {
    // Peppermint disc
    ctx.fillStyle = alt;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2;
      const a1 = a0 + Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 4) {
    // Soft square chocolate / toffee
    const s = r * 1.35;
    ctx.fillStyle = deep;
    ctx.beginPath();
    ctx.roundRect(-s * 0.5, -s * 0.5, s, s, r * 0.22);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(-s * 0.38, -s * 0.38, s * 0.76, s * 0.76, r * 0.16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.38);
    ctx.lineTo(0, s * 0.38);
    ctx.moveTo(-s * 0.38, 0);
    ctx.lineTo(s * 0.38, 0);
    ctx.stroke();
  } else if (kind === 5) {
    // Jelly bean
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.72, r * 1.05, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lite;
    ctx.beginPath();
    ctx.ellipse(-r * 0.18, -r * 0.35, r * 0.22, r * 0.38, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = deep;
    ctx.beginPath();
    ctx.ellipse(r * 0.12, r * 0.45, r * 0.35, r * 0.18, 0.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 6) {
    // Star candy
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const b = a + Math.PI / 5;
      const ox = Math.cos(a) * r;
      const oy = Math.sin(a) * r;
      const ix = Math.cos(b) * r * 0.42;
      const iy = Math.sin(b) * r * 0.42;
      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.18, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Round gumball with ribbon
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = foil;
    ctx.lineWidth = Math.max(1.4, r * 0.28);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0.2, Math.PI * 1.3);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.32, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawWorld(
  ctx: CanvasRenderingContext2D,
  state: SnakeState,
  focus: { x: number; y: number },
  w: number,
  h: number,
  youId?: string,
  tMs = 0,
  foodBorn?: Map<string, number>,
) {
  const scale = Math.min(w, h) / (VIEW_RADIUS * 2);
  const camX = focus.x - w / scale / 2;
  const camY = focus.y - h / scale / 2;
  const toScreen = (x: number, y: number) => ({
    sx: (x - camX) * scale,
    sy: (y - camY) * scale,
  });

  const sky = ctx.createRadialGradient(w * 0.5, h * 0.35, 20, w * 0.5, h * 0.55, Math.max(w, h) * 0.72);
  sky.addColorStop(0, "#143d48");
  sky.addColorStop(0.45, "#0b2430");
  sky.addColorStop(1, "#061018");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(94, 234, 212, 0.07)";
  ctx.lineWidth = 1;
  const step = 10;
  const x0 = Math.floor(camX / step) * step;
  const y0 = Math.floor(camY / step) * step;
  for (let x = x0; x < camX + w / scale + step; x += step) {
    const { sx } = toScreen(x, 0);
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.stroke();
  }
  for (let y = y0; y < camY + h / scale + step; y += step) {
    const { sy } = toScreen(0, y);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();
  }

  const a = toScreen(0, 0);
  const b = toScreen(WORLD, WORLD);
  ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
  ctx.strokeStyle = "rgba(45, 212, 191, 0.2)";
  ctx.lineWidth = 10;
  ctx.strokeRect(a.sx - 4, a.sy - 4, b.sx - a.sx + 8, b.sy - a.sy + 8);

  const firstFoodFrame = Boolean(foodBorn) && foodBorn!.size === 0;
  for (const f of state.foods) {
    const { sx, sy } = toScreen(f.x, f.y);
    if (sx < -30 || sy < -30 || sx > w + 30 || sy > h + 30) continue;
    const pulse = 1 + Math.sin(tMs / 220 + f.x + f.y) * 0.12;
    let fade = 1;
    if (foodBorn) {
      let born = foodBorn.get(f.id);
      if (born === undefined) {
        // First frame of the map: show everything at once; later arrivals ease in.
        born = firstFoodFrame ? tMs - 1000 : tMs;
        foodBorn.set(f.id, born);
      }
      fade = Math.max(0, Math.min(1, (tMs - born) / 260));
    }
    if (fade <= 0) continue;
    ctx.globalAlpha = fade;
    const r = Math.max(2.6, 0.95 * scale) * pulse * (0.55 + 0.45 * fade);
    drawCandy(ctx, f, sx, sy, r, tMs);
    ctx.globalAlpha = 1;
  }

  for (const p of state.players) {
    if (!p.path.length) continue;
    const width = Math.max(4, (HEAD_R * 1.65 + Math.min(p.score, 40) * 0.045) * scale);
    const boosting = Boolean(p.boosting && p.alive);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = p.alive ? 1 : 0.32;

    if (boosting) {
      ctx.strokeStyle = `hsla(${p.hue} 90% 70% / 0.35)`;
      ctx.lineWidth = width * 1.55;
      ctx.beginPath();
      p.path.forEach((pt, i) => {
        const { sx, sy } = toScreen(pt.x, pt.y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }

    // Outline for every snake: bright rim + dark inner edge, so bodies read clearly on any backdrop.
    const tracePath = () => {
      ctx.beginPath();
      p.path.forEach((pt, i) => {
        const { sx, sy } = toScreen(pt.x, pt.y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      if (p.path.length === 1) {
        const { sx, sy } = toScreen(p.path[0]!.x, p.path[0]!.y);
        ctx.lineTo(sx + 0.01, sy);
      }
    };
    const rim = Math.max(2, width * 0.16);
    tracePath();
    ctx.strokeStyle = p.id === youId ? "#ffffff" : `hsl(${p.hue} 85% 90%)`;
    ctx.lineWidth = width + rim * 2 + 2;
    ctx.stroke();
    tracePath();
    ctx.strokeStyle = `hsl(${p.hue} 45% 14%)`;
    ctx.lineWidth = width + 2.5;
    ctx.stroke();

    ctx.strokeStyle = `hsl(${p.hue} 78% ${p.alive ? (boosting ? 62 : 50) : 28}%)`;
    ctx.lineWidth = width;
    ctx.beginPath();
    p.path.forEach((pt, i) => {
      const { sx, sy } = toScreen(pt.x, pt.y);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    if (p.path.length === 1) {
      const { sx, sy } = toScreen(p.path[0]!.x, p.path[0]!.y);
      ctx.lineTo(sx + 0.01, sy);
    }
    ctx.stroke();

    const head = toScreen(p.x, p.y);
    const hr = width * 0.58;
    const shielded = isShielded(p, Date.now());
    if (shielded) {
      const pulse = 1 + Math.sin(tMs / 140) * 0.08;
      ctx.beginPath();
      ctx.strokeStyle = `hsla(${p.hue} 90% 70% / 0.85)`;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.arc(head.sx, head.sy, hr * 1.85 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue} 80% 60% / 0.12)`;
      ctx.arc(head.sx, head.sy, hr * 1.85 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.fillStyle = `hsl(${p.hue} 82% ${p.alive ? 58 : 34}%)`;
    ctx.arc(head.sx, head.sy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.id === youId ? "#ffffff" : `hsl(${p.hue} 85% 90%)`;
    ctx.lineWidth = p.id === youId ? 2.8 : 2.2;
    ctx.stroke();

    const eyeAng = p.angle;
    const eyeDist = hr * 0.42;
    for (const side of [-1, 1]) {
      const ox = Math.cos(eyeAng) * eyeDist * 0.35 - Math.sin(eyeAng) * side * hr * 0.32;
      const oy = Math.sin(eyeAng) * eyeDist * 0.35 + Math.cos(eyeAng) * side * hr * 0.32;
      ctx.beginPath();
      ctx.fillStyle = "#f8fafc";
      ctx.arc(head.sx + ox, head.sy + oy, Math.max(1.6, hr * 0.22), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = "#0f172a";
      ctx.arc(
        head.sx + ox + Math.cos(eyeAng) * hr * 0.08,
        head.sy + oy + Math.sin(eyeAng) * hr * 0.08,
        Math.max(1, hr * 0.1),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.fillStyle = "rgba(226, 232, 240, 0.92)";
    ctx.font = `700 ${Math.max(11, scale * 1.15)}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(p.name, head.sx, head.sy - hr - 6);
    ctx.globalAlpha = 1;
  }

  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(2, 8, 14, 0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

export function SnakePage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "snake" ? lobby.room : null;
  const [local, setLocal] = useState<SnakeState | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState("");
  const [hud, setHud] = useState<{
    score: number;
    energy: number;
    boosting: boolean;
    players: number;
    alive: boolean;
    shieldLeft: number;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stickRef = useRef<HTMLDivElement | null>(null);
  const aimRef = useRef<number | null>(null);
  const boostRef = useRef(false);
  const stickActiveRef = useRef(false);
  const camRef = useRef({ x: WORLD / 2, y: WORLD / 2 });
  const liveRef = useRef<SnakeState | null>(null);
  const lastNetRef = useRef(0);
  const lastAimSent = useRef<number | null>(null);
  const lastBoostSent = useRef(false);
  const lastServerTickRef = useRef(-1);
  /** Foods eaten in prediction + latest rival poses (see NetMemo). */
  const memoRef = useRef(newNetMemo());
  const netSeqRef = useRef(0);
  /** Logical time (ms) of the latest physics step — render interpolates from here. */
  const stepAtRef = useRef(0);
  /** First time each food id was drawn, for a short fade-in instead of popping. */
  const foodBornRef = useRef<Map<string, number>>(new Map());
  const [stickKnob, setStickKnob] = useState({ x: 0, y: 0 });
  const [stickLive, setStickLive] = useState(false);

  const world = Boolean(room && (room.id === SNAKE_WORLD_ID || (room.view as SnakeState | undefined)?.mode === "world"));
  const practice = Boolean(local && !room);
  const serverView = room?.view as SnakeState | undefined;
  const youId = practice ? "you" : user?.id;
  // Must be React state (not liveRef) so the canvas mounts and paint effect can attach.
  const showing = Boolean(serverView || local);

  useEffect(() => {
    if (room) {
      setLocal(null);
      return;
    }
    // Left the world ? drop predicted state so entry/rejoin starts clean.
    liveRef.current = null;
    lastServerTickRef.current = -1;
    setHud(null);
  }, [room]);

  useEffect(() => {
    lastServerTickRef.current = -1;
    memoRef.current = newNetMemo();
    foodBornRef.current = new Map();
  }, [room?.id]);

  useEffect(() => {
    if (practice && local) liveRef.current = local;
  }, [practice, local]);

  function netSend(action: SnakeAction) {
    if (!room) return;
    const now = performance.now();
    if (action.type === "aim") {
      if (
        now - lastNetRef.current < 20 &&
        lastAimSent.current != null &&
        Math.abs(normDiff(lastAimSent.current, action.angle)) < 0.05
      ) {
        return;
      }
      lastAimSent.current = action.angle;
      lastNetRef.current = now;
    }
    if (action.type === "boost") {
      if (action.on === lastBoostSent.current) return;
      lastBoostSent.current = action.on;
    }
    // Strictly increasing sequence: HTTP can deliver aim/boost out of order, and an old aim landing
    // last left the server steering a different way than the screen (drift, food "eaten" twice).
    const n = Math.max(netSeqRef.current + 1, Date.now());
    netSeqRef.current = n;
    void lobby.sendAction({ ...action, n });
  }

  function applyLocal(action: SnakeAction) {
    const cur = liveRef.current;
    if (!cur || !youId) return;
    liveRef.current = applySnakeAction(cur, youId, action);
    if (practice) setLocal(liveRef.current);
    else netSend(action);
  }

  const hudAtRef = useRef(0);

  function pushHud(cur: SnakeState, force = false) {
    const now = performance.now();
    if (!force && now - hudAtRef.current < 80) return;
    hudAtRef.current = now;
    const me = youId ? cur.players.find((p) => p.id === youId) : undefined;
    setHud({
      score: me?.score ?? 0,
      energy: me?.energy ?? 0,
      boosting: Boolean(me?.boosting),
      players: cur.players.length,
      alive: Boolean(me?.alive),
      shieldLeft: me?.shieldUntil ? Math.max(0, me.shieldUntil - Date.now()) : 0,
    });
  }

  useEffect(() => {
    if (!serverView || practice) return;
    // Same tick / duplicate watch payloads must not re-merge — that flickers foods & peers.
    if (serverView.tick <= lastServerTickRef.current && liveRef.current) return;
    lastServerTickRef.current = serverView.tick;
    liveRef.current = reconcileSnake(serverView, liveRef.current, youId, memoRef.current);
    pushHud(liveRef.current, true);
  }, [serverView, practice, youId, serverView?.tick]);

  // Practice: full local sim. Online: predict only yourself; peers/food come from server.
  useEffect(() => {
    if (!practice && !world) return;
    const stepOnce = () => {
      let cur = liveRef.current;
      if (!cur) return;
      if (practice) {
        for (const p of cur.players) {
          if (!p.human && p.alive) cur = applySnakeAction(cur, p.id, aiSnake(cur, p.id));
        }
      }
      if (youId && aimRef.current != null && cur.players.some((p) => p.id === youId && p.alive)) {
        cur = applySnakeAction(cur, youId, { type: "aim", angle: aimRef.current });
        if (world) netSend({ type: "aim", angle: aimRef.current });
      }
      if (youId) {
        const me = cur.players.find((p) => p.id === youId);
        if (me && me.boosting !== boostRef.current) {
          cur = applySnakeAction(cur, youId, { type: "boost", on: boostRef.current });
          if (world) netSend({ type: "boost", on: boostRef.current });
        }
      }
      if (practice) cur = stepSnake(cur);
      else if (youId) cur = smoothPeers(stepSelfPredict(cur, youId, Date.now(), memoRef.current), memoRef.current, youId);
      liveRef.current = cur;
      if (practice) setLocal(cur);
      pushHud(cur);
    };
    // Fixed-timestep accumulator: a late/throttled timer must not change game speed (it used to make
    // the local snake lag behind the server, then rubber-band).
    stepAtRef.current = performance.now();
    const id = window.setInterval(() => {
      const t = performance.now();
      let n = Math.floor((t - stepAtRef.current) / TICK_MS);
      if (n <= 0) return;
      n = Math.min(n, 3);
      stepAtRef.current += n * TICK_MS;
      if (t - stepAtRef.current > 200) stepAtRef.current = t;
      for (let i = 0; i < n; i++) stepOnce();
    }, 16);
    return () => window.clearInterval(id);
  }, [practice, world, youId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space" || e.key === "Shift") {
        if (!liveRef.current) return;
        e.preventDefault();
        if (!boostRef.current) {
          boostRef.current = true;
          applyLocal({ type: "boost", on: true });
        }
        return;
      }
      const angle = keyAim(e.key);
      if (angle == null || !liveRef.current) return;
      e.preventDefault();
      aimRef.current = angle;
      applyLocal({ type: "aim", angle });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space" || e.key === "Shift") {
        e.preventDefault();
        boostRef.current = false;
        applyLocal({ type: "boost", on: false });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [practice, room]);

  useEffect(() => {
    if (!showing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let frameNo = 0;
    const paint = (t: number) => {
      const state = liveRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx && state) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const bw = Math.floor(rect.width * dpr);
        const bh = Math.floor(rect.height * dpr);
        if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw;
          canvas.height = bh;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Physics runs at 30 Hz; slide every snake between its last two steps so 60/120 Hz screens
        // show continuous motion instead of judder.
        const alpha = Math.max(0, Math.min(1, (performance.now() - stepAtRef.current) / TICK_MS));
        const shown = alpha < 1 ? interpolateState(state, alpha) : state;
        const me = youId ? shown.players.find((p) => p.id === youId) : undefined;
        if (me && me.alive) {
          const dx = me.x - camRef.current.x;
          const dy = me.y - camRef.current.y;
          // Locked to the head while playing; only glide after a respawn / big jump.
          if (Math.hypot(dx, dy) > 10) camRef.current = { x: camRef.current.x + dx * 0.28, y: camRef.current.y + dy * 0.28 };
          else camRef.current = { x: me.x, y: me.y };
        }
        frameNo += 1;
        const born = foodBornRef.current;
        const revived = memoRef.current.revived;
        if (revived.size) {
          for (const id of revived) born.set(id, t);
          revived.clear();
        }
        if (frameNo % 90 === 0 && born.size > 400) {
          const ids = new Set(state.foods.map((f) => f.id));
          for (const k of born.keys()) if (!ids.has(k)) born.delete(k);
        }
        drawWorld(ctx, shown, camRef.current, rect.width, rect.height, youId, t, born);
      }
      raf = window.requestAnimationFrame(paint);
    };
    raf = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(raf);
  }, [youId, showing]);

  function aimFromStick(clientX: number, clientY: number) {
    const el = stickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.36;
    const mag = Math.hypot(dx, dy);
    // Tiny deadzone = higher stick sensitivity
    if (mag < 4) {
      setStickKnob({ x: 0, y: 0 });
      return;
    }
    if (mag > max) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    setStickKnob({ x: dx, y: dy });
    const angle = Math.atan2(dy, dx);
    aimRef.current = angle;
    applyLocal({ type: "aim", angle });
  }

  function endStick() {
    stickActiveRef.current = false;
    setStickLive(false);
    setStickKnob({ x: 0, y: 0 });
  }

  function aimFromPointer(clientX: number, clientY: number) {
    if (stickActiveRef.current) return;
    const canvas = canvasRef.current;
    const state = liveRef.current;
    if (!canvas || !state || !youId) return;
    const me = state.players.find((p) => p.id === youId);
    if (!me || !me.alive) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width, rect.height) / (VIEW_RADIUS * 2);
    const camX = camRef.current.x - rect.width / scale / 2;
    const camY = camRef.current.y - rect.height / scale / 2;
    const wx = camX + (clientX - rect.left) / scale;
    const wy = camY + (clientY - rect.top) / scale;
    const angle = Math.atan2(wy - me.y, wx - me.x);
    aimRef.current = angle;
    applyLocal({ type: "aim", angle });
  }

  const top = [...(liveRef.current ?? serverView ?? local)?.players ?? []]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const meLive = youId ? (liveRef.current ?? serverView ?? local)?.players.find((p) => p.id === youId) : undefined;

  return (
    <div className="page-wide snake-page">
      <div className="game-head snake-head">
        <div>
          <p className="kicker">13 / SNAKE · World</p>
          <h1>Snake</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="snake" />
          {showing ? (
            <ClickPop label="Log">
              <h3>LOG</h3>
              <div className="log">
                {[...(liveRef.current ?? serverView ?? local)?.log ?? []].reverse().slice(0, 12).map((l) => (
                  <div key={l.id}>{l.text}</div>
                ))}
              </div>
            </ClickPop>
          ) : null}
          {practice ? (
            <button className="btn btn-ghost" type="button" onClick={() => { setLocal(null); liveRef.current = null; }}>
              RESET
            </button>
          ) : null}
          <button className="btn btn-ghost" type="button" onClick={() => void lobby.leaveHome()}>
            LEAVE
          </button>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-snake">
          {!showing ? (
            <div className="snake-entry">
              <div className="snake-entry-glow" aria-hidden />
              <p className="kicker">SNAKE</p>
              <h2>Twist. Feed. Boost.</h2>
              <p>
                {joining
                  ? "Dropping you onto the global map?"
                  : "One continuous arena for everyone online. Steer with mouse or WASD, eat to grow and fill energy, hold Space to boost."}
              </p>
              {joinErr || lobby.error ? <p className="form-error">{joinErr || lobby.error}</p> : null}
              <div className="row-actions" style={{ justifyContent: "center" }}>
                {user ? (
                  <button
                    className="btn snake-cta"
                    type="button"
                    disabled={joining}
                    onClick={() => {
                      setJoining(true);
                      setJoinErr("");
                      void lobby
                        .joinSnakeWorld()
                        .catch((ex) => {
                          setJoinErr(ex instanceof Error ? ex.message : "Could not enter the snake world");
                        })
                        .finally(() => setJoining(false));
                    }}
                  >
                    Enter world
                  </button>
                ) : (
                  <p className="muted">Sign in to enter the shared world, or practice offline.</p>
                )}
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    const s = startSnakePractice(2);
                    liveRef.current = s;
                    setLocal(s);
                  }}
                >
                  Practice vs CPU
                </button>
              </div>
            </div>
          ) : (
            <div className="snake-wrap">
              <div className="snake-scores">
                {top.map((p) => (
                  <span
                    key={p.id}
                    className={`snake-tag${p.alive ? "" : " out"}${p.id === youId ? " you" : ""}`}
                    style={{ ["--hue" as string]: p.hue }}
                  >
                    <span>{p.name}</span>
                    <b>{p.score}</b>
                  </span>
                ))}
              </div>
              <div className="snake-stage">
                <canvas
                  ref={canvasRef}
                  className="snake-canvas"
                  aria-label="Snake arena"
                  onPointerMove={(e) => {
                    if (e.buttons || e.pointerType === "touch") aimFromPointer(e.clientX, e.clientY);
                    else aimFromPointer(e.clientX, e.clientY);
                  }}
                  onPointerDown={(e) => {
                    canvasRef.current?.setPointerCapture(e.pointerId);
                    aimFromPointer(e.clientX, e.clientY);
                  }}
                />
                <div className="snake-hud" aria-live="polite">
                  <div>
                    <span className="snake-hud-k">Score</span>
                    <strong>{hud?.score ?? meLive?.score ?? 0}</strong>
                  </div>
                  <div>
                    <span className="snake-hud-k">{world ? "Online" : "Practice"}</span>
                    <strong>{hud?.players ?? top.length}</strong>
                  </div>
                  {(hud?.shieldLeft ?? 0) > 0 || (meLive && isShielded(meLive)) ? (
                    <div className="snake-boost-pill on">
                      SHIELD {Math.ceil((hud?.shieldLeft ?? Math.max(0, (meLive?.shieldUntil ?? 0) - Date.now())) / 1000)}s
                    </div>
                  ) : null}
                </div>
                {!hud?.alive && meLive && !meLive.alive ? <div className="snake-respawn">Respawning…</div> : null}
              </div>
              <div className="snake-energy" aria-label="Energy">
                <div className="snake-energy-meta">
                  <span>Energy</span>
                  <b>
                    {Math.round(hud?.energy ?? meLive?.energy ?? 0)} / {ENERGY_MAX}
                  </b>
                  <span className={`snake-energy-boost${hud?.boosting ? " on" : ""}${(meLive && canBoost(meLive)) || (hud?.energy ?? 0) > 0 ? "" : " dim"}`}>
                    {hud?.boosting ? "BOOSTING" : "Hold Space / BOOST"}
                  </span>
                </div>
                <button
                  type="button"
                  className={`snake-energy-track${hud?.boosting ? " on" : ""}${(hud?.energy ?? meLive?.energy ?? 0) <= 0 ? " empty" : ""}`}
                  disabled={(hud?.energy ?? meLive?.energy ?? 0) <= 0 && !hud?.boosting}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if ((hud?.energy ?? meLive?.energy ?? 0) <= 0) return;
                    boostRef.current = true;
                    applyLocal({ type: "boost", on: true });
                  }}
                  onPointerUp={() => {
                    boostRef.current = false;
                    applyLocal({ type: "boost", on: false });
                  }}
                  onPointerLeave={() => {
                    if (!boostRef.current) return;
                    boostRef.current = false;
                    applyLocal({ type: "boost", on: false });
                  }}
                >
                  <span
                    className="snake-energy-fill"
                    style={{ width: `${Math.max(0, Math.min(100, ((hud?.energy ?? meLive?.energy ?? 0) / ENERGY_MAX) * 100))}%` }}
                  />
                </button>
              </div>
              <div className="snake-touch-bar" aria-label="Mobile controls">
                <div
                  ref={stickRef}
                  className={`snake-stick${stickLive ? " active" : ""}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    stickActiveRef.current = true;
                    setStickLive(true);
                    stickRef.current?.setPointerCapture(e.pointerId);
                    aimFromStick(e.clientX, e.clientY);
                  }}
                  onPointerMove={(e) => {
                    if (!stickActiveRef.current) return;
                    e.preventDefault();
                    aimFromStick(e.clientX, e.clientY);
                  }}
                  onPointerUp={endStick}
                  onPointerCancel={endStick}
                >
                  <span className="snake-stick-base" />
                  <span className="snake-stick-knob" style={{ transform: `translate(${stickKnob.x}px, ${stickKnob.y}px)` }} />
                </div>
                <button
                  type="button"
                  className={`snake-boost-btn${hud?.boosting ? " on" : ""}${(hud?.energy ?? meLive?.energy ?? 0) <= 0 ? " empty" : ""}`}
                  disabled={(hud?.energy ?? meLive?.energy ?? 0) <= 0 && !hud?.boosting}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if ((hud?.energy ?? meLive?.energy ?? 0) <= 0) return;
                    boostRef.current = true;
                    applyLocal({ type: "boost", on: true });
                  }}
                  onPointerUp={() => {
                    boostRef.current = false;
                    applyLocal({ type: "boost", on: false });
                  }}
                  onPointerLeave={() => {
                    if (!boostRef.current) return;
                    boostRef.current = false;
                    applyLocal({ type: "boost", on: false });
                  }}
                >
                  BOOST
                </button>
              </div>
              <p className="snake-hint">Mouse / WASD / stick · eat for energy & length · boost spends energy</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Draw-time interpolation: each body point slides from where its predecessor was one step ago to
 * where it is now (`path = [newHead, ...oldPath]`), so motion is continuous between 30 Hz steps.
 */
function interpolateState(state: SnakeState, alpha: number): SnakeState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (!p.alive || p.path.length < 3) return p;
      const path = p.path.map((pt, i) => {
        const before = p.path[i + 1];
        if (!before) return pt;
        return { x: before.x + (pt.x - before.x) * alpha, y: before.y + (pt.y - before.y) * alpha };
      });
      const head = path[0]!;
      return { ...p, x: head.x, y: head.y, path };
    }),
  };
}

function normDiff(a: number, b: number) {
  let d = b - a;
  while (d <= -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return d;
}
