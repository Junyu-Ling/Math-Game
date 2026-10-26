import { useEffect, useState } from "react";
import {
  COLS,
  LABEL,
  ROWS,
  aiAnimal,
  applyAnimalAction,
  cellKind,
  movesFrom,
  startAnimalPractice,
  type AAction,
  type AState,
} from "./engine";
import { GameSetup } from "../../components/GameSetup";
import { SeatTalk } from "../../components/TableTalk";
import { ClickPop, RulesButton } from "../../components/GameRules";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { forfeitText } from "../../lib/forfeit";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

export function AnimalPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "animal" ? lobby.room : null;
  const [local, setLocal] = useState<AState | null>(null);
  const held = (!room && lobby.settlement?.game === "animal" ? lobby.settlement.view : null) as AState | null;
  const state = (room?.view as AState | undefined) ?? held ?? local;
  const practice = Boolean(local && !room && !held);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const myTurn = Boolean(state && me && state.players[state.turn]?.id === me.id && state.phase === "play");
  const legal = state?.selected ? movesFrom(state, state.selected.r, state.selected.c) : [];

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
        return applyAnimalAction(s, bot.id, aiAnimal(s));
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: AAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s && me ? applyAnimalAction(s, me.id, action) : s));
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
          <p className="kicker">11 / ANIMAL · Duel</p>
          <h1>Animal Chess</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="animal" />
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
        <div className="table table-animal">
          {!state || !me ? (
            <GameSetup
              kicker="DOU SHOU QI"
              title="Jungle beasts"
              blurb="Rat beats elephant. Lions and tigers jump rivers. Enter the rival den to win."
              game="animal"
              onPractice={() => setLocal(startAnimalPractice())}
            />
          ) : (
            <div className="kaiji-board-wrap">
              <div className="board-talk">
                {state.players.map((p) => (
                  <SeatTalk key={p.id} playerId={p.id} name={p.name} />
                ))}
              </div>
              <p className="status-line">
                {state.phase === "over"
                  ? forfeitText(state) || `${state.players.find((p) => p.id === state.winnerId)?.name} wins`
                  : `${state.players[state.turn]?.name}'s turn`}
              </p>
              <div className="animal-board">
                {Array.from({ length: ROWS }, (_, r) =>
                  Array.from({ length: COLS }, (_, c) => {
                    const kind = cellKind(r, c);
                    const p = state.board[r]![c];
                    const sel = state.selected?.r === r && state.selected?.c === c;
                    const can = legal.some((m) => m.r === r && m.c === c);
                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        className={`piece-cell ${kind}${sel ? " sel" : ""}${can ? " can" : ""}`}
                        disabled={!myTurn}
                        onClick={() => click(r, c)}
                      >
                        {p ? <span className={p.side === 0 ? "side-a" : "side-b"}>{LABEL[p.kind]}</span> : kind === "river" ? "水" : kind === "den" ? "穴" : kind === "trap" ? "阱" : ""}
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
