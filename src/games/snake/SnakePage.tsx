import { useEffect, useState } from "react";
import {
  aiSnake,
  applySnakeAction,
  cameraOrigin,
  COLS,
  COUNTDOWN_MS,
  finishCountdown,
  ROWS,
  startSnakePractice,
  stepSnake,
  TICK_MS,
  VIEW_COLS,
  VIEW_ROWS,
  type SnakeAction,
  type SnakeState,
} from "./engine";
import { ClickPop, RulesButton } from "../../components/GameRules";
import { MixedCpuBar, seatTag, TableReadyControls } from "../../components/MixedCpuBar";
import { SeatTalk } from "../../components/TableTalk";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { forfeitText } from "../../lib/forfeit";

function keyDir(key: string): { x: number; y: number } | null {
  if (key === "ArrowUp" || key === "w" || key === "W") return { x: 0, y: -1 };
  if (key === "ArrowDown" || key === "s" || key === "S") return { x: 0, y: 1 };
  if (key === "ArrowLeft" || key === "a" || key === "A") return { x: -1, y: 0 };
  if (key === "ArrowRight" || key === "d" || key === "D") return { x: 1, y: 0 };
  return null;
}

export function SnakePage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "snake" ? lobby.room : null;
  const [local, setLocal] = useState<SnakeState | null>(null);
  const held = (!room && lobby.settlement?.game === "snake" ? lobby.settlement.view : null) as SnakeState | null;
  const state = (room?.view as SnakeState | undefined) ?? held ?? local;
  const practice = Boolean(local && !room && !held);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const waiting = Boolean(state?.phase === "lobby");

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local) return;
    if (local.phase === "countdown") {
      const t = window.setTimeout(() => setLocal((s) => (s ? finishCountdown(s) : s)), COUNTDOWN_MS);
      return () => window.clearTimeout(t);
    }
    if (local.phase !== "play") return;
    const id = window.setInterval(() => {
      setLocal((s) => {
        if (!s || s.phase !== "play") return s;
        let next = s;
        for (const p of s.players) {
          if (!p.human && p.alive) next = applySnakeAction(next, p.id, aiSnake(next, p.id));
        }
        return stepSnake(next);
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [practice, local?.phase]);

  useEffect(() => {
    if (!state || state.phase === "lobby" || state.phase === "over") return;
    const onKey = (e: KeyboardEvent) => {
      const dir = keyDir(e.key);
      if (!dir) return;
      e.preventDefault();
      if (room) {
        void lobby.sendAction({ type: "dir", x: dir.x, y: dir.y });
        return;
      }
      setLocal((s) => (s ? applySnakeAction(s, "you", { type: "dir", x: dir.x, y: dir.y }) : s));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state?.phase, room, lobby]);

  function act(action: SnakeAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s ? applySnakeAction(s, "you", action) : s));
  }

  const cells = new Map<string, { kind: "body" | "head" | "food"; hue?: number; dead?: boolean }>();
  if (state) {
    cells.set(`${state.food.x},${state.food.y}`, { kind: "food" });
    for (const p of state.players) {
      p.body.forEach((c, i) => {
        cells.set(`${c.x},${c.y}`, {
          kind: i === 0 ? "head" : "body",
          hue: p.hue,
          dead: !p.alive,
        });
      });
    }
  }
  const focus = me?.alive && me.body[0] ? me.body[0] : state?.food ?? { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
  const { ox, oy } = cameraOrigin(focus);
  const atEdge = ox <= 0 || oy <= 0 || ox >= COLS - VIEW_COLS || oy >= ROWS - VIEW_ROWS;

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">13 / SNAKE · Live</p>
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
          {!state || !me || waiting ? (
            <div className="coda-deal">
              <p className="kicker">{waiting ? "TABLE" : "SNAKE"}</p>
              <h2>{waiting ? `Table ${state?.players.length ?? 0}/4` : "Eat, don’t crash"}</h2>
              <p>
                {waiting
                  ? "Add CPUs or invite friends, then everyone Ready. Arrows or WASD. Last snake alive — or first to 8 apples — wins."
                  : "Large scrolling 48×32 map. Steer with arrows or WASD. Walls, yourself, and other snakes kill."}
              </p>
              {waiting && state ? (
                <ul className="lobby-roster">
                  {state.players.map((p, i) => (
                    <li key={p.id}>
                      <SeatTalk playerId={p.id} name={p.name} />
                      <span>{seatTag(p, i, state.players[0]?.id, (state as { readyIds?: string[] }).readyIds)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <MixedCpuBar game="snake" onPractice={(cpus) => setLocal(startSnakePractice(cpus + 1))} />
              <div className="row-actions" style={{ justifyContent: "center" }}>
                <TableReadyControls
                  waiting={waiting}
                  game="snake"
                  players={state?.players ?? []}
                  youId={youId}
                  readyIds={(state as { readyIds?: string[] } | null)?.readyIds}
                  matched={(state as { matched?: boolean } | null)?.matched}
                  onReady={() => act({ type: "ready" })}
                />
              </div>
            </div>
          ) : (
            <div className="kaiji-board-wrap snake-wrap">
              <div className="snake-scores">
                {state.players.map((p) => (
                  <span key={p.id} className={`snake-tag${p.alive ? "" : " out"}`} style={{ ["--hue" as string]: p.hue }}>
                    <SeatTalk playerId={p.id} name={p.name} />
                    <b>{p.score}</b>
                  </span>
                ))}
              </div>
              <p className="status-line">
                {state.phase === "countdown"
                  ? `Get ready. Arrows or WASD. Arena ${COLS}×${ROWS} — the view follows your head.`
                  : state.phase === "over"
                    ? forfeitText(state) ||
                      (state.winnerId
                        ? `${state.players.find((p) => p.id === state.winnerId)?.name} wins.`
                        : "Draw — every snake crashed.")
                    : `Steer with arrows or WASD. Map ${COLS}×${ROWS}; camera pans with you. Eat apples — don’t hit a wall, yourself, or another snake.`}
              </p>
              <div
                className={`snake-grid${atEdge ? " at-edge" : ""}`}
                style={{
                  gridTemplateColumns: `repeat(${VIEW_COLS}, 1fr)`,
                  gridTemplateRows: `repeat(${VIEW_ROWS}, 1fr)`,
                }}
                role="img"
                aria-label={`Snake arena view ${ox},${oy} of ${COLS} by ${ROWS}`}
              >
                {Array.from({ length: VIEW_ROWS * VIEW_COLS }, (_, i) => {
                  const x = ox + (i % VIEW_COLS);
                  const y = oy + Math.floor(i / VIEW_COLS);
                  const cell = cells.get(`${x},${y}`);
                  const wall =
                    x <= 0 || y <= 0 || x >= COLS - 1 || y >= ROWS - 1
                      ? " near-wall"
                      : "";
                  return (
                    <span
                      key={`${x}-${y}`}
                      className={`snake-cell${cell ? ` is-${cell.kind}` : ""}${cell?.dead ? " dead" : ""}${wall}`}
                      style={cell?.hue != null ? { ["--hue" as string]: cell.hue } : undefined}
                    />
                  );
                })}
              </div>
              <div className="snake-pads" aria-label="Direction">
                {(
                  [
                    { x: 0, y: -1, label: "Up" },
                    { x: -1, y: 0, label: "Left" },
                    { x: 1, y: 0, label: "Right" },
                    { x: 0, y: 1, label: "Down" },
                  ] as const
                ).map((d) => (
                  <button key={d.label} type="button" className="btn btn-ghost" onClick={() => act({ type: "dir", x: d.x, y: d.y })}>
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
