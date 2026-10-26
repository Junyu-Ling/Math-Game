import { useEffect, useState } from "react";
import {
  RPS_REVEAL_MS,
  TOTAL_ROUNDS,
  aiEcard,
  applyEcardAction,
  cardArt,
  cardBack,
  cardLabel,
  finishEcardRps,
  startEcardPractice,
  type EAction,
  type ECard,
  type EKind,
  type ERole,
  type EState,
  type RpsThrow,
} from "./engine";
import { LobbyDecor } from "../../components/LobbyDecor";
import { ClickPop, RulesButton } from "../../components/GameRules";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { SeatTalk } from "../../components/TableTalk";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { forfeitText } from "../../lib/forfeit";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

const RPS_CHOICES: Array<{ id: RpsThrow; label: string }> = [
  { id: "rock", label: "Rock" },
  { id: "paper", label: "Paper" },
  { id: "scissors", label: "Scissors" },
];
const RPS_CHANT = ["", "Rock", "Scissors", "Paper"] as const;

function EFace({ kind, small }: { kind: EKind; small?: boolean }) {
  return (
    <div className={`ecard-face${small ? " mini" : ""}`}>
      <img src={cardArt(kind)} alt={cardLabel(kind)} />
    </div>
  );
}

function Back({ small }: { small?: boolean }) {
  return (
    <div className={`ecard-face back${small ? " mini" : ""}`} aria-hidden>
      <img src={cardBack()} alt="" />
    </div>
  );
}

function rpsWinsThrow(a: RpsThrow, b: RpsThrow): boolean {
  return (a === "rock" && b === "scissors") || (a === "paper" && b === "rock") || (a === "scissors" && b === "paper");
}

function HandShape({ kind }: { kind: "fist" | RpsThrow }) {
  const pose = kind === "fist" ? "rock" : kind;
  return (
    <svg className="rps-svg" viewBox="0 0 140 140" aria-hidden>
      {pose === "rock" ? (
        <g fill="#f3c7a8" stroke="#c48a62" strokeWidth="4" strokeLinejoin="round">
          <ellipse cx="72" cy="86" rx="36" ry="30" />
          <rect x="44" y="42" width="18" height="48" rx="9" />
          <rect x="62" y="34" width="18" height="54" rx="9" />
          <rect x="80" y="36" width="18" height="52" rx="9" />
          <rect x="98" y="46" width="16" height="42" rx="8" />
          <ellipse cx="40" cy="80" rx="16" ry="13" />
        </g>
      ) : pose === "paper" ? (
        <g fill="#f3c7a8" stroke="#c48a62" strokeWidth="4" strokeLinejoin="round">
          <rect x="38" y="58" width="64" height="52" rx="16" />
          <rect x="40" y="18" width="14" height="52" rx="7" />
          <rect x="56" y="10" width="14" height="58" rx="7" />
          <rect x="72" y="12" width="14" height="56" rx="7" />
          <rect x="88" y="20" width="14" height="50" rx="7" />
          <ellipse cx="34" cy="86" rx="14" ry="12" transform="rotate(-28 34 86)" />
        </g>
      ) : (
        <g fill="#f3c7a8" stroke="#c48a62" strokeWidth="4" strokeLinejoin="round">
          <ellipse cx="70" cy="96" rx="34" ry="26" />
          <rect x="48" y="14" width="16" height="70" rx="8" transform="rotate(-12 56 49)" />
          <rect x="76" y="14" width="16" height="70" rx="8" transform="rotate(12 84 49)" />
          <rect x="42" y="72" width="18" height="28" rx="8" />
          <rect x="80" y="72" width="16" height="26" rx="8" />
          <ellipse cx="36" cy="92" rx="14" ry="11" />
        </g>
      )}
    </svg>
  );
}

function RpsHand({
  kind,
  side,
  pose,
  won,
}: {
  kind: "fist" | RpsThrow;
  side: "you" | "rival";
  pose: "idle" | "pump" | "show";
  won?: boolean | null;
}) {
  const winClass = won === true ? " win" : won === false ? " lose" : "";
  return (
    <div className={`rps-hand ${side} ${pose}${winClass}`}>
      <HandShape kind={kind} />
    </div>
  );
}

