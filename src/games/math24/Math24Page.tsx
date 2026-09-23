import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { applyM24Action, startM24Practice, type M24DuelState } from "./engine";
import { PokerFace } from "../../components/PlayingCard";
import { GameSetup } from "../../components/GameSetup";
import { LobbyDecor } from "../../components/LobbyDecor";
import { InvitePanel } from "../../components/InvitePanel";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";

const OPS = ["+", "-", "×", "÷", "(", ")"];

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
  const myScore = youId && state ? state.scores[youId] || 0 : 0;
  const rival = state?.players.find((p) => p.id !== youId);

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
      setLocal((s) => (s && s.phase === "play" && s.solution ? applyM24Action(s, "cpu", { type: "submit", expr: s.solution }) : s));
    }, 8000);
    return () => window.clearTimeout(t);
  }, [practice, local?.round, local?.phase, local?.solution]);

  function tapNum(i: number) {
    if (!state || used[i] || state.phase === "over") return;
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

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">
            04 / M24 · Duel · {state ? `${myScore} : ${rival && youId ? state.scores[rival.id] || 0 : 0}` : "0 : 0"}
          </p>
          <h1>Make 24</h1>
        </div>
        <div className="row-actions">
          {practice ? (
            <button className="btn btn-ghost" type="button" onClick={() => setLocal(null)}>
              RESET
            </button>
          ) : null}
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-m24">
          {!state ? (
            <>
            <LobbyDecor game="m24" />
            <GameSetup
              kicker="MATH 24"
              title="First to make 24"
              blurb="Same four cards. First to 3 points wins. In practice, the CPU submits in about 8 seconds."
              game="m24"
              onPractice={() => setLocal(startM24Practice())}
            />
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
              <div className="expr">{expr || "—"}</div>
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
        <InvitePanel game="m24" />
      </div>
    </div>
  );
}
