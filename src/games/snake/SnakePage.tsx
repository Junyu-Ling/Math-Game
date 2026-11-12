import { useEffect, useRef, useState } from "react";
import {
  aiSnake,
  applySnakeAction,
  canBoost,
  HEAD_R,
  predictSelf,
  reconcileSnake,
  SNAKE_WORLD_ID,
  startSnakePractice,
  stepSnake,
  TICK_MS,
  VIEW_RADIUS,
  WORLD,
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

function drawWorld(
  ctx: CanvasRenderingContext2D,
  state: SnakeState,
  focus: { x: number; y: number },
  w: number,
  h: number,
  youId?: string,
  tMs = 0,
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

  for (const f of state.foods) {
    const { sx, sy } = toScreen(f.x, f.y);
    const pulse = 1 + Math.sin(tMs / 220 + f.x + f.y) * 0.12;
    const r = Math.max(2.4, 0.9 * scale) * pulse;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.2);
    glow.addColorStop(0, "rgba(251, 191, 36, 0.55)");
    glow.addColorStop(1, "rgba(251, 191, 36, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#fbbf24";
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#fff7d6";
    ctx.arc(sx - r * 0.25, sy - r * 0.25, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
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

    ctx.strokeStyle = `hsl(${p.hue} 40% 18%)`;
    ctx.lineWidth = width + 3;
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
    ctx.beginPath();
    ctx.fillStyle = `hsl(${p.hue} 82% ${p.alive ? 58 : 34}%)`;
    ctx.arc(head.sx, head.sy, hr, 0, Math.PI * 2);
    ctx.fill();
    if (p.id === youId) {
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }

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
  const [hud, setHud] = useState<{ score: number; boosting: boolean; players: number; alive: boolean } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const aimRef = useRef<number | null>(null);
  const boostRef = useRef(false);
  const camRef = useRef({ x: WORLD / 2, y: WORLD / 2 });
  const liveRef = useRef<SnakeState | null>(null);
  const lastNetRef = useRef(0);
  const lastAimSent = useRef<number | null>(null);
  const lastBoostSent = useRef(false);
  const serverAtRef = useRef(performance.now());

  const world = Boolean(room && (room.id === SNAKE_WORLD_ID || (room.view as SnakeState | undefined)?.mode === "world"));
  const practice = Boolean(local && !room);
  const serverView = room?.view as SnakeState | undefined;
  const youId = practice ? "you" : user?.id;

  useEffect(() => {
    if (!user) return;
    if (room?.game === "snake") return;
    let stop = false;
    setJoining(true);
    void (async () => {
      try {
        await lobby.joinSnakeWorld();
      } catch {
        /* stay on practice entry */
      } finally {
        if (!stop) setJoining(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!serverView || practice) return;
    liveRef.current = reconcileSnake(serverView, liveRef.current, youId);
    serverAtRef.current = performance.now();
    const me = youId ? liveRef.current.players.find((p) => p.id === youId) : undefined;
    setHud({
      score: me?.score ?? 0,
      boosting: Boolean(me?.boosting),
      players: liveRef.current.players.length,
      alive: Boolean(me?.alive ?? true),
    });
  }, [serverView, practice, youId, serverView?.tick]);

  useEffect(() => {
    if (practice && local) liveRef.current = local;
  }, [practice, local]);

  function netSend(action: SnakeAction) {
    if (!room) return;
    const now = performance.now();
    if (action.type === "aim") {
      if (
        now - lastNetRef.current < 24 &&
        lastAimSent.current != null &&
        Math.abs(normDiff(lastAimSent.current, action.angle)) < 0.06
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
    void lobby.sendAction(action);
  }

  function applyLocal(action: SnakeAction) {
    const cur = liveRef.current;
    if (!cur || !youId) return;
    liveRef.current = applySnakeAction(cur, youId, action);
    if (practice) setLocal(liveRef.current);
    else netSend(action);
  }

  useEffect(() => {
    if (!practice) return;
    const id = window.setInterval(() => {
      let cur = liveRef.current;
      if (!cur) return;
      for (const p of cur.players) {
        if (!p.human && p.alive) cur = applySnakeAction(cur, p.id, aiSnake(cur, p.id));
      }
      if (youId && aimRef.current != null && cur.players.some((p) => p.id === youId && p.alive)) {
        cur = applySnakeAction(cur, youId, { type: "aim", angle: aimRef.current });
      }
      if (youId) {
        const me = cur.players.find((p) => p.id === youId);
        if (me && me.boosting !== boostRef.current) {
          cur = applySnakeAction(cur, youId, { type: "boost", on: boostRef.current });
        }
      }
      cur = stepSnake(cur);
      liveRef.current = cur;
      setLocal(cur);
      const me = youId ? cur.players.find((p) => p.id === youId) : undefined;
      setHud({
        score: me?.score ?? 0,
        boosting: Boolean(me?.boosting),
        players: cur.players.length,
        alive: Boolean(me?.alive),
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [practice, youId]);

  // Online: keep sending held aim/boost and nudge the server clock without double-simulating.
  useEffect(() => {
    if (!world || practice) return;
    const id = window.setInterval(() => {
      if (!youId || !liveRef.current) return;
      if (aimRef.current != null) {
        liveRef.current = applySnakeAction(liveRef.current, youId, { type: "aim", angle: aimRef.current });
        netSend({ type: "aim", angle: aimRef.current });
      }
      const me = liveRef.current.players.find((p) => p.id === youId);
      if (me && me.boosting !== boostRef.current) {
        liveRef.current = applySnakeAction(liveRef.current, youId, { type: "boost", on: boostRef.current });
        netSend({ type: "boost", on: boostRef.current });
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [world, practice, youId]);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const paint = (t: number) => {
      let state = liveRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx && state) {
        if (world && youId) {
          const ahead = (performance.now() - serverAtRef.current) / TICK_MS;
          state = predictSelf(state, youId, ahead);
        }
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const bw = Math.floor(rect.width * dpr);
        const bh = Math.floor(rect.height * dpr);
        if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw;
          canvas.height = bh;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const me = youId ? state.players.find((p) => p.id === youId) : undefined;
        const target = me && me.alive ? { x: me.x, y: me.y } : camRef.current;
        camRef.current = {
          x: camRef.current.x + (target.x - camRef.current.x) * 0.28,
          y: camRef.current.y + (target.y - camRef.current.y) * 0.28,
        };
        drawWorld(ctx, state, camRef.current, rect.width, rect.height, youId, t);
      }
      raf = window.requestAnimationFrame(paint);
    };
    raf = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(raf);
  }, [youId, world]);

  function aimFromPointer(clientX: number, clientY: number) {
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

  const showing = Boolean(liveRef.current || local || serverView);
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
                  ? "Dropping you onto the global map…"
                  : "One continuous arena for everyone online. Steer with mouse or WASD, hold Space to burn length for speed."}
              </p>
              <div className="row-actions" style={{ justifyContent: "center" }}>
                {user ? (
                  <button
                    className="btn snake-cta"
                    type="button"
                    disabled={joining}
                    onClick={() => {
                      setJoining(true);
                      void lobby.joinSnakeWorld().finally(() => setJoining(false));
                    }}
                  >
                    Enter world
                  </button>
                ) : null}
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
                  <div className={`snake-boost-pill${(hud?.boosting ?? meLive?.boosting) ? " on" : ""}${(meLive && canBoost(meLive)) || hud?.boosting ? "" : " dim"}`}>
                    {(hud?.boosting ?? meLive?.boosting) ? "BOOST" : "SPACE boost"}
                  </div>
                </div>
                {!hud?.alive && meLive && !meLive.alive ? <div className="snake-respawn">Respawning…</div> : null}
              </div>
              <div className="snake-pads" aria-label="Controls">
                {(
                  [
                    { angle: -Math.PI / 2, label: "↑" },
                    { angle: Math.PI, label: "←" },
                    { angle: 0, label: "→" },
                    { angle: Math.PI / 2, label: "↓" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    className="snake-pad"
                    onPointerDown={() => {
                      aimRef.current = d.angle;
                      applyLocal({ type: "aim", angle: d.angle });
                    }}
                  >
                    {d.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`snake-pad boost${hud?.boosting ? " on" : ""}`}
                  onPointerDown={() => {
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
              <p className="snake-hint">Mouse aim · WASD · hold Space / Shift to boost (burns score)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function normDiff(a: number, b: number) {
  let d = b - a;
  while (d <= -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return d;
}
