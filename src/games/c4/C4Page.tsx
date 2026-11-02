import { useEffect, useState } from "react";
import { aiC4, applyC4Action, dropZ, SIZE, startC4Practice, type C4Action, type C4State } from "./engine";
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
          <h1>3D Connect Four</h1>
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
              <p className="kicker">{waiting ? "TABLE" : "3D CONNECT FOUR"}</p>
              <h2>{waiting ? `Table ${state?.players.length ?? 0}/2` : "Four through the cube"}</h2>
              <p>
                {waiting
                  ? "Add a CPU or invite one friend, then everyone Ready. Drop into a column — gravity fills from the floor up."
                  : "4×4×4. Tap a column to drop. Four in any straight line through the cube wins."}
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
                      ? `${state.players.find((p) => p.id === state.winnerId)?.name} connects four through the cube.`
                      : "Draw — the cube filled.")
                  : myTurn
                    ? `Your turn. Tap a column — the bead drops to the lowest empty floor.`
                    : `Wait — ${state.players[state.turn]?.name} drops.`}
              </p>
              <div className="c4-layers">
                {Array.from({ length: SIZE }, (_, zi) => {
                  const z = SIZE - 1 - zi;
                  return (
                    <div key={z} className="c4-layer">
                      <span className="c4-floor">Floor {z + 1}</span>
                      <div className="c4-grid" role="grid" aria-label={`Floor ${z + 1}`}>
                        {Array.from({ length: SIZE }, (_, y) =>
                          Array.from({ length: SIZE }, (_, x) => {
                            const v = state.board[x]![y]![z]!;
                            const top = dropZ(state.board, x, y);
                            const canDrop = myTurn && state.phase === "play" && top >= 0;
                            const onWin = Boolean(state.winLine?.some((p) => p.x === x && p.y === y && p.z === z));
                            const last =
                              state.last?.x === x && state.last?.y === y && state.last?.z === z;
                            return (
                              <button
                                key={`${x}-${y}-${z}`}
                                type="button"
                                className={`c4-cell${v ? " filled" : ""}${onWin ? " win" : ""}${last ? " last" : ""}${top === z ? " land" : ""}`}
                                disabled={!canDrop}
                                onClick={() => {
                                  if (!canDrop) return;
                                  act({ type: "drop", x, y });
                                }}
                              >
                                {v ? <span className={`c4-bead ${v === 1 ? "a" : "b"}`} /> : null}
                              </button>
                            );
                          }),
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
