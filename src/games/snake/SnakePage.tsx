import { useEffect, useRef, useState } from "react";
import {
  aiSnake,
  applySnakeAction,
  HEAD_R,
  SNAKE_WORLD_ID,
  SPEED,
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
) {
  const scale = Math.min(w, h) / (VIEW_RADIUS * 2);
  const camX = focus.x - w / scale / 2;
  const camY = focus.y - h / scale / 2;
  const toScreen = (x: number, y: number) => ({
    sx: (x - camX) * scale,
    sy: (y - camY) * scale,
  });

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = "rgba(148,163,184,0.12)";
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

  // Border
  const a = toScreen(0, 0);
  const b = toScreen(WORLD, WORLD);
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 3;
  ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);

  // Food
  for (const f of state.foods) {
    const { sx, sy } = toScreen(f.x, f.y);
    ctx.beginPath();
    ctx.fillStyle = "#f59e0b";
    ctx.arc(sx, sy, Math.max(2.5, 0.85 * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  // Snakes — curved stroke along path
  for (const p of state.players) {
    if (!p.path.length) continue;
    const width = Math.max(4, (HEAD_R * 1.6 + Math.min(p.score, 40) * 0.04) * scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = `hsl(${p.hue} 70% ${p.alive ? 48 : 28}%)`;
    ctx.lineWidth = width;
    ctx.globalAlpha = p.alive ? 1 : 0.35;
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
    ctx.beginPath();
    ctx.fillStyle = `hsl(${p.hue} 75% ${p.alive ? 58 : 35}%)`;
    ctx.arc(head.sx, head.sy, width * 0.55, 0, Math.PI * 2);
    ctx.fill();
    if (p.id === youId) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `${Math.max(10, scale * 1.1)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(p.name, head.sx, head.sy - width * 0.9);
    ctx.globalAlpha = 1;
  }
}

export function SnakePage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "snake" ? lobby.room : null;
  const [local, setLocal] = useState<SnakeState | null>(null);
  const [joining, setJoining] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const aimRef = useRef<number | null>(null);
  const camRef = useRef({ x: WORLD / 2, y: WORLD / 2 });

  const world = Boolean(room && (room.id === SNAKE_WORLD_ID || (room.view as SnakeState | undefined)?.mode === "world"));
  const practice = Boolean(local && !room);
  const state = (room?.view as SnakeState | undefined) ?? local;
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);

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
    if (!practice || !local) return;
    const id = window.setInterval(() => {
      setLocal((s) => {
        if (!s) return s;
        let next = s;
        for (const p of s.players) {
          if (!p.human && p.alive) next = applySnakeAction(next, p.id, aiSnake(next, p.id));
        }
        if (aimRef.current != null && next.players.some((p) => p.id === "you" && p.alive)) {
          next = applySnakeAction(next, "you", { type: "aim", angle: aimRef.current });
        }
        return stepSnake(next);
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [practice, local?.phase]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      const angle = keyAim(e.key);
      if (angle == null) return;
      e.preventDefault();
      aimRef.current = angle;
      act({ type: "aim", angle });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state?.tick, room, practice]);

  function act(action: SnakeAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s ? applySnakeAction(s, "you", action) : s));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = me && me.alive ? { x: me.x, y: me.y } : camRef.current;
    camRef.current = {
      x: camRef.current.x + (target.x - camRef.current.x) * 0.18,
      y: camRef.current.y + (target.y - camRef.current.y) * 0.18,
    };
    drawWorld(ctx, state, camRef.current, rect.width, rect.height, youId);
  }, [state, me?.x, me?.y, me?.alive, youId]);

  const top = [...(state?.players ?? [])].sort((a, b) => b.score - a.score).slice(0, 8);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">13 / SNAKE · World</p>
          <h1>Snake</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="snake" />
          {state ? (
            <ClickPop label="Log">
              <h3>LOG</h3>
              <div className="log">
                {[...state.log].reverse().slice(0, 12).map((l) => (
                  <div key={l.id}>{l.text}</div>
                ))}
              </div>
            </ClickPop>
          ) : null}
          {practice ? (
            <button className="btn btn-ghost" type="button" onClick={() => setLocal(null)}>
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
          {!state ? (
            <div className="coda-deal">
              <p className="kicker">SNAKE</p>
              <h2>Shared twisting arena</h2>
              <p>
                {joining
                  ? "Joining the global map…"
                  : "Everyone online on /play/snake shares one continuous map. Steer with arrows or WASD — your body bends as you turn. Crash and respawn."}
              </p>
              <div className="row-actions" style={{ justifyContent: "center" }}>
                {user ? (
                  <button
                    className="btn"
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
                <button className="btn btn-ghost" type="button" onClick={() => setLocal(startSnakePractice(2))}>
                  Practice vs CPU
                </button>
              </div>
            </div>
          ) : (
            <div className="kaiji-board-wrap snake-wrap">
              <div className="snake-scores">
                {top.map((p) => (
                  <span key={p.id} className={`snake-tag${p.alive ? "" : " out"}`} style={{ ["--hue" as string]: p.hue }}>
                    <span>{p.name}</span>
                    <b>{p.score}</b>
                  </span>
                ))}
              </div>
              <p className="status-line">
                {world
                  ? `Global ${WORLD}×${WORLD} map · ${state.players.length} snake${state.players.length === 1 ? "" : "s"} · bend with WASD`
                  : `Practice · bend with WASD · speed ${SPEED}`}
                {me && !me.alive ? " · Respawning…" : ""}
              </p>
              <canvas ref={canvasRef} className="snake-canvas" aria-label="Snake arena" />
              <div className="snake-pads" aria-label="Direction">
                {(
                  [
                    { angle: -Math.PI / 2, label: "Up" },
                    { angle: Math.PI, label: "Left" },
                    { angle: 0, label: "Right" },
                    { angle: Math.PI / 2, label: "Down" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      aimRef.current = d.angle;
                      act({ type: "aim", angle: d.angle });
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
