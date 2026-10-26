import { useEffect, useState } from "react";
import {
  WOLF_MAX,
  WOLF_MIN,
  aiWerewolf,
  applyWerewolfAction,
  roleLabel,
  startWerewolfPractice,
  type WAction,
  type WolfPhase,
  type WolfRole,
  type WPlayer,
  type WState,
} from "./engine";
import { LobbyDecor } from "../../components/LobbyDecor";
import { ClickPop, RulesButton } from "../../components/GameRules";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { SeatTalk } from "../../components/TableTalk";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { forfeitText } from "../../lib/forfeit";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

function phaseLabel(phase: WolfPhase, day: number) {
  if (phase === "lobby") return "Lobby";
  if (phase === "night_wolves") return `Night ${day} · Wolves`;
  if (phase === "night_seer") return `Night ${day} · Seer`;
  if (phase === "night_witch") return `Night ${day} · Witch`;
  if (phase === "dawn") return `Day ${day} · Dawn`;
  if (phase === "vote") return `Day ${day} · Vote`;
  return "Over";
}

function roleTone(role: WolfRole | null | undefined) {
  if (role === "werewolf") return "wolf";
  if (role === "seer") return "seer";
  if (role === "witch") return "witch";
  if (role === "villager") return "villager";
  return "unknown";
}

function cpuDue(state: WState): WPlayer | null {
  if (state.phase === "over" || state.phase === "lobby") return null;
  if (state.phase === "night_wolves") {
    return state.players.find((p) => p.alive && !p.human && p.role === "werewolf" && !state.wolfVotes[p.id]) ?? null;
  }
  if (state.phase === "night_seer") {
    return state.players.find((p) => p.alive && !p.human && p.role === "seer" && !state.seerChecked) ?? null;
  }
  if (state.phase === "night_witch") {
    return state.players.find((p) => p.alive && !p.human && p.role === "witch" && !state.witchDone) ?? null;
  }
  if (state.phase === "dawn") {
    return state.players.find((p) => !p.human) ?? null;
  }
  if (state.phase === "vote") {
    return state.players.find((p) => p.alive && !p.human && !p.voteFor) ?? null;
  }
  return null;
}

