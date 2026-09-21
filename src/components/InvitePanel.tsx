import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";
import { Avatar } from "./Avatar";

const LABELS: Record<string, string> = {
  coda: "Coda",
  flip7: "Flip 7",
  bj: "Blackjack",
  m24: "Make 24",
  holdem: "Hold’em",
  guandan: "Guandan",
  uno: "UNO",
};

export function InviteList({ game, meta }: { game: string; meta?: Record<string, unknown> }) {
  const { user } = useAuth();
  const { online, error, invite, room, store } = useLobby();
  const gdWait = room?.game === "guandan" && (room.view as { phase?: string } | undefined)?.phase === "lobby";
  const host = Boolean(user && room?.seats?.[0] === user.id);
  const seated = new Set(room?.seats || []);
  const canInviteMore = !room || (gdWait && host && seated.size < 4);

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
      {gdWait ? <p>Seated {seated.size}/4.</p> : null}
      {online.length === 0 ? (
        <>
          <button className="btn" type="button" disabled>
            Invite
          </button>
          <p>You are online. When another signed-in player opens this game, Invite will unlock.</p>
        </>
      ) : (
        online.map((p) => (
          <div key={p.id} className="person-row">
            <Avatar src={p.avatar} name={p.name} />
            <span className="person-name">{p.name}</span>
            <button
              className="btn"
              type="button"
              disabled={!canInviteMore || Boolean(p.roomId) || seated.has(p.id)}
              onClick={() => void invite(p.id, game, meta).catch((ex) => alert(ex.message))}
            >
              Invite
            </button>
          </div>
        ))
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
        <h3>Invite</h3>
        <InviteList game={game} meta={meta} />
      </div>
      {incoming.length > 0 ? (
        <div>
          <h3>Incoming</h3>
          {incoming.map((i) => (
            <div key={i.id} className="person-row" style={{ marginBottom: 8 }}>
              <Avatar src={i.fromAvatar} name={i.fromName} />
              <span className="person-name">
                {i.fromName} · {LABELS[i.game] || i.game}
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
                Waiting for {i.toName} · {LABELS[i.game] || i.game}
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
