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
  type ERole,
  type EState,
} from "./engine";
import { GameSetup } from "../../components/GameSetup";
import { LobbyDecor } from "../../components/LobbyDecor";
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
    if (local.phase === "pick" && cpu.locked) return;
    if (local.phase === "pick" && local.players.every((p) => p.locked)) return;
    if (local.phase === "role" && cpu.roleReady) return;
    let stop = false;
    void (async () => {
      await wait(CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase === "over") return s;
        const bot = s.players.find((p) => !p.human);
        if (!bot) return s;
        if (s.phase === "reveal") return applyEcardAction(s, bot.id, { type: "next" });
        if (s.phase === "role") {
          let next = s;
          const act1 = aiEcard(next, bot.id);
          next = applyEcardAction(next, bot.id, act1);
          const again = aiEcard(next, bot.id);
          if (again.type !== act1.type || (again.type === "role" && act1.type === "role" && again.role !== act1.role)) {
            next = applyEcardAction(next, bot.id, again);
          } else if (again.type === "confirmRole" && act1.type === "role") {
            next = applyEcardAction(next, bot.id, again);
          }
          return next;
        }
        if (s.phase === "pick") {
          let next = s;
          if (!bot.locked) {
            if (!bot.selectedId) next = applyEcardAction(next, bot.id, aiEcard(next, bot.id));
            const after = next.players.find((p) => p.id === bot.id);
            if (after?.selectedId && !after.locked) {
              next = applyEcardAction(next, bot.id, { type: "lock" });
            }
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

  function pickRole(role: ERole) {
    act({ type: "role", role });
  }

  return (
    <div className="page-wide">
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
            <>
              <LobbyDecor game="ecard" />
              <GameSetup
                kicker="E-CARD"
                title="Emperor · Citizen · Slave"
                blurb="Kaiji’s psychological duel. Slave beats Emperor. First to 3 match wins. Match winner plays Emperor next."
                game="ecard"
                onPractice={() => setLocal(startEcardPractice())}
              />
            </>
          ) : state.phase === "role" ? (
            <div className="ecard-role-pick">
              <p className="kicker">CHOOSE SIDE</p>
              <h2>Emperor or Slave?</h2>
              <p className="status-line">Both players pick. If you choose the same side, a coin flip decides.</p>
              <div className="ecard-role-row">
                <button
                  type="button"
                  className={`ecard-role-btn${me.rolePick === "emperor" ? " on" : ""}`}
                  disabled={me.roleReady}
                  onClick={() => pickRole("emperor")}
                >
                  <EFace kind="emperor" />
                  <span>EMPEROR</span>
                </button>
                <button
                  type="button"
                  className={`ecard-role-btn${me.rolePick === "slave" ? " on" : ""}`}
                  disabled={me.roleReady}
                  onClick={() => pickRole("slave")}
                >
                  <EFace kind="slave" />
                  <span>SLAVE</span>
                </button>
              </div>
              <p className="status-line">
                {me.roleReady
                  ? rival.roleReady
                    ? "Resolving…"
                    : "Waiting for rival…"
                  : me.rolePick
                    ? `Selected ${me.rolePick.toUpperCase()}. Confirm when ready.`
                    : "Tap a side."}
                {rival.roleReady ? " · Rival is ready." : ""}
              </p>
              <div className="row-actions" style={{ justifyContent: "center" }}>
                <button
                  className="btn btn-go"
                  type="button"
                  disabled={!me.rolePick || me.roleReady}
                  onClick={() => act({ type: "confirmRole" })}
                >
                  CONFIRM SIDE
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="ecard-meta">
                <span>
                  {me.name} · {(me.role || "?").toUpperCase()} · {state.wins[me.id] || 0}
                </span>
                <span className="ecard-vs">VS</span>
                <span>
                  {rival.name} · {(rival.role || "?").toUpperCase()} · {state.wins[rival.id] || 0}
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
                    {me.locked ? <Back /> : <div className="ecard-slot">{me.selectedId ? "PICKED" : "YOU"}</div>}
                    {rival.locked ? <Back /> : <div className="ecard-slot">RIVAL</div>}
                  </>
                )}
              </div>
              <p className="status-line">
                {state.phase === "over"
                  ? `${state.players.find((p) => p.id === state.winnerId)?.name || ""} wins`
                  : state.phase === "reveal"
                    ? state.log.at(-1)?.text || "Reveal"
                    : me.locked
                      ? rival.locked
                        ? "Revealing…"
                        : "Locked. Waiting for rival…"
                      : myTurnPick
                        ? "Choose a card, then lock."
                        : me.selectedId
                          ? "Card selected — press LOCK when ready."
                          : "Waiting…"}
              </p>
              <div className="ecard-hand">
                {me.hand.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`ecard-pick${me.selectedId === c.id ? " on" : ""}`}
                    disabled={state.phase !== "pick" || me.locked}
                    onClick={() => playCard(c)}
                  >
                    <EFace kind={c.kind} />
                  </button>
                ))}
              </div>
              <div className="row-actions" style={{ justifyContent: "center" }}>
                {state.phase === "pick" ? (
                  <button
                    className="btn btn-go"
                    type="button"
                    disabled={!me.selectedId || me.locked}
                    onClick={() => act({ type: "lock" })}
                  >
                    {me.locked ? "LOCKED" : "LOCK"}
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