export function WerewolfPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "werewolf" ? lobby.room : null;
  const [local, setLocal] = useState<WState | null>(null);
  const [poisonPick, setPoisonPick] = useState<string | null>(null);
  const held = (!room && lobby.settlement?.game === "werewolf" ? lobby.settlement.view : null) as WState | null;
  const state = (room?.view as WState | undefined) ?? held ?? local;
  const practice = Boolean(local && !room && !held);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const waiting = Boolean(state?.phase === "lobby");
  const host = Boolean(me && state?.players[0]?.id === me.id);
  const alive = state?.players.filter((p) => p.alive) ?? [];

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local) return;
    const cpu = cpuDue(local);
    if (!cpu) return;
    let stop = false;
    void (async () => {
      await wait(CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => {
        if (!s) return s;
        const actor = cpuDue(s);
        if (!actor) return s;
        return applyWerewolfAction(s, actor.id, aiWerewolf(s, actor.id));
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: WAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s && me ? applyWerewolfAction(s, me.id, action) : s));
  }

  const myWolfTurn = Boolean(
    state && me?.alive && me.role === "werewolf" && state.phase === "night_wolves" && !state.wolfVotes[me.id],
  );
  const mySeerTurn = Boolean(
    state && me?.alive && me.role === "seer" && state.phase === "night_seer" && !state.seerChecked,
  );
  const myWitchTurn = Boolean(
    state && me?.alive && me.role === "witch" && state.phase === "night_witch" && !state.witchDone,
  );
  const myVoteTurn = Boolean(state && me?.alive && state.phase === "vote" && !me.voteFor);
  const canDawn = Boolean(state && state.phase === "dawn" && me?.alive);

  const playing = Boolean(state && me && !waiting);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">10 / WOLF · {WOLF_MIN}–{WOLF_MAX}</p>
          <h1>Werewolf</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="werewolf" />
          {state?.log?.length ? (
            <ClickPop label="Log">
              <div className="wolf-log">
                <h3>LOG</h3>
                <ul>
                  {[...state.log].slice(-12).reverse().map((e) => (
                    <li key={e.id}>{e.text}</li>
                  ))}
                </ul>
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
        <div className="table table-werewolf">
          {!playing || !state || !me ? (
            <>
              <LobbyDecor game="werewolf" />
              <div className="coda-deal">
                <p className="kicker">{waiting ? "TABLE" : "WEREWOLF"}</p>
                <h2>{waiting ? `Table ${state?.players.length ?? 0}/${WOLF_MAX}` : "Night and day"}</h2>
                <p>
                  {waiting
                    ? `Add CPUs or invite, then start with ${WOLF_MIN}–${WOLF_MAX}. Roles: Werewolf, Villager, Seer, Witch.`
                    : `Practice vs CPU (${WOLF_MIN}+), or open a table. Simplified party Werewolf — night kills, day vote.`}
                </p>
                {waiting && state ? (
                  <ul className="lobby-roster">
                    {state.players.map((p, i) => (
                      <li key={p.id}>
                        <SeatTalk playerId={p.id} name={p.name} />
                        <span>{seatTag(p, i, state.players[0]?.id)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <MixedCpuBar game="werewolf" onPractice={(cpus) => setLocal(startWerewolfPractice(cpus + 1))} />
                <div className="row-actions" style={{ justifyContent: "center" }}>
                  {waiting ? (
                    host && (state?.players.length ?? 0) >= WOLF_MIN ? (
                      <button className="btn" type="button" onClick={() => act({ type: "start" })}>
                        Start {state?.players.length}P
                      </button>
                    ) : (
                      <p>
                        {host
                          ? `Need ${WOLF_MIN}–${WOLF_MAX} players to start.`
                          : "Waiting for the host to start."}
                      </p>
                    )
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="wolf-status">
                <p className="kicker">{phaseLabel(state.phase, state.day)}</p>
                <h2>
                  {state.phase === "over"
                    ? forfeitText(state) || (state.winner === "wolves" ? "Werewolves win" : "Village wins")
                    : me.alive
                      ? `You are ${roleLabel(me.role)}`
                      : "You are out"}
                </h2>
                {state.seerResult && me.role === "seer" ? (
                  <p className="status-line">
                    Last check:{" "}
                    {state.players.find((p) => p.id === state.seerResult!.targetId)?.name || "?"} —{" "}
                    {state.seerResult.isWolf ? "WEREWOLF" : "not a werewolf"}
                  </p>
                ) : null}
                {state.phase === "night_witch" && me.role === "witch" && state.wolfTarget ? (
                  <p className="status-line">
                    Marked tonight: {state.players.find((p) => p.id === state.wolfTarget)?.name || "?"}
                  </p>
                ) : null}
              </div>

              <ul className="wolf-roster">
                {state.players.map((p) => (
                  <li key={p.id} className={`wolf-seat ${p.alive ? "alive" : "dead"} tone-${roleTone(p.role)}`}>
                    <SeatTalk playerId={p.id} name={p.name} />
                    <span>
                      {!p.alive ? "out" : p.id === me.id ? roleLabel(p.role) : p.role ? roleLabel(p.role) : "alive"}
                      {p.voteFor ? " · voted" : ""}
                      {state.wolfVotes[p.id] && me.role === "werewolf" ? " · marked" : ""}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="wolf-actions">
                {myWolfTurn ? (
                  <>
                    <p>Pick a villager to attack tonight.</p>
                    <div className="row-actions" style={{ flexWrap: "wrap", justifyContent: "center" }}>
                      {alive
                        .filter((p) => p.role !== "werewolf" && p.id !== me.id)
                        .map((p) => (
                          <button
                            key={p.id}
                            className="btn"
                            type="button"
                            onClick={() => act({ type: "wolf_kill", targetId: p.id })}
                          >
                            {p.name}
                          </button>
                        ))}
                    </div>
                  </>
                ) : null}

                {mySeerTurn ? (
                  <>
                    <p>Check one living player.</p>
                    <div className="row-actions" style={{ flexWrap: "wrap", justifyContent: "center" }}>
                      {alive
                        .filter((p) => p.id !== me.id)
                        .map((p) => (
                          <button
                            key={p.id}
                            className="btn"
                            type="button"
                            onClick={() => act({ type: "seer_check", targetId: p.id })}
                          >
                            {p.name}
                          </button>
                        ))}
                    </div>
                  </>
                ) : null}

                {myWitchTurn ? (
                  <>
                    <p>Save the marked player, poison someone, both, or pass.</p>
                    <div className="row-actions" style={{ flexWrap: "wrap", justifyContent: "center" }}>
                      {state.witchSaveLeft && state.wolfTarget ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => act({ type: "witch", save: true, poisonId: poisonPick })}
                        >
                          Save{poisonPick ? " + poison" : ""}
                        </button>
                      ) : null}
                      {state.witchPoisonLeft ? (
                        <select
                          className="wolf-select"
                          value={poisonPick ?? ""}
                          onChange={(e) => setPoisonPick(e.target.value || null)}
                        >
                          <option value="">Poison…</option>
                          {alive
                            .filter((p) => p.id !== me.id)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      ) : null}
                      {state.witchPoisonLeft && poisonPick ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => act({ type: "witch", poisonId: poisonPick })}
                        >
                          Poison only
                        </button>
                      ) : null}
                      <button className="btn btn-ghost" type="button" onClick={() => act({ type: "witch" })}>
                        Pass
                      </button>
                    </div>
                  </>
                ) : null}

                {canDawn ? (
                  <div className="row-actions" style={{ justifyContent: "center" }}>
                    <button className="btn" type="button" onClick={() => act({ type: "to_vote" })}>
                      Proceed to vote
                    </button>
                  </div>
                ) : null}

                {myVoteTurn ? (
                  <>
                    <p>Vote someone out.</p>
                    <div className="row-actions" style={{ flexWrap: "wrap", justifyContent: "center" }}>
                      {alive
                        .filter((p) => p.id !== me.id)
                        .map((p) => (
                          <button
                            key={p.id}
                            className="btn"
                            type="button"
                            onClick={() => act({ type: "vote", targetId: p.id })}
                          >
                            {p.name}
                          </button>
                        ))}
                    </div>
                  </>
                ) : null}

                {state.phase === "over" ? (
                  <p className="status-line">
                    {forfeitText(state) || (state.winner === "wolves" ? "Pack takes the village." : "The village holds.")}
                  </p>
                ) : null}

                {!myWolfTurn &&
                !mySeerTurn &&
                !myWitchTurn &&
                !canDawn &&
                !myVoteTurn &&
                state.phase !== "over" ? (
                  <p className="status-line">Waiting for other players…</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
