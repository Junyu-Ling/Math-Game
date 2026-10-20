import { useEffect, useState } from "react";
import {
  COLORS,
  FINISH,
  HOME,
  LAST_OUTER,
  TRACK,
  trackIndex,
  aiLudo,
  applyLudoAction,
  flyDir,
  flyTrackIndex,
  homeCount,
  homeDir,
  legalMoves,
  planeCell,
  planeHeading,
  startLudoPractice,
  startTrackIndex,
  trackColor,
  trackDir,
  type FlyColor,
  type LAction,
  type LPlane,
  type LPlayer,
  type LState,
} from "./engine";
import { GameRules } from "../../components/GameRules";
import { InvitePanel } from "../../components/InvitePanel";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { forfeitText } from "../../lib/forfeit";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

export function PlaneIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <path
        fill="currentColor"
        stroke="#1c1915"
        strokeWidth="2.2"
        strokeLinejoin="round"
        d="M62 32 46 25.5 40 25.5 33 7 26 14 31 27.5 13 29.5 7 16 3.5 32 7 48 13 34.5 31 36.5 26 50 33 57 40 38.5 46 38.5Z"
      />
      <circle cx="44" cy="32" r="2.2" fill="#fff" stroke="#1c1915" strokeWidth="1" />
    </svg>
  );
}

