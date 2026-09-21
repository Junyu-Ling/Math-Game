import { GAME_LABEL } from "../lib/lobby";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";
import { Avatar } from "./Avatar";

export function InviteToasts() {
  const { user } = useAuth();
  const { invites, respond } = useLobby();
  if (!user) return null;
  const incoming = invites.filter((i) => i.toId === user.id);
  if (!incoming.length) return null;

  return (
    <div className="invite-toasts" role="region" aria-label="Game invites">
      {incoming.map((i) => (
        <div key={i.id} className="invite-toast">
          <div className="invite-toast-head">
            <Avatar src={i.fromAvatar} name={i.fromName} size={36} />
            <p>
              <strong>{i.fromName}</strong> invited you to play {GAME_LABEL[i.game] || i.game}.
            </p>
          </div>
          <div className="invite-toast-actions">
            <button className="btn" type="button" onClick={() => void respond(i.id, true)}>
              Accept
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => void respond(i.id, false)}>
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
