import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";

const LABELS: Record<string, string> = {
  coda: "Coda",
  flip7: "Flip 7",
  bj: "Blackjack",
  m24: "Make 24",
  uno: "UNO",
};

export function InviteList({ game, meta }: { game: string; meta?: Record<string, unknown> }) {
  const { user } = useAuth();
  const { online, error, invite, room, store } = useLobby();

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
      {online.length === 0 ? (
        <>
          <button className="btn" type="button" disabled>
            Invite
          </button>
          <p>You are online. When another signed-in player opens this game, Invite will unlock.</p>
        </>
      ) : (
        online.map((p) => (
          <div key={p.id} className="row-actions" style={{ justifyContent: "center", marginBottom: 8 }}>
            <span>{p.name}</span>
            <button
              className="btn"
              type="button"
              disabled={Boolean(room || p.roomId)}
              onClick={() => void invite(p.id, game, meta).catch((ex) => alert(ex.message))}
            >
              Invite {p.name}
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
            <div key={i.id} className="row-actions" style={{ marginBottom: 8 }}>
              <span>
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
            <p key={i.id}>
              Waiting for {i.toName} · {LABELS[i.game] || i.game}
            </p>
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
