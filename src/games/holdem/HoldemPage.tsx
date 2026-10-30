import { useEffect, useState } from "react";
import {
  applyHoldemAction,
  holdemBotAct,
  raiseBounds,
  startHoldemPractice,
  type HoldemAction,
  type HoldemState,
} from "./engine";
import { PokerFace } from "../../components/PlayingCard";
import { LobbyDecor } from "../../components/LobbyDecor";
import { RulesButton } from "../../components/GameRules";
import { MixedCpuBar, seatTag, TableReadyControls } from "../../components/MixedCpuBar";
import { SeatTalk } from "../../components/TableTalk";
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
  const myTurn = Boolean(
    state && me && state.players[state.turn]?.id === me.id && state.street !== "showdown" && state.street !== "over" && state.street !== "lobby",
  );
  const bounds = me && state ? raiseBounds(state, me.id) : null;
  const toCall = bounds?.toCall ?? 0;
  const raiseMin = bounds?.min ?? 0;
  const raiseMax = bounds?.max ?? 0;
  const canRaise = Boolean(bounds?.canRaise);
  const canFullRaise = Boolean(bounds?.canFullRaise);
  const openingBet = Boolean(state && state.currentBet === 0);
  const [raiseTo, setRaiseTo] = useState(0);
  const raiseAmount =
    bounds && raiseMax > 0 ? Math.min(raiseMax, Math.max(raiseMin, raiseTo || raiseMin)) : raiseMin;

  useEffect(() => {
    setRaiseTo(canFullRaise ? raiseMin : raiseMax);
  }, [canFullRaise, raiseMin, raiseMax, myTurn, state?.street, state?.currentBet]);

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
          <p className="kicker">05 / HOLD · No-limit</p>
          <h1>Texas Hold’em</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="holdem" />
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
                <h2>{waiting ? `Table ${state?.players.length ?? 0}/2` : "Heads-up no-limit Hold’em"}</h2>
                <p>
                  {waiting
                    ? "Add a CPU or invite one friend, then everyone Ready. Blinds 5 / 10. Raise any amount from the min up to all in."
                    : "No-limit. You choose the raise: at least the last full raise (or the big blind), with no cap. All in is always allowed. Blinds 5 / 10."}
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
                <MixedCpuBar game="holdem" onPractice={() => setLocal(startHoldemPractice())} />
                <div className="row-actions" style={{ justifyContent: "center" }}>
                  <TableReadyControls
                    waiting={waiting}
                    game="holdem"
                    players={state?.players ?? []}
                    youId={youId}
                    readyIds={(state as { readyIds?: string[] } | null)?.readyIds}
                    matched={(state as { matched?: boolean } | null)?.matched}
                    onReady={() => act({ type: "ready" })}
                  />
                </div>
              </div>
            </>
          ) : !rival ? null : (
            <>
              <div className="seat">
                <div className="seat-label">
                  <SeatTalk playerId={rival.id} name={rival.name}>
                    <span>
                  {rival.chips}
                  {rival.folded ? " · folded" : ""}
                  {state.players[state.turn]?.id === rival.id ? " · TURN" : ""}
                    </span>
                  </SeatTalk>
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
                <p className="coach-line">
                  {state.street === "showdown"
                    ? "Best five-card hand from your two hole cards plus the board. Tap Next hand to deal again."
                    : state.street === "over"
                      ? "One stack is gone, so the table is over."
                      : !myTurn
                        ? "Wait for the other seat. Fold gives up the pot. Call matches the bet. Raise makes them pay more. All in is your whole stack."
                        : toCall > 0
                          ? `To stay in, call ${toCall} (or all in if you have less). Fold throws these cards away. Raise to at least ${raiseMin}, or shove.`
                          : `Nobody to call. Check to see the next card for free, or bet from ${raiseMin} up to all in.`}
                </p>
              </div>
              <div className="seat seat-you">
                <div className="seat-label">
                  <SeatTalk playerId={me.id} name={me.name}>
                    <span>
                  {me.chips}
                  {myTurn ? " · TURN" : ""}
                    </span>
                  </SeatTalk>
                </div>
                <div className="pcards">
                  {me.hole.map((c) => (
                    <PokerFace key={c.id} card={c} />
                  ))}
                </div>
                <div className="holdem-nl">
                  {state.street === "over" ? null : state.street === "showdown" ? (
                    <div className="row-actions">
                      <button className="btn" type="button" onClick={() => act({ type: "next" })}>
                        Next hand
                      </button>
                    </div>
                  ) : (
                    <>
                      {canRaise && canFullRaise ? (
                        <div className="holdem-raise">
                          <input
                            type="range"
                            min={raiseMin}
                            max={raiseMax}
                            step={1}
                            value={raiseAmount}
                            disabled={!myTurn}
                            aria-label="Raise amount"
                            onChange={(e) => setRaiseTo(Number(e.target.value))}
                          />
                          <input
                            type="number"
                            min={raiseMin}
                            max={raiseMax}
                            step={1}
                            value={raiseAmount}
                            disabled={!myTurn}
                            aria-label="Raise to"
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              setRaiseTo(Math.min(raiseMax, Math.max(raiseMin, Math.floor(n))));
                            }}
                          />
                          <button className="btn btn-ghost" type="button" disabled={!myTurn} onClick={() => setRaiseTo(raiseMin)}>
                            Min
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            disabled={!myTurn}
                            onClick={() =>
                              setRaiseTo(Math.min(raiseMax, Math.max(raiseMin, state.pot + state.currentBet)))
                            }
                          >
                            Pot
                          </button>
                          <p className="nl-hint">
                            {`No-limit. Min ${raiseMin}${openingBet ? " to bet" : " to raise"}. No cap — all in is ${raiseMax}.`}
                          </p>
                        </div>
                      ) : null}
                      <div className="row-actions">
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
                        {canRaise && canFullRaise ? (
                          <button
                            className="btn"
                            type="button"
                            disabled={!myTurn}
                            onClick={() =>
                              raiseAmount >= raiseMax
                                ? act({ type: "allin" })
                                : act({ type: "raise", amount: raiseAmount })
                            }
                          >
                            {openingBet ? `Bet ${raiseAmount}` : `Raise to ${raiseAmount}`}
                          </button>
                        ) : null}
                        <button className="btn btn-ghost" type="button" disabled={!myTurn || me.chips <= 0} onClick={() => act({ type: "allin" })}>
                          All in
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {state.street === "over" ? <p className="result-note">{state.message}</p> : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
