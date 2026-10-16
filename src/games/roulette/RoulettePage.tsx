import { useEffect, useState } from "react";
import {
  CHAMBERS,
  aiRoulette,
  applyRouletteAction,
  oddsHint,
  startRoulettePractice,
  type RAction,
  type RState,
} from "./engine";
import { LobbyDecor } from "../../components/LobbyDecor";
import { InvitePanel } from "../../components/InvitePanel";
import { GameRules } from "../../components/GameRules";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

export function RoulettePage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "roulette" ? lobby.room : null;
  const [local, setLocal] = useState<RState | null>(null);
  const state = (room?.view as RState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const waiting = Boolean(state?.phase === "lobby");
  const host = Boolean(user && room?.seats?.[0] === user.id);
  const myTurn = Boolean(state && me && state.phase === "play" && state.players[state.turn]?.id === me.id);

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local || local.phase !== "play") return;
    const actor = local.players[local.turn];
    if (!actor || actor.human) return;
    let stop = false;
    void (async () => {
      await wait(CPU_THINK_MS + 400);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase !== "play") return s;
        const cur = s.players[s.turn];
        if (!cur || cur.human) return s;
        return applyRouletteAction(s, cur.id, aiRoulette(s));
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: RAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s ? applyRouletteAction(s, "you", action) : s));
  }

  const bang = state?.last === "bang";
  const click = state?.last === "click";

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">11 / ROULETTE · Duel</p>
          <h1>Russian Roulette</h1>
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
        <div className="table table-roulette">
          {!state || !me || waiting ? (
            <>
              <LobbyDecor game="roulette" />
              <div className="coda-deal">
                <p className="kicker">{waiting ? "TABLE" : "ROULETTE"}</p>
                <h2>{waiting ? `Table ${state?.players.length ?? 0}/2` : "Six chambers · one live"}</h2>
                <p>
                  {waiting
                    ? "Add a CPU or invite one friend, then start. Spin optional — pull to fire."
                    : "Practice vs CPU, or open a table. Take turns. Click passes the turn; bang ends the match."}
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
                <MixedCpuBar game="roulette" onPractice={() => setLocal(startRoulettePractice())} />
                <div className="row-actions" style={{ justifyContent: "center" }}>
                  {waiting ? (
                    host && (state?.players.length ?? 0) >= 2 ? (
                      <button className="btn" type="button" onClick={() => act({ type: "start" })}>
                        Start
                      </button>
                    ) : (
                      <p>{host ? "Need 2 players to start." : "Waiting for the host to start."}</p>
                    )
                  ) : null}
                </div>
              </div>
            </>
          ) : !rival ? null : (
            <>
              <div className="seat">
                <div className="seat-label">
                  {rival.name}
                  {state.players[state.turn]?.id === rival.id && state.phase === "play" ? " · TURN" : ""}
                  {state.loserId === rival.id ? " · OUT" : ""}
                  {state.winnerId === rival.id ? " · WINS" : ""}
                </div>
              </div>

              <div className="center-well roulette-well">
                <div
                  className={`roulette-cylinder${bang ? " bang" : ""}${click ? " click" : ""}`}
                  aria-hidden
                >
                  {Array.from({ length: CHAMBERS }, (_, i) => (
                    <span
                      key={i}
                      className={`roulette-chamber${i === state.hammer ? " hammer" : ""}`}
                      style={{ ["--i" as string]: i }}
                    />
                  ))}
                  <span className="roulette-hub" />
                </div>
                <p className="status-line">
                  {state.phase === "over"
                    ? state.winnerId === me.id
                      ? "You win."
                      : "You lose."
                    : bang
                      ? "BANG."
                      : click
                        ? "Click. Empty."
                        : myTurn
                          ? "Your turn. Spin or pull."
                          : `${rival.name}’s turn.`}
                </p>
                <p className="kicker">{oddsHint(state)}</p>
                <div className="row-actions" style={{ justifyContent: "center" }}>
                  <button className="btn btn-ghost" type="button" disabled={!myTurn} onClick={() => act({ type: "spin" })}>
                    SPIN
                  </button>
                  <button className="btn btn-go" type="button" disabled={!myTurn} onClick={() => act({ type: "pull" })}>
                    PULL
                  </button>
                </div>
              </div>

              <div className="seat">
                <div className="seat-label">
                  {me.name}
                  {myTurn ? " · TURN" : ""}
                  {state.loserId === me.id ? " · OUT" : ""}
                  {state.winnerId === me.id ? " · WINS" : ""}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="side-stack">
          <InvitePanel game="roulette" />
          <aside className="side">
            <GameRules game="roulette" />
            {state?.log?.length ? (
              <div className="wolf-log">
                <h3>LOG</h3>
                <ul>
                  {[...state.log].slice(-10).reverse().map((e) => (
                    <li key={e.id}>{e.text}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
