import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  applyGuandanAction,
  guandanBotAct,
  partnerIndex,
  startGuandanPractice,
  teamOf,
  type GuandanAction,
  type GuandanState,
} from "./engine";
import { PokerFace } from "../../components/PlayingCard";
import { GameSetup } from "../../components/GameSetup";
import { InvitePanel } from "../../components/InvitePanel";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { wait } from "../../lib/shuffle";
import type { PokerCard } from "../../lib/poker";

function BackRow({ n }: { n: number }) {
  const show = Math.min(8, Math.max(0, n));
  return (
    <div className="pcards tight">
      {Array.from({ length: show }, (_, i) => (
        <PokerFace key={i} card={{ id: `bk${i}`, suit: "S", rank: "A", hidden: true }} />
      ))}
      <span className="muted">{n}</span>
    </div>
  );
}

function SeatBlock({
  label,
  turn,
  out,
  children,
  className,
}: {
  label: string;
  turn: boolean;
  out: boolean;
  children: ReactNode;
  className: string;
}) {
  return (
    <div className={`seat ${className}`}>
      <div className="seat-label">
        {label}
        {out ? " · out" : ""}
        {turn ? " · TURN" : ""}
      </div>
      {children}
    </div>
  );
}

export function GuandanPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "guandan" ? lobby.room : null;
  const [local, setLocal] = useState<GuandanState | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const state = (room?.view as GuandanState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const waiting = Boolean(state && state.phase === "lobby");
  const me = state?.players.find((p) => p.id === youId);
  const myI = state && youId ? state.players.findIndex((p) => p.id === youId) : -1;
  const myTurn = Boolean(
    state && state.phase === "play" && me && state.players[state.turn]?.id === me.id && !state.finishers.includes(me.id),
  );

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    setPicked([]);
  }, [state?.turn, state?.last?.cards.length, state?.message]);

  useEffect(() => {
    if (!practice || !local || local.phase !== "play") return;
    const actor = local.players[local.turn];
    if (!actor || !actor.id.startsWith("cpu")) return;
    let stop = false;
    void (async () => {
      await wait(550);
      if (stop) return;
      setLocal((s) => {
        const id = s?.players[s.turn]?.id;
        if (!s || !id?.startsWith("cpu")) return s;
        try {
          return applyGuandanAction(s, id, guandanBotAct(s, id));
        } catch {
          try {
            return applyGuandanAction(s, id, { type: "pass" });
          } catch {
            return s;
          }
        }
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: GuandanAction) {
    if (room) {
      void lobby.sendAction(action).catch((e) => alert(e instanceof Error ? e.message : e));
      return;
    }
    try {
      setLocal((s) => (s ? applyGuandanAction(s, "you", action) : s));
    } catch (e) {
      alert(e instanceof Error ? e.message : e);
    }
  }

  function toggle(card: PokerCard) {
    setPicked((ids) => (ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id]));
  }

  const left = myI >= 0 && state ? state.players[(myI + 1) % 4] : null;
  const partner = myI >= 0 && state ? state.players[partnerIndex(myI)] : null;
  const right = myI >= 0 && state ? state.players[(myI + 3) % 4] : null;
  const playing = Boolean(state && me && state.phase !== "lobby" && state.players.length === 4);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">06 / GDAN · Four players</p>
          <h1>Guandan</h1>
        </div>
        <div className="row-actions">
          {practice ? (
            <button className="btn btn-ghost" type="button" onClick={() => setLocal(null)}>
              RESET
            </button>
          ) : null}
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-gd">
          {!state || waiting || !playing ? (
            <div className="coda-deal">
              {waiting && state ? (
                <p className="kicker">
                  Table {state.players.length}/4 · {state.players.map((p) => p.name).join(" · ")}
                </p>
              ) : null}
              <GameSetup
                kicker="GUANDAN"
                title="Four players. Partners sit across."
                blurb="Two decks plus jokers, 27 cards each. Invite three online players. The table deals when all four seats are filled. Practice puts you with three CPUs."
                game="guandan"
                onPractice={() => setLocal(startGuandanPractice())}
              />
            </div>
          ) : me && left && partner && right ? (
            <>
              <SeatBlock
                className="seat-partner"
                label={`${partner.name} · partner · ${partner.hand.length}`}
                turn={state.players[state.turn]?.id === partner.id}
                out={state.finishers.includes(partner.id)}
              >
                <BackRow n={partner.hand.length} />
              </SeatBlock>
              <SeatBlock
                className="seat-left"
                label={`${left.name} · ${left.hand.length}`}
                turn={state.players[state.turn]?.id === left.id}
                out={state.finishers.includes(left.id)}
              >
                <BackRow n={left.hand.length} />
              </SeatBlock>
              <div className="seat-trick center-well">
                <div className="pcards" style={{ justifyContent: "center" }}>
                  {(state.last?.cards || []).map((c) => (
                    <PokerFace key={c.id} card={c} />
                  ))}
                </div>
                <p className="status-line">{state.message}</p>
                {myI >= 0 ? (
                  <p className="muted" style={{ textAlign: "center" }}>
                    Teams · {state.players.filter((_, i) => teamOf(i) === teamOf(myI)).map((p) => p.name).join(" & ")} vs{" "}
                    {state.players.filter((_, i) => teamOf(i) !== teamOf(myI)).map((p) => p.name).join(" & ")}
                  </p>
                ) : null}
              </div>
              <SeatBlock
                className="seat-right"
                label={`${right.name} · ${right.hand.length}`}
                turn={state.players[state.turn]?.id === right.id}
                out={state.finishers.includes(right.id)}
              >
                <BackRow n={right.hand.length} />
              </SeatBlock>
              <SeatBlock
                className="seat-me"
                label={`${me.name} · ${me.hand.length}`}
                turn={myTurn}
                out={state.finishers.includes(me.id)}
              >
                <div className="pcards wrap">
                  {me.hand.map((c) => (
                    <PokerFace key={c.id} card={c} selected={picked.includes(c.id)} onClick={() => toggle(c)} />
                  ))}
                </div>
                {myTurn ? (
                  <div className="row-actions">
                    <button
                      className="btn"
                      type="button"
                      onClick={() => act({ type: "play", cards: me.hand.filter((c) => picked.includes(c.id)) })}
                    >
                      Play
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={() => act({ type: "pass" })}>
                      Pass
                    </button>
                  </div>
                ) : null}
                {state.phase === "over" ? <p className="result-note">{state.message}</p> : null}
              </SeatBlock>
            </>
          ) : (
            <GameSetup
              kicker="GUANDAN"
              title="Four players. Partners sit across."
              blurb="Invite three online players. Deals at four."
              game="guandan"
              onPractice={() => setLocal(startGuandanPractice())}
            />
          )}
        </div>
        <InvitePanel game="guandan" />
      </div>
    </div>
  );
}
