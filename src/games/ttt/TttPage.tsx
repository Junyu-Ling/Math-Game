import { useEffect, useState } from "react";
import { aiTtt, applyTttAction, SIZE, startTttPractice, type TttAction, type TttState } from "./engine";
import { ClickPop, RulesButton } from "../../components/GameRules";
import { MixedCpuBar, seatTag, TableReadyControls } from "../../components/MixedCpuBar";
import { SeatTalk } from "../../components/TableTalk";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { forfeitText } from "../../lib/forfeit";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

export function TttPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "ttt" ? lobby.room : null;
  const [local, setLocal] = useState<TttState | null>(null);
  const held = (!room && lobby.settlement?.game === "ttt" ? lobby.settlement.view : null) as TttState | null;
  const state = (room?.view as TttState | undefined) ?? held ?? local;
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
        return cur && !cur.human ? applyTttAction(s, cur.id, aiTtt(s)) : s;
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: TttAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s ? applyTttAction(s, "you", action) : s));
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">06 / TTT · Duel</p>
          <h1>Tic-tac-toe</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="ttt" />
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
        <div className="table table-ttt">
          {!state || !me || waiting ? (
            <div className="coda-deal">
              <p className="kicker">{waiting ? "TABLE" : "TIC-TAC-TOE"}</p>
              <h2>{waiting ? `Table ${state?.players.length ?? 0}/2` : "Three in a row"}</h2>
              <p>
                {waiting
                  ? "Add a CPU or invite one friend, then everyone Ready. First player places X."
                  : "3×3. Practice vs CPU, or open a table. Three in a row wins."}
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
              <MixedCpuBar game="ttt" onPractice={() => setLocal(startTttPractice())} />
              <div className="row-actions" style={{ justifyContent: "center" }}>
                <TableReadyControls
                  waiting={waiting}
                  game="ttt"
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
                      ? `${state.players.find((p) => p.id === state.winnerId)?.name} gets three in a row.`
                      : "Draw — the board filled.")
                  : myTurn
                    ? `Your turn (${me.mark === 1 ? "X" : "O"}). Place on an empty cell.`
                    : `Wait — ${state.players[state.turn]?.name} places a mark.`}
              </p>
              <div className="ttt-board" role="grid" aria-label="3 by 3 tic-tac-toe">
                {Array.from({ length: SIZE * SIZE }, (_, i) => {
                  const v = state.board[i] ?? 0;
                  const onWin = Boolean(state.winLine?.includes(i));
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`ttt-cell${v ? " filled" : ""}${onWin ? " win" : ""}${state.last === i ? " last" : ""}`}
                      disabled={Boolean(v) || state.phase !== "play"}
                      onClick={() => {
                        if (!myTurn) return;
                        act({ type: "place", i });
                      }}
                    >
                      {v === 1 ? "X" : v === 2 ? "O" : ""}
                    </button>
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
