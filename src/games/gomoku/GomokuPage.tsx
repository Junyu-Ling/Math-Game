import { useEffect, useState } from "react";
import {
  SIZE,
  aiGomoku,
  applyGomokuAction,
  startGomokuPractice,
  type GAction,
  type GState,
} from "./engine";
import { GameSetup } from "../../components/GameSetup";
import { InvitePanel } from "../../components/InvitePanel";
import { GameRules } from "../../components/GameRules";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

export function GomokuPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "gomoku" ? lobby.room : null;
  const [local, setLocal] = useState<GState | null>(null);
  const state = (room?.view as GState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const myTurn = Boolean(state && me && state.players[state.turn]?.id === me.id && state.phase === "play");

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over") return;
    const actor = local.players[local.turn];
    if (!actor || actor.human) return;
    let stop = false;
    void (async () => {
      await wait(CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase === "over") return s;
        const bot = s.players[s.turn];
        if (!bot || bot.human) return s;
        return applyGomokuAction(s, bot.id, aiGomoku(s));
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: GAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s && me ? applyGomokuAction(s, me.id, action) : s));
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">09 / GOMOKU · Duel</p>
          <h1>Gomoku</h1>
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
        <div className="table table-gomoku">
          {!state || !me ? (
            <GameSetup
              kicker="GOMOKU"
              title="Five in a row"
              blurb="15×15. Black opens. First continuous five wins."
              game="gomoku"
              onPractice={() => setLocal(startGomokuPractice())}
            />
          ) : (
            <div className="kaiji-board-wrap">
              <p className="status-line">
                {state.phase === "over"
                  ? state.winnerId
                    ? `${state.players.find((p) => p.id === state.winnerId)?.name} wins`
                    : "Draw"
                  : `${state.players[state.turn]?.name}'s turn · you are ${me.stone === 1 ? "black" : "white"}`}
              </p>
              <div className="gomoku-board" role="grid" aria-label="15 by 15 goban">
                {Array.from({ length: SIZE }, (_, r) =>
                  Array.from({ length: SIZE }, (_, c) => {
                    const v = state.board[r]![c]!;
                    // 15×15 hoshi: corners + tengen (1-based 4/8/12 → 0-based 3/7/11)
                    const hoshi =
                      (r === 3 && (c === 3 || c === 11)) ||
                      (r === 11 && (c === 3 || c === 11)) ||
                      (r === 7 && c === 7);
                    const last = state.last?.r === r && state.last?.c === c;
                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        className={`gomoku-cell${hoshi ? " star" : ""}${v ? " filled" : ""}${last ? " last" : ""}`}
                        disabled={!myTurn || Boolean(v) || state.phase !== "play"}
                        onClick={() => act({ type: "place", r, c })}
                      >
                        {hoshi && !v ? <span className="gomoku-hoshi" /> : null}
                        {v ? <span className={`gomoku-stone ${v === 1 ? "black" : "white"}`} /> : null}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
          )}
        </div>
        <div className="side-stack">
          <InvitePanel game="gomoku" />
          <aside className="side">
            <GameRules game="gomoku" />
            {state ? (
              <div>
                <h3>LOG</h3>
                <div className="log">
                  {[...state.log].reverse().slice(0, 12).map((l) => (
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
