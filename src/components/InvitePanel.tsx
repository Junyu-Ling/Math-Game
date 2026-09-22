import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";
import { GAME_LABEL } from "../lib/lobby";
import { Avatar } from "./Avatar";

export function InviteList({ game, meta }: { game: string; meta?: Record<string, unknown> }) {
  const { user } = useAuth();
  const { online, error, invite, room, store, inviteCooldownMs } = useLobby();
  const tableWait =
    Boolean(room && ["guandan", "coda", "uno", "flip7"].includes(room.game) && (room.view as { phase?: string } | undefined)?.phase === "lobby");
  const host = Boolean(user && room?.seats?.[0] === user.id);
  const seated = new Set(room?.seats || []);
  const cooling = inviteCooldownMs > 0;
  const waitSec = Math.ceil(inviteCooldownMs / 1000);
  const canInviteMore = (!room || (tableWait && host && seated.size < 4)) && !cooling;

  if (!user) {
    return (
      <div className="invite-dock">
        <Link className="btn" to="/login">
          Log in to invite
        </Link>
      </div>
    );
  }

  return (
    <div className="invite-dock">
      {error ? <p className="msg err">{error}</p> : null}
      {store === "memory" ? (
        <p>Lobby is in-memory. Set REDIS_URL in production so accounts can see each other.</p>
      ) : null}
      {game === "guandan" ? <p>Guandan needs four players. Host invites three people; the deal starts at 4/4.</p> : null}
      {game === "coda" ? <p>Da Vinci Code is 2–4 players. Everyone picks black/white, then ready. Host can invite more before that.</p> : null}
      {game === "uno" ? <p>UNO is 2–4 players. Host invites, then starts the deal.</p> : null}
      {game === "flip7" ? <p>Flip 7 is 1–4 players. Host invites, then starts.</p> : null}
      {tableWait ? <p>Seated {seated.size}/4.</p> : null}
      {online.length === 0 ? (
        <p>No other accounts yet. Anyone who registers or logs in will appear here, even when they are offline.</p>
      ) : (
        online.map((p) => {
          const live = p.online !== false;
          return (
          <div key={p.id} className="person-row">
            <Avatar src={p.avatar} name={p.name} />
            <span className="person-name">
              {p.name}
              <em className={`presence ${live ? "on" : "off"}`}>{live ? "Online" : "Offline"}</em>
            </span>
            <button
              className="btn"
              type="button"
              disabled={!canInviteMore || !live || Boolean(p.roomId) || seated.has(p.id)}
              onClick={() => void invite(p.id, game, meta).catch((ex) => alert(ex.message))}
            >
              {live ? (cooling ? `Invite (${waitSec})` : "Invite") : "Offline"}
            </button>
          </div>
          );
        })
      )}
    </div>
  );
}

export function InvitePanel({ game, meta }: { game: string; meta?: Record<string, unknown> }) {
  const { user } = useAuth();
  const { invites, room, respond, leave } = useLobby();
  const incoming = invites.filter((i) => i.toId === user?.id);
  const outgoing = invites.filter((i) => i.fromId === user?.id);

  return (
    <aside className="side" id="invite-panel">
      <div>
        <h3>Players</h3>
        <InviteList game={game} meta={meta} />
      </div>
      {incoming.length > 0 ? (
        <div>
          <h3>Incoming</h3>
          {incoming.map((i) => (
            <div key={i.id} className="person-row" style={{ marginBottom: 8 }}>
              <Avatar src={i.fromAvatar} name={i.fromName} />
              <span className="person-name">
                {i.fromName} · {GAME_LABEL[i.game] || i.game}
              </span>
              <button className="btn" type="button" onClick={() => void respond(i.id, true)}>
                Accept
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void respond(i.id, false)}>
                Decline
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {outgoing.length > 0 ? (
        <div>
          <h3>Sent</h3>
          {outgoing.map((i) => (
            <div key={i.id} className="person-row">
              <Avatar src={i.toAvatar} name={i.toName} />
              <p>
                Waiting for {i.toName} · {GAME_LABEL[i.game] || i.game}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {room ? (
        <div className="row-actions">
          <button className="btn btn-ghost" type="button" onClick={() => void leave()}>
            Leave table
          </button>
        </div>
      ) : null}
    </aside>
  );
}
