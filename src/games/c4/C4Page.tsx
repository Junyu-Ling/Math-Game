import { useEffect, useState, type CSSProperties } from "react";
import { aiC4, applyC4Action, COLS, dropRow, ROWS, startC4Practice, type C4Action, type C4State } from "./engine";
import { ClickPop, RulesButton } from "../../components/GameRules";
import { MixedCpuBar, seatTag, TableReadyControls } from "../../components/MixedCpuBar";
import { SeatTalk } from "../../components/TableTalk";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { forfeitText } from "../../lib/forfeit";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

export function C4Page() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "c4" ? lobby.room : null;
  const [local, setLocal] = useState<C4State | null>(null);
  const held = (!room && lobby.settlement?.game === "c4" ? lobby.settlement.view : null) as C4State | null;
  const state = (room?.view as C4State | undefined) ?? held ?? local;
  const practice = Boolean(local && !room && !held);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const waiting = Boolean(state?.phase === "lobby");
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
        if (!s || s.phase !== "play") return s;
        const cur = s.players[s.turn];
        return cur && !cur.human ? applyC4Action(s, cur.id, aiC4(s)) : s;
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: C4Action) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s ? applyC4Action(s, "you", action) : s));
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">12 / C4 · Duel</p>
          <h1>Connect Four</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="c4" />
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
        <div className="table table-c4">
          {!state || !me || waiting ? (
            <div className="coda-deal">
              <p className="kicker">{waiting ? "TABLE" : "CONNECT FOUR"}</p>
              <h2>{waiting ? `Table ${state?.players.length ?? 0}/2` : "Drop four in a row"}</h2>
              <p>
                {waiting
                  ? "Add a CPU or invite one friend, then everyone Ready. Drop a disc into a column — it falls to the lowest empty slot."
                  : "7×6 standing grid. Tap a column to drop. Four in a row — across, down, or diagonal — wins."}
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
              <MixedCpuBar game="c4" onPractice={() => setLocal(startC4Practice())} />
              <div className="row-actions" style={{ justifyContent: "center" }}>
                <TableReadyControls
                  waiting={waiting}
                  game="c4"
                  players={state?.players ?? []}
                  youId={youId}
                  readyIds={(state as { readyIds?: string[] } | null)?.readyIds}
                  matched={(state as { matched?: boolean } | null)?.matched}
                  onReady={() => act({ type: "ready" })}
                />
              </div>
            </div>
          ) : (
            <div className="kaiji-board-wrap">
              <div className="board-talk">
                {rival ? <SeatTalk playerId={rival.id} name={rival.name} /> : null}
                <SeatTalk playerId={me.id} name={me.name} />
              </div>
              <p className="status-line">
                {state.phase === "over"
                  ? forfeitText(state) ||
                    (state.winnerId
                      ? `${state.players.find((p) => p.id === state.winnerId)?.name} connects four.`
                      : "Draw — the grid filled.")
                  : myTurn
                    ? "Your turn. Tap a column — the disc drops to the lowest empty slot."
                    : `Wait — ${state.players[state.turn]?.name} drops.`}
              </p>
              <div className="c4-stand">
                <div className="c4-frame" role="grid" aria-label="Connect Four 7 by 6">
                  {Array.from({ length: ROWS }, (_, ri) => {
                    const row = ROWS - 1 - ri;
                    return Array.from({ length: COLS }, (_, col) => {
                      const v = state.board[col]![row]!;
                      const land = dropRow(state.board, col);
                      const canDrop = myTurn && state.phase === "play" && land >= 0;
                      const onWin = Boolean(state.winLine?.some((p) => p.col === col && p.row === row));
                      const last = state.last?.col === col && state.last?.row === row;
                      return (
                        <button
                          key={`${col}-${row}`}
                          type="button"
                          className={`c4-cell${v ? " filled" : ""}${onWin ? " win" : ""}${last ? " last" : ""}`}
                          disabled={!canDrop}
                          aria-label={`Column ${col + 1}`}
                          onClick={() => {
                            if (!canDrop) return;
                            act({ type: "drop", col });
                          }}
                        >
                          {v ? (
                            <span
                              key={last ? `drop-${state.last?.col}-${state.last?.row}` : `${col}-${row}`}
                              className={`c4-bead ${v === 1 ? "a" : "b"}${last ? " drop" : ""}`}
                              style={
                                last
                                  ? ({ ["--drop-cells"]: String(ROWS - row) } as CSSProperties)
                                  : undefined
                              }
                            />
                          ) : null}
                        </button>
                      );
                    });
                  })}
                </div>
                <div className="c4-feet" aria-hidden="true">
                  <i />
                  <i />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
