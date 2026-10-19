import { useEffect, useState } from "react";
import {
  applyHoldemAction,
  holdemBotAct,
  startHoldemPractice,
  type HoldemAction,
  type HoldemState,
} from "./engine";
import { PokerFace } from "../../components/PlayingCard";
import { LobbyDecor } from "../../components/LobbyDecor";
import { InvitePanel } from "../../components/InvitePanel";
import { GameRules } from "../../components/GameRules";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

export function HoldemPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "holdem" ? lobby.room : null;
  const [local, setLocal] = useState<HoldemState | null>(null);
  const held = (!room && lobby.settlement?.game === "holdem" ? lobby.settlement.view : null) as HoldemState | null;
  const state = (room?.view as HoldemState | undefined) ?? held ?? local;
  const practice = Boolean(local && !room && !held);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const waiting = Boolean(state?.street === "lobby");
  const host = Boolean(user && room?.seats?.[0] === user.id);
  const myTurn = Boolean(
    state && me && state.players[state.turn]?.id === me.id && state.street !== "showdown" && state.street !== "over" && state.street !== "lobby",
  );
  const toCall = me && state ? Math.max(0, state.currentBet - me.bet) : 0;

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local || local.street === "over") return;
    const actor = local.players[local.turn];
    if (local.street === "showdown") return;
    if (!actor || actor.id === "you") return;
    let stop = false;
    void (async () => {
      await wait(CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.players[s.turn]?.id !== "cpu") return s;
        try {
          return applyHoldemAction(s, "cpu", holdemBotAct(s, "cpu"));
        } catch {
          try {
            return applyHoldemAction(s, "cpu", { type: "call" });
          } catch {
            try {
              return applyHoldemAction(s, "cpu", { type: "check" });
            } catch {
              return applyHoldemAction(s, "cpu", { type: "fold" });
            }
          }
        }
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: HoldemAction) {
    try {
      if (room) {
        void lobby.sendAction(action).catch((e) => alert(e instanceof Error ? e.message : e));
        return;
      }
      setLocal((s) => (s ? applyHoldemAction(s, "you", action) : s));
    } catch (e) {
      alert(e instanceof Error ? e.message : e);
    }
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">05 / HOLD · Duel</p>
          <h1>Texas Hold’em</h1>
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
        <div className="table table-bj">
          {!state || !me || waiting ? (
            <>
              <LobbyDecor game="holdem" />
              <div className="coda-deal">
                <p className="kicker">{waiting ? "TABLE" : "HOLD’EM"}</p>
                <h2>{waiting ? `Table ${state?.players.length ?? 0}/2` : "Heads-up Texas Hold’em"}</h2>
                <p>
                  {waiting
                    ? "Add a CPU or invite one friend, then start. Blinds 5 / 10."
                    : "Practice vs CPU, or open a table to invite. Blinds 5 / 10. First to take the other’s chips."}
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
                <MixedCpuBar game="holdem" onPractice={() => setLocal(startHoldemPractice())} />
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
                  {rival.name} · {rival.chips}
                  {rival.folded ? " · folded" : ""}
                  {state.players[state.turn]?.id === rival.id ? " · TURN" : ""}
                </div>
                <div className="pcards">
                  {rival.hole.map((c) => (
                    <PokerFace
                      key={c.id}
                      card={practice && state.street !== "showdown" && state.street !== "over" ? { ...c, hidden: true } : c}
                    />
                  ))}
                </div>
              </div>
              <div className="center-well">
                <div className="pcards community-slots">
                  {Array.from({ length: 5 }, (_, i) => {
                    const card = state.community[i];
                    return card ? <PokerFace key={card.id} card={card} /> : <div key={`slot-${i}`} className="card-ghost" aria-hidden />;
                  })}
                </div>
                <p className="status-line">
                  Pot {state.pot} · {state.message}
                </p>
              </div>
              <div className="seat">
                <div className="seat-label">
                  {me.name} · {me.chips}
                  {myTurn ? " · TURN" : ""}
                </div>
                <div className="pcards">
                  {me.hole.map((c) => (
                    <PokerFace key={c.id} card={c} />
                  ))}
                </div>
                <div className="row-actions">
                  {state.street === "over" ? null : state.street === "showdown" ? (
                    <button className="btn" type="button" onClick={() => act({ type: "next" })}>
                      Next hand
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-ghost" type="button" disabled={!myTurn} onClick={() => act({ type: "fold" })}>
                        Fold
                      </button>
                      {toCall > 0 ? (
                        <button className="btn" type="button" disabled={!myTurn} onClick={() => act({ type: "call" })}>
                          Call {toCall}
                        </button>
                      ) : (
                        <button className="btn" type="button" disabled={!myTurn} onClick={() => act({ type: "check" })}>
                          Check
                        </button>
                      )}
                      <button
                        className="btn"
                        type="button"
                        disabled={!myTurn}
                        onClick={() =>
                          act({ type: "raise", amount: state.currentBet + Math.max(state.bb * 2, Math.floor(state.pot / 2) || state.bb) })
                        }
                      >
                        Raise
                      </button>
                      <button className="btn btn-ghost" type="button" disabled={!myTurn} onClick={() => act({ type: "allin" })}>
                        All in
                      </button>
                    </>
                  )}
                </div>
                {state.street === "over" ? <p className="result-note">{state.message}</p> : null}
              </div>
            </>
          )}
        </div>
        <div className="side-stack">
          <InvitePanel game="holdem" />
          <aside className="side">
            <GameRules game="holdem" />
          </aside>
        </div>
      </div>
    </div>
  );
}
