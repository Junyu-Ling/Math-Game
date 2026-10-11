import { useEffect, useState } from "react";
import {
  aiEcard,
  applyEcardAction,
  cardArt,
  cardLabel,
  startEcardPractice,
  type EAction,
  type ECard,
  type EKind,
  type EState,
} from "./engine";
import { GameSetup } from "../../components/GameSetup";
import { InvitePanel } from "../../components/InvitePanel";
import { GameRules } from "../../components/GameRules";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

function EFace({ kind, small }: { kind: EKind; small?: boolean }) {
  return (
    <div className={`ecard-face${small ? " mini" : ""}`}>
      <img src={cardArt(kind)} alt={cardLabel(kind)} />
    </div>
  );
}

function Back() {
  return (
    <div className="ecard-face back" aria-hidden>
      <b>E</b>
    </div>
  );
}

export function EcardPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "ecard" ? lobby.room : null;
  const [local, setLocal] = useState<EState | null>(null);
  const state = (room?.view as EState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const myTurnPick = Boolean(state && me && state.phase === "pick" && !me.selectedId);

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over") return;
    const cpu = local.players.find((p) => !p.human);
    if (!cpu) return;
    if (local.phase === "pick" && cpu.selectedId) return;
    if (local.phase === "pick" && local.players.every((p) => p.selectedId)) return;
    let stop = false;
    void (async () => {
      await wait(CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase === "over") return s;
        const bot = s.players.find((p) => !p.human);
        if (!bot) return s;
        if (s.phase === "reveal") return applyEcardAction(s, bot.id, { type: "next" });
        if (s.phase === "pick") {
          let next = s;
          if (!bot.selectedId) next = applyEcardAction(next, bot.id, aiEcard(next, bot.id));
          if (next.players.find((p) => p.id === bot.id)?.selectedId) {
            next = applyEcardAction(next, bot.id, { type: "lock" });
          }
          return next;
        }
        return s;
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: EAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s && me ? applyEcardAction(s, me.id, action) : s));
  }

  function playCard(card: ECard) {
    act({ type: "select", cardId: card.id });
  }

  return (
    <div className="page-wide ecard-page">
      <div className="game-head">
        <div>
          <p className="kicker">08 / ECARD · Duel</p>
          <h1>E-Card</h1>
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
        <div className="table table-ecard">
          {!state || !me || !rival ? (
            <GameSetup
              kicker="E-CARD"
              title="Emperor · Citizen · Slave"
              blurb="Kaiji’s psychological duel. Slave beats Emperor. First to 3 match wins. Roles swap every 3 matches."
              game="ecard"
              onPractice={() => setLocal(startEcardPractice())}
            />
          ) : (
            <>
              <div className="ecard-meta">
                <span>
                  {me.name} · {me.role.toUpperCase()} · {state.wins[me.id] || 0}
                </span>
                <span className="ecard-vs">VS</span>
                <span>
                  {rival.name} · {rival.role.toUpperCase()} · {state.wins[rival.id] || 0}
                </span>
              </div>
              <div className="ecard-rival-row">
                {rival.hand.map((c) =>
                  state.phase === "reveal" || state.phase === "over" ? (
                    <EFace key={c.id} kind={c.kind} small />
                  ) : (
                    <Back key={c.id} />
                  ),
                )}
              </div>
              <div className="ecard-stage">
                {state.phase === "reveal" && state.last ? (
                  <>
                    <EFace kind={state.last.aId === me.id ? state.last.a : state.last.b} />
                    <EFace kind={state.last.bId === rival.id ? state.last.b : state.last.a} />
                  </>
                ) : (
                  <>
                    {me.selectedId ? <Back /> : <div className="ecard-slot">YOU</div>}
                    {rival.selectedId ? <Back /> : <div className="ecard-slot">RIVAL</div>}
                  </>
                )}
              </div>
              <p className="status-line">
                {state.phase === "over"
                  ? `${state.players.find((p) => p.id === state.winnerId)?.name || ""} wins`
                  : state.phase === "reveal"
                    ? state.log.at(-1)?.text || "Reveal"
                    : myTurnPick
                      ? "Choose a card, then lock it in."
                      : me.selectedId
                        ? "Waiting for rival…"
                        : "Waiting…"}
              </p>
              <div className="ecard-hand">
                {me.hand.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`ecard-pick${me.selectedId === c.id ? " on" : ""}`}
                    disabled={state.phase !== "pick" || Boolean(me.selectedId && me.selectedId !== c.id)}
                    onClick={() => playCard(c)}
                  >
                    <EFace kind={c.kind} />
                  </button>
                ))}
              </div>
              <div className="row-actions" style={{ justifyContent: "center" }}>
                {state.phase === "pick" ? (
                  <button className="btn btn-go" type="button" disabled={!me.selectedId} onClick={() => act({ type: "lock" })}>
                    LOCK
                  </button>
                ) : null}
                {state.phase === "reveal" ? (
                  <button className="btn" type="button" onClick={() => act({ type: "next" })}>
                    CONTINUE
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
        <div className="side-stack">
          <InvitePanel game="ecard" />
          <aside className="side">
            <GameRules game="ecard" />
            {state ? (
              <div>
                <h3>LOG</h3>
                <div className="log">
                  {[...state.log].reverse().map((l) => (
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
