import { useEffect, useState } from "react";
import {
  RANK_LABEL,
  aiArmy,
  applyArmyAction,
  armyMoves,
  startArmyPractice,
  type ArmyAction,
  type ArmyState,
} from "./engine";
import { GameSetup } from "../../components/GameSetup";
import { SeatTalk } from "../../components/TableTalk";
import { ClickPop, RulesButton } from "../../components/GameRules";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { forfeitText } from "../../lib/forfeit";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

const ROWS = 6;
const COLS = 5;

export function ArmyPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "army" ? lobby.room : null;
  const [local, setLocal] = useState<ArmyState | null>(null);
  const held = (!room && lobby.settlement?.game === "army" ? lobby.settlement.view : null) as ArmyState | null;
  const state = (room?.view as ArmyState | undefined) ?? held ?? local;
  const practice = Boolean(local && !room && !held);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const myTurn = Boolean(state && me && state.players[state.turn]?.id === me.id && state.phase === "play");
  const legal = state?.selected ? armyMoves(state, state.selected.r, state.selected.c) : [];

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
        return applyArmyAction(s, bot.id, aiArmy(s));
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: ArmyAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s && me ? applyArmyAction(s, me.id, action) : s));
  }

  function click(r: number, c: number) {
    if (!state || !myTurn) return;
    if (state.selected && legal.some((m) => m.r === r && m.c === c)) {
      act({ type: "move", r, c });
      return;
    }
    const p = state.board[r]![c];
    if (p && me && p.side === me.side) act({ type: "select", r, c });
    else act({ type: "clear" });
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">12 / ARMY · Duel</p>
          <h1>Army Chess</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="army" />
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
        <div className="table table-army">
          {!state || !me ? (
            <GameSetup
              kicker="JUN QI"
              title="Capture the flag"
              blurb="Open ranks. Bomb trades with anything. Engineer alone clears mines. Take 军旗 to win."
              game="army"
              onPractice={() => setLocal(startArmyPractice())}
            />
          ) : (
            <div className="kaiji-board-wrap">
              <div className="board-talk">
                {state.players.map((p) => (
                  <SeatTalk key={p.id} playerId={p.id} name={p.name}>
                    {p.name}
                  </SeatTalk>
                ))}
              </div>
              <p className="status-line">
                {state.phase === "over"
                  ? forfeitText(state) || `${state.players.find((p) => p.id === state.winnerId)?.name} wins`
                  : `${state.players[state.turn]?.name}'s turn`}
              </p>
              <div className="army-board">
                {Array.from({ length: ROWS }, (_, r) =>
                  Array.from({ length: COLS }, (_, c) => {
                    const p = state.board[r]![c];
                    const sel = state.selected?.r === r && state.selected?.c === c;
                    const can = legal.some((m) => m.r === r && m.c === c);
                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        className={`piece-cell${sel ? " sel" : ""}${can ? " can" : ""}`}
                        disabled={!myTurn}
                        onClick={() => click(r, c)}
                      >
                        {p ? (
                          <span className={p.side === 0 ? "side-a" : "side-b"}>{RANK_LABEL[p.rank]}</span>
                        ) : (
                          ""
                        )}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