export function EcardPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "ecard" ? lobby.room : null;
  const [local, setLocal] = useState<EState | null>(null);
  const [rpsBeat, setRpsBeat] = useState(0);
  const held = (!room && lobby.settlement?.game === "ecard" ? lobby.settlement.view : null) as EState | null;
  const state = (room?.view as EState | undefined) ?? held ?? local;
  const practice = Boolean(local && !room && !held);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const waiting = Boolean(state?.phase === "lobby");
  const host = Boolean(user && room?.seats?.[0] === user.id);
  const myTurnPick = Boolean(state && me && state.phase === "pick" && !me.selectedId);
  const iChooseRole = Boolean(state && me && state.phase === "role" && state.roleChooserId === me.id);

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!state?.rpsReveal) {
      setRpsBeat(0);
      return;
    }
    setRpsBeat(1);
    const t1 = window.setTimeout(() => setRpsBeat(2), 520);
    const t2 = window.setTimeout(() => setRpsBeat(3), 1040);
    const t3 = window.setTimeout(() => setRpsBeat(4), 1560);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [state?.rpsReveal]);

  useEffect(() => {
    if (!practice || !local?.rpsReveal) return;
    const t = window.setTimeout(() => {
      setLocal((s) => (s?.rpsReveal ? finishEcardRps(s) : s));
    }, RPS_REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [practice, local?.rpsReveal]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over" || local.rpsReveal) return;
    let stop = false;
    void (async () => {
      const s0 = local;
      if (s0.phase === "rps") {
        const cpu = s0.players.find((p) => !p.human && !s0.rpsThrows?.[p.id]);
        if (!cpu) return;
        await wait(CPU_THINK_MS);
        if (stop) return;
        setLocal((s) => {
          if (!s || s.phase !== "rps" || s.rpsReveal) return s;
          const c = s.players.find((p) => !p.human && !s.rpsThrows?.[p.id]);
          return c ? applyEcardAction(s, c.id, aiEcard(s, c.id)) : s;
        });
        return;
      }
      if (s0.phase === "role") {
        const cpu = s0.players.find((p) => p.id === s0.roleChooserId && !p.human);
        if (!cpu) return;
        await wait(CPU_THINK_MS);
        if (stop) return;
        setLocal((s) => {
          if (!s || s.phase !== "role") return s;
          const c = s.players.find((p) => p.id === s.roleChooserId && !p.human);
          return c ? applyEcardAction(s, c.id, aiEcard(s, c.id)) : s;
        });
        return;
      }
      if (s0.phase === "reveal") {
        const cpu = s0.players.find((p) => !p.human);
        if (!cpu) return;
        await wait(CPU_THINK_MS);
        if (stop) return;
        setLocal((s) => {
          if (!s || s.phase !== "reveal") return s;
          const c = s.players.find((p) => !p.human);
          return c ? applyEcardAction(s, c.id, { type: "next" }) : s;
        });
        return;
      }
      if (s0.phase !== "pick") return;
      const cpu = s0.players.find((p) => !p.human && !p.locked);
      if (!cpu) return;
      await wait(CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase !== "pick") return s;
        const c = s.players.find((p) => !p.human && !p.locked);
        if (!c) return s;
        let next = applyEcardAction(s, c.id, aiEcard(s, c.id));
        const after = next.players.find((p) => p.id === c.id);
        if (after && after.selectedId && !after.locked) {
          next = applyEcardAction(next, c.id, { type: "lock" });
        }
        return next;
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
    setLocal((s) => (s ? applyEcardAction(s, "you", action) : s));
  }

  function playCard(card: ECard) {
    act({ type: "select", cardId: card.id });
  }

  function pickRole(role: ERole) {
    act({ type: "role", role });
  }

  const rpsReveal = state?.rpsReveal ?? null;
  const myRpsThrow = me ? state?.rpsThrows[me.id] : undefined;
  const rpsShown = rpsBeat >= 4 && Boolean(rpsReveal);
  const rpsPumping = rpsBeat >= 1 && rpsBeat <= 3 && Boolean(rpsReveal);
  const rpsPose = rpsPumping ? "pump" : rpsShown ? "show" : "idle";
  const youRpsKind: "fist" | RpsThrow =
    rpsShown && rpsReveal && me ? (rpsReveal.aId === me.id ? rpsReveal.a : rpsReveal.b) : "fist";
  const rivalRpsKind: "fist" | RpsThrow =
    rpsShown && rpsReveal && rival ? (rpsReveal.aId === rival.id ? rpsReveal.a : rpsReveal.b) : "fist";
  const youRpsWon =
    rpsShown && rpsReveal && rpsReveal.a !== rpsReveal.b && youRpsKind !== "fist" && rivalRpsKind !== "fist"
      ? rpsWinsThrow(youRpsKind, rivalRpsKind)
      : null;
  const rpsChant = rpsPumping ? RPS_CHANT[rpsBeat] : "vs";
  const rpsLocked = Boolean(myRpsThrow || rpsReveal);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">08 / ECARD · Duel</p>
          <h1>E-Card</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="ecard" />
          {state ? (
            <ClickPop label="Log">
              <h3>LOG</h3>
              <div className="log">
                {[...state.log].reverse().map((l) => (
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
        <div className="table table-ecard">
          {!state || !me || waiting ? (
            <>
              <LobbyDecor game="ecard" />
              <div className="coda-deal">
                <p className="kicker">{waiting ? "TABLE" : "E-CARD"}</p>
                <h2>{waiting ? `Table ${state?.players.length ?? 0}/2` : "Emperor · Citizen · Slave"}</h2>
                <p>
                  {waiting
                    ? "Add a CPU or invite one friend, then start. RPS picks the opening side."
                    : "Practice vs CPU, or open a table to invite. Emperor beats Citizen +1 and returns. Slave beats Emperor +5."}
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
                <MixedCpuBar game="ecard" onPractice={() => setLocal(startEcardPractice())} />
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
          ) : !rival ? null : state.phase === "rps" ? (
            <div className="coda-deal coda-rps">
              <p className="kicker">Rock paper scissors</p>
              <div className="rps-arena">
                <div className="rps-side rival">
                  <span className="rps-name">
                    <SeatTalk playerId={rival.id} name={rival.name}>
                      {rival.name}
                    </SeatTalk>
                  </span>
                  <RpsHand
                    key={`rival-${rpsBeat}-${rivalRpsKind}`}
                    kind={rivalRpsKind}
                    side="rival"
                    pose={rpsPose}
                    won={youRpsWon === null ? null : !youRpsWon}
                  />
                </div>
                <div key={rpsBeat} className={`rps-mid${rpsPumping ? " chant" : ""}`} aria-live="polite">
                  {rpsChant}
                </div>
                <div className="rps-side you">
                  <RpsHand
                    key={`you-${rpsBeat}-${youRpsKind}`}
                    kind={youRpsKind}
                    side="you"
                    pose={rpsPose}
                    won={youRpsWon}
                  />
                  <span className="rps-name">
                    <SeatTalk playerId={me.id} name={me.name}>
                      {me.name}
                    </SeatTalk>
                  </span>
                </div>
              </div>
              <p>
                {rpsReveal && rpsShown
                  ? rpsReveal.a === rpsReveal.b
                    ? "Tie. Throw again."
                    : youRpsWon
                      ? "You win. Pick Emperor or Slave."
                      : "You lose. Rival picks the side."
                  : rpsReveal
                    ? "Throw."
                    : myRpsThrow
                      ? "Ready. Waiting for the other hand."
                      : "Throw. Winner picks Emperor or Slave."}
              </p>
              <div className="rps-row">
                {RPS_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    className={`rps-pick${myRpsThrow === c.id ? " on" : ""}`}
                    type="button"
                    disabled={rpsLocked}
                    onClick={() => act({ type: "rps", throw: c.id })}
                  >
                    <HandShape kind={c.id} />
                    <b>{c.label}</b>
                  </button>
                ))}
              </div>
            </div>
          ) : state.phase === "role" ? (
            <div className="ecard-role-pick">
              <p className="kicker">CHOOSE SIDE</p>
              <h2>{iChooseRole ? "You won RPS — pick a side" : "Waiting for rival to pick"}</h2>
              <p className="status-line">
                {iChooseRole
                  ? "Winner chooses Emperor or Slave. The other side takes the remaining role."
                  : `${state.players.find((p) => p.id === state.roleChooserId)?.name || "Rival"} is choosing.`}
              </p>
              <div className="ecard-role-row">
                <button
                  type="button"
                  className="ecard-role-btn"
                  disabled={!iChooseRole}
                  onClick={() => pickRole("emperor")}
                >
                  <EFace kind="emperor" />
                  <span>EMPEROR</span>
                </button>
                <button
                  type="button"
                  className="ecard-role-btn"
                  disabled={!iChooseRole}
                  onClick={() => pickRole("slave")}
                >
                  <EFace kind="slave" />
                  <span>SLAVE</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="ecard-meta">
                <span>
                  R{state.round}/{TOTAL_ROUNDS} · SET {state.set}/4
                </span>
                <span className="ecard-vs">·</span>
                <span>
                  <SeatTalk playerId={me.id} name={me.name}>
                    {me.name} · {(me.role || "?").toUpperCase()} · {state.score[me.id] || 0}
                  </SeatTalk>
                </span>
                <span className="ecard-vs">VS</span>
                <span>
                  <SeatTalk playerId={rival.id} name={rival.name}>
                    {rival.name} · {(rival.role || "?").toUpperCase()} · {state.score[rival.id] || 0}
                  </SeatTalk>
                </span>
              </div>
              <div className="ecard-rival-row">
                {rival.hand.map((c) =>
                  state.phase === "reveal" || state.phase === "over" ? (
                    <EFace key={c.id} kind={c.kind} small />
                  ) : (
                    <Back key={c.id} small />
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
                  ? forfeitText(state) ||
                    (state.winnerId
                      ? `${state.players.find((p) => p.id === state.winnerId)?.name || ""} wins ${state.score[me.id] || 0}–${state.score[rival.id] || 0}`
                      : `Draw ${state.score[me.id] || 0}–${state.score[rival.id] || 0}`)
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
      </div>
    </div>
  );
}