function Arrow({ dir }: { dir: "e" | "s" | "w" | "n" }) {
  const rot = dir === "e" ? 0 : dir === "s" ? 90 : dir === "w" ? 180 : -90;
  return (
    <svg className="fly-arrow" viewBox="0 0 20 20" style={{ transform: `rotate(${rot}deg)` }} aria-hidden>
      <path d="M4 10h9M10 5.5 14.5 10 10 14.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BASE_PLACE: Record<FlyColor, { gridRow: string; gridColumn: string }> = {
  red: { gridRow: "1 / 7", gridColumn: "1 / 7" },
  blue: { gridRow: "1 / 7", gridColumn: "10 / 16" },
  green: { gridRow: "10 / 16", gridColumn: "10 / 16" },
  yellow: { gridRow: "10 / 16", gridColumn: "1 / 7" },
};

/** Inner corners of the cross, split like the classic board. */
const SPLITS: Array<{ r: number; c: number; a: FlyColor; b: FlyColor }> = [
  { r: 6, c: 6, a: "green", b: "blue" },
  { r: 6, c: 8, a: "green", b: "yellow" },
  { r: 8, c: 6, a: "blue", b: "red" },
  { r: 8, c: 8, a: "red", b: "green" },
];

const JUMPS: Array<{ id: FlyColor; stroke: string; x1: number; y1: number; x2: number; y2: number; rot: number }> = [
  { id: "green", stroke: "#1f9d45", x1: 9.35, y1: 6.15, x2: 5.65, y2: 6.15, rot: 180 },
  { id: "yellow", stroke: "#e0a800", x1: 8.85, y1: 9.35, x2: 8.85, y2: 5.65, rot: -90 },
  { id: "red", stroke: "#e23b3b", x1: 5.65, y1: 8.85, x2: 9.35, y2: 8.85, rot: 0 },
  { id: "blue", stroke: "#2f6bff", x1: 6.15, y1: 5.65, x2: 6.15, y2: 9.35, rot: 90 },
];

function outward(dir: "e" | "s" | "w" | "n"): "e" | "s" | "w" | "n" {
  if (dir === "n") return "s";
  if (dir === "s") return "n";
  if (dir === "e") return "w";
  return "e";
}

function DieFace({ n }: { n: number | null }) {
  const spots: Record<number, Array<[number, number]>> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };
  const on = n ? spots[n] ?? [] : [];
  return (
    <div className="fly-die" aria-label={n ? `Die ${n}` : "Die"}>
      {[0, 1, 2].map((r) => (
        <div key={r} className="fly-die-row">
          {[0, 1, 2].map((c) => (
            <i key={c} className={on.some(([rr, cc]) => rr === r && cc === c) ? "on" : ""} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PlaneToken({
  color,
  heading,
  legal,
  label,
  stack,
  onMove,
}: {
  color: FlyColor;
  heading: number;
  legal: boolean;
  label: string;
  stack: { i: number; n: number };
  onMove?: () => void;
}) {
  const offset = stack.n > 1;
  const style = {
    transform: `rotate(${heading}deg)`,
    ...(offset
      ? { inset: `${6 + stack.i * 12}% auto auto ${6 + stack.i * 10}%`, width: "58%", height: "58%" }
      : null),
  };
  const className = `fly-plane tone-${color}${legal ? " is-legal" : ""}`;
  if (legal && onMove) {
    return (
      <button type="button" className={className} style={style} aria-label={label} onClick={onMove}>
        <PlaneIcon />
      </button>
    );
  }
  return (
    <span className={className} style={style} aria-label={label}>
      <PlaneIcon />
    </span>
  );
}

export function LudoPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "ludo" ? lobby.room : null;
  const [local, setLocal] = useState<LState | null>(null);
  const held = (!room && lobby.settlement?.game === "ludo" ? lobby.settlement.view : null) as LState | null;
  const state = (room?.view as LState | undefined) ?? held ?? local;
  const practice = Boolean(local && !room && !held);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const myTurn = Boolean(
    state && me && state.players[state.turn]?.id === me.id && (state.phase === "roll" || state.phase === "move"),
  );
  const host = Boolean(user && state?.players[0]?.id === user.id);
  const waiting = state?.phase === "lobby";

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over" || local.phase === "lobby") return;
    const actor = local.players[local.turn];
    if (!actor || actor.human) return;
    let stop = false;
    void (async () => {
      await wait(CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase === "over" || s.phase === "lobby") return s;
        const bot = s.players[s.turn];
        if (!bot || bot.human) return s;
        return applyLudoAction(s, bot.id, aiLudo(s));
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: LAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s && me ? applyLudoAction(s, me.id, action) : s));
  }

  const moves = state && myTurn && state.phase === "move" ? legalMoves(state, state.turn) : [];
  const moveSet = new Set(moves);
  const cur = state?.players[state.turn];
  const winner = state?.players.find((p) => p.id === state.winnerId);

  const occupied = new Map<string, Array<{ player: LPlayer; plane: LPlane; ci: number }>>();
  if (state && state.phase !== "lobby") {
    state.players.forEach((player) => {
      const ci = COLORS.indexOf(player.color);
      for (const plane of player.planes) {
        if (plane.pos < 0 || ci < 0) continue;
        const cell = planeCell(ci, plane.pos);
        if (!cell) continue;
        const key = `${cell.r},${cell.c}`;
        const list = occupied.get(key) ?? [];
        list.push({ player, plane, ci });
        occupied.set(key, list);
      }
    });
  }

  const starts = new Map<number, FlyColor>();
  const flies = new Map<number, FlyColor>();
  const doors = new Map<number, FlyColor>();
  COLORS.forEach((color, i) => {
    starts.set(startTrackIndex(i), color);
    flies.set(flyTrackIndex(i), color);
    const door = trackIndex(i, LAST_OUTER);
    if (door != null) doors.set(door, color);
  });

  function tokens(key: string) {
    const list = occupied.get(key) ?? [];
    return list.map((item, i) => (
      <PlaneToken
        key={item.plane.id}
        color={item.player.color}
        heading={planeHeading(item.ci, item.plane.pos) + (item.plane.pos < 0 ? (item.plane.slot - 1.5) * 12 : 0)}
        legal={moveSet.has(item.plane.id)}
        label={`${item.player.color} plane ${item.plane.slot + 1}`}
        stack={{ i, n: list.length }}
        onMove={moveSet.has(item.plane.id) ? () => act({ type: "move", pieceId: item.plane.id }) : undefined}
      />
    ));
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">13 / FLY · 2–4</p>
          <h1>Flying Chess</h1>
        </div>
        <div className="row-actions">
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
        <div className="table table-ludo">
          {!state || waiting ? (
            <div className="coda-deal">
              <p className="kicker">{waiting ? "TABLE" : "FLYING CHESS"}</p>
              <h2>{waiting ? `Table ${state?.players.length ?? 0}` : "Race four planes home"}</h2>
              <p>
                {waiting
                  ? "Open a table, add CPUs or invite, then start with 2–4. Blue, red, yellow, and green sit in that order."
                  : "Practice as blue against a red CPU, or open a table. Roll 6 to take off. Exact count to finish."}
              </p>
              {waiting && state ? (
                <ul className="lobby-roster">
                  {state.players.map((p, i) => (
                    <li key={p.id}>
                      <b>{p.name}</b>
                      <span>
                        {p.color} · {seatTag(p, i, state.players[0]?.id)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <MixedCpuBar game="ludo" onPractice={() => setLocal(startLudoPractice())} />
              <div className="row-actions" style={{ justifyContent: "center" }}>
                {waiting ? (
                  host && (state?.players.length ?? 0) >= 2 ? (
                    <button className="btn" type="button" onClick={() => act({ type: "start" })}>
                      Start {state?.players.length}P
                    </button>
                  ) : (
                    <p>{host ? "Need at least 2 players to start." : "Waiting for the host to start."}</p>
                  )
                ) : null}
              </div>
            </div>
          ) : (
            <div className="fly-wrap">
              <p className="status-line">
                {state.phase === "over"
                  ? forfeitText(state) || `${winner?.name ?? "Someone"} wins`
                  : `${cur?.name ?? ""} · ${state.phase === "roll" ? "roll the die" : "choose a plane"}${
                      state.sixes ? ` · six ${state.sixes}/3` : ""
                    }${me ? ` · you are ${me.color}` : ""}`}
              </p>
              <div className="fly-board">
                <div className="fly-sheet">
                  <div className="fly-grid">
                    <svg className="fly-jumps" viewBox="0 0 15 15" aria-hidden>
                      {JUMPS.map((j) => (
                        <g key={j.id}>
                          <line
                            x1={j.x1}
                            y1={j.y1}
                            x2={j.x2}
                            y2={j.y2}
                            stroke={j.stroke}
                            strokeWidth="0.11"
                            strokeDasharray="0.22 0.14"
                            strokeLinecap="round"
                          />
                          <g transform={`translate(${(j.x1 + j.x2) / 2} ${(j.y1 + j.y2) / 2}) rotate(${j.rot}) scale(0.012) translate(-32 -32)`}>
                            <path
                              fill={j.stroke}
                              stroke="#1c1915"
                              strokeWidth="2.2"
                              d="M62 32 46 25.5 40 25.5 33 7 26 14 31 27.5 13 29.5 7 16 3.5 32 7 48 13 34.5 31 36.5 26 50 33 57 40 38.5 46 38.5Z"
                            />
                          </g>
                        </g>
                      ))}
                    </svg>
                    {COLORS.map((color) => {
                      const place = BASE_PLACE[color];
                      const owner = state.players.find((p) => p.color === color);
                      const parked = [0, 1, 2, 3].map((slot) => owner?.planes.find((p) => p.slot === slot && p.pos < 0) ?? null);
                      const ci = COLORS.indexOf(color);
                      return (
                        <div key={color} className={`fly-base ${color}`} style={{ gridRow: place.gridRow, gridColumn: place.gridColumn }}>
                          {parked.map((plane, slot) => (
                            <div key={slot} className="fly-pad">
                              {plane && owner ? (
                                <PlaneToken
                                  color={color}
                                  heading={planeHeading(ci, -1) + (slot - 1.5) * 14}
                                  legal={moveSet.has(plane.id)}
                                  label={`${color} plane ${slot + 1} in the hangar`}
                                  stack={{ i: 0, n: 1 }}
                                  onMove={moveSet.has(plane.id) ? () => act({ type: "move", pieceId: plane.id }) : undefined}
                                />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {TRACK.map((cell, index) => {
                      const [r, c] = cell;
                      const start = starts.get(index);
                      const fly = flies.get(index);
                      const door = doors.get(index);
                      const color = start ?? trackColor(index);
                      const arrow = start ? trackDir(index) : fly ? flyDir(COLORS.indexOf(fly)) : door ? homeDir(COLORS.indexOf(door)) : null;
                      return (
                        <div key={`t${index}`} className={`fly-cell track${start ? " is-start" : ""}${fly ? " is-fly" : ""}${door ? " is-door" : ""}`} style={{ gridRow: r + 1, gridColumn: c + 1 }}>
                          <span className={`sq c-${color}`} />
                          {arrow ? <Arrow dir={arrow} /> : null}
                          {tokens(`${r},${c}`)}
                        </div>
                      );
                    })}
                    {HOME.map((lane, ci) =>
                      lane.map((cell, step) => {
                        const color = COLORS[ci] ?? "blue";
                        const finish = step === lane.length - 1;
                        const into = homeDir(ci);
                        return (
                          <div
                            key={`h${ci}-${step}`}
                            className={`fly-cell home${finish ? ` finish dir-${outward(into)}` : ""}`}
                            style={{ gridRow: cell[0] + 1, gridColumn: cell[1] + 1 }}
                          >
                            <span className={`sq c-${color}`} />
                            {finish ? <Arrow dir={into} /> : null}
                            {tokens(`${cell[0]},${cell[1]}`)}
                          </div>
                        );
                      }),
                    )}
                    {SPLITS.map((split) => (
                      <div key={`c${split.r}${split.c}`} className="fly-cell corner" style={{ gridRow: split.r + 1, gridColumn: split.c + 1 }}>
                        <span className="sq split" style={{ background: `linear-gradient(to bottom right, var(--fly-${split.a}) 50%, var(--fly-${split.b}) 50%)` }} />
                      </div>
                    ))}
                    <div className="fly-cell hub" style={{ gridRow: 8, gridColumn: 8 }}>
                      <span className="sq pinwheel" />
                    </div>
                  </div>
                </div>
              </div>
              <ul className="fly-legend">
                {state.players.map((p) => (
                  <li key={p.id} className={cur?.id === p.id && state.phase !== "over" ? "on" : ""}>
                    <i className={`c-${p.color}`} />
                    <b>{p.name}</b>
                    <span>
                      {homeCount(p)}/4 home
                    </span>
                  </li>
                ))}
              </ul>
              <div className="fly-controls">
                <DieFace n={state.dice} />
                <button className="btn btn-go" type="button" disabled={!myTurn || state.phase !== "roll"} onClick={() => act({ type: "roll" })}>
                  ROLL
                </button>
                {myTurn && state.phase === "move"
                  ? me?.planes
                      .filter((p) => moveSet.has(p.id))
                      .map((p) => (
                        <button key={p.id} className="btn" type="button" onClick={() => act({ type: "move", pieceId: p.id })}>
                          {p.pos < 0 ? `TAKE OFF ${p.slot + 1}` : p.pos === FINISH ? `HOME ${p.slot + 1}` : `PLANE ${p.slot + 1}`}
                        </button>
                      ))
                  : null}
              </div>
            </div>
          )}
        </div>
        <div className="side-stack">
          <InvitePanel game="ludo" />
          <aside className="side">
            <GameRules game="ludo" />
            {state && state.phase !== "lobby" ? (
              <div>
                <h3>LOG</h3>
                <div className="log">
                  {[...state.log].reverse().slice(0, 14).map((l) => (
                    <div key={l.id}>{l.text}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
