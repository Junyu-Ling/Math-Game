import { useEffect, useState } from "react";
import { applyM24Action, startM24Practice, type M24DuelState } from "./engine";
import { PokerFace } from "../../components/PlayingCard";
import { LobbyDecor } from "../../components/LobbyDecor";
import { InvitePanel } from "../../components/InvitePanel";
import { GameRules } from "../../components/GameRules";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";

const OPS = ["+", "-", "\u00d7", "\u00f7", "(", ")"];

export function Math24Page() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "m24" ? lobby.room : null;
  const [local, setLocal] = useState<M24DuelState | null>(null);
  const state = (room?.view as M24DuelState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const [used, setUsed] = useState<boolean[]>([false, false, false, false]);
  const [expr, setExpr] = useState("");
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const waiting = Boolean(state?.phase === "lobby");
  const host = Boolean(user && room?.seats?.[0] === user.id);
  const myScore = youId && state ? state.scores[youId] || 0 : 0;
  const playing = Boolean(state && me && !waiting);

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    setUsed([false, false, false, false]);
    setExpr("");
  }, [state?.round]);

  useEffect(() => {
    if (!practice || !local || local.phase !== "play") return;
    const t = window.setTimeout(() => {
      setLocal((s) =>
        s && s.phase === "play" && s.solution ? applyM24Action(s, "cpu", { type: "submit", expr: s.solution }) : s,
      );
    }, 8000);
    return () => window.clearTimeout(t);
  }, [practice, local?.round, local?.phase, local?.solution]);

  function tapNum(i: number) {
    if (!state || used[i] || state.phase !== "play") return;
    const n = state.nums[i];
    if (n === undefined) return;
    setExpr((e) => e + String(n));
    setUsed((u) => u.map((v, k) => (k === i ? true : v)));
  }

  async function submit() {
    if (room) {
      await lobby.sendAction({ type: "submit", expr });
    } else {
      setLocal((s) => (s ? applyM24Action(s, "you", { type: "submit", expr }) : s));
    }
    setExpr("");
    setUsed([false, false, false, false]);
  }

  function actStart() {
    if (room) void lobby.sendAction({ type: "start" });
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">
            04 / M24 · Duel ·{" "}
            {playing && state ? `${myScore} : ${rival && youId ? state.scores[rival.id] || 0 : 0}` : "0 : 0"}
          </p>
          <h1>Make 24</h1>
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
        <div className="table table-m24">
          {!playing || !state || !me ? (
            <>
              <LobbyDecor game="m24" />
              <div className="coda-deal">
                <p className="kicker">{waiting ? "TABLE" : "MATH 24"}</p>
                <h2>{waiting ? `Table ${state?.players.length ?? 0}/2` : "First to make 24"}</h2>
                <p>
                  {waiting
                    ? "Add a CPU or invite one friend, then start. First to 3 points wins."
                    : "Practice vs CPU (CPU submits in ~8s), or open a table. Same four cards — first to 3 wins."}
                </p>
                {waiting && state ? (
                  <ul className="lobby-roster">
                    {state.players.map((p, i) => (
                      <li key={p.id}>
                        <b>{p.name}</b>
                        <span>{seatTag(p, i, state.players[0]?.id)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <MixedCpuBar game="m24" onPractice={() => setLocal(startM24Practice())} />
                <div className="row-actions" style={{ justifyContent: "center" }}>
                  {waiting ? (
                    host && (state?.players.length ?? 0) >= 2 ? (
                      <button className="btn" type="button" onClick={() => actStart()}>
                        Start
                      </button>
                    ) : (
                      <p>{host ? "Need 2 players to start." : "Waiting for the host to start."}</p>
                    )
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="m24-board">
                {(state.cards?.length
                  ? state.cards
                  : state.nums.map((n, i) => ({ id: `n${i}`, suit: "S" as const, rank: (n === 1 ? "A" : String(n)) as "A" }))
                ).map((card, i) => (
                  <div key={`${card.id}-${state.round}`} className={used[i] ? "dim-card" : undefined}>
                    <PokerFace card={card} onClick={state.phase === "over" ? undefined : () => tapNum(i)} />
                  </div>
                ))}
              </div>
              <div className="expr">{expr || "-"}</div>
              <div className="ops">
                {OPS.map((op) => (
                  <button key={op} type="button" onClick={() => setExpr((e) => e + op)}>
                    {op}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setExpr("");
                    setUsed([false, false, false, false]);
                  }}
                >
                  CLR
                </button>
                <button type="button" onClick={() => setExpr((e) => e.slice(0, -1))}>
                  DEL
                </button>
              </div>
              <div className="row-actions" style={{ justifyContent: "center", marginTop: 24 }}>
                <button className="btn" type="button" disabled={state.phase === "over"} onClick={() => void submit()}>
                  SUBMIT
                </button>
              </div>
              <p className="msg" style={{ textAlign: "center" }}>
                {state.message}
              </p>
            </>
          )}
        </div>
        <div className="side-stack">
          <InvitePanel game="m24" />
          <aside className="side">
            <GameRules game="m24" />
          </aside>
        </div>
      </div>
    </div>
  );
}
