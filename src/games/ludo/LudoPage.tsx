import { useEffect, useState } from "react";
import {
  aiLudo,
  applyLudoAction,
  legalMoves,
  pieceCell,
  startLudoPractice,
  type LAction,
  type LState,
} from "./engine";
import { GameSetup } from "../../components/GameSetup";
import { InvitePanel } from "../../components/InvitePanel";
import { GameRules } from "../../components/GameRules";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

export function LudoPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "ludo" ? lobby.room : null;
  const [local, setLocal] = useState<LState | null>(null);
  const state = (room?.view as LState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const myIdx = state?.players.findIndex((p) => p.id === youId) ?? -1;
  const myTurn = Boolean(state && me && state.players[state.turn]?.id === me.id && state.phase !== "over");

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

  const grid: Array<Array<{ pieces: Array<{ side: "a" | "b"; id: string }> }>> = Array.from({ length: 11 }, () =>
    Array.from({ length: 11 }, () => ({ pieces: [] })),
  );
  if (state) {
    state.players.forEach((pl, pi) => {
      pl.pieces.forEach((p) => {
        const pos = pieceCell(pi, p);
        if (!pos || p.home) return;
        const cell = grid[pos.r]?.[pos.c];
        if (cell) cell.pieces.push({ side: pi === 0 ? "a" : "b", id: p.id });
      });
    });
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">10 / LUDO · Duel</p>
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
          {!state || !me ? (
            <GameSetup
              kicker="FLYING CHESS"
              title="Race four home"
              blurb="Roll 6 to leave base. Exact finish. First with all four home wins."
              game="ludo"
              onPractice={() => setLocal(startLudoPractice())}
            />
          ) : (
            <div className="kaiji-board-wrap">
              <p className="status-line">
                {state.phase === "over"
                  ? `${state.players.find((p) => p.id === state.winnerId)?.name} wins`
                  : `${state.players[state.turn]?.name} · ${state.phase === "roll" ? "roll" : "move"} · home ${me.finished}/4`}
              </p>
              <div className="dice-pill" aria-label="dice">
                {state.dice ?? "·"}
              </div>
              <div className="ludo-track">
                {grid.map((row, r) =>
                  row.map((cell, c) => {
                    const edge = r === 0 || r === 10 || c === 0 || c === 10;
                    const baseA = r < 2 && c < 2;
                    const baseB = r < 2 && c > 8;
                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`ludo-cell${edge ? " path" : ""}${baseA ? " base-a" : ""}${baseB ? " base-b" : ""}`}
                      >
                        {cell.pieces.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={`ludo-piece ${p.side}`}
                            disabled={!moves.includes(p.id)}
                            onClick={() => act({ type: "move", pieceId: p.id })}
                            title={p.id}
                          />
                        ))}
                      </div>
                    );
                  }),
                )}
              </div>
              <div className="row-actions" style={{ justifyContent: "center" }}>
                <button
                  className="btn btn-go"
                  type="button"
                  disabled={!myTurn || state.phase !== "roll"}
                  onClick={() => act({ type: "roll" })}
                >
                  ROLL
                </button>
                {myTurn && state.phase === "move" && myIdx >= 0
                  ? me.pieces
                      .filter((p) => moves.includes(p.id))
                      .map((p, i) => (
                        <button key={p.id} className="btn" type="button" onClick={() => act({ type: "move", pieceId: p.id })}>
                          PIECE {i + 1}
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
