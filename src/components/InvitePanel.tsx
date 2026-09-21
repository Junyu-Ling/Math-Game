import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";

const LABELS: Record<string, string> = {
  coda: "达芬奇",
  flip7: "七翻天",
  bj: "二十一点",
  m24: "二十四点",
};

export function InvitePanel({ game, meta }: { game: string; meta?: Record<string, unknown> }) {
  const { user } = useAuth();
  const { online, invites, room, error, invite, respond, leave } = useLobby();
  const incoming = invites.filter((i) => i.toId === user?.id);
  const outgoing = invites.filter((i) => i.fromId === user?.id);

  if (!user) {
    return (
      <aside className="side">
        <h3>对战</h3>
        <p>
          登录后可邀请在线玩家。请先 <Link to="/login">登录</Link>。
        </p>
      </aside>
    );
  }

  return (
    <aside className="side">
      <div>
        <h3>在线</h3>
        {error ? <p className="msg err">{error}</p> : null}
        {online.length === 0 ? <p>暂无其他在线玩家。</p> : null}
        {online.map((p) => (
          <div key={p.id} className="row-actions" style={{ marginBottom: 8 }}>
            <span>{p.name}</span>
            <button
              className="btn btn-gold"
              type="button"
              disabled={Boolean(room || p.roomId)}
              onClick={() => void invite(p.id, game, meta).catch((ex) => alert(ex.message))}
            >
              邀请
            </button>
          </div>
        ))}
      </div>
      {incoming.length > 0 ? (
        <div>
          <h3>邀请你</h3>
          {incoming.map((i) => (
            <div key={i.id} className="row-actions" style={{ marginBottom: 8 }}>
              <span>
                {i.fromName} · {LABELS[i.game] || i.game}
              </span>
              <button className="btn" type="button" onClick={() => void respond(i.id, true)}>
                接受
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void respond(i.id, false)}>
                拒绝
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {outgoing.length > 0 ? (
        <div>
          <h3>已发出</h3>
          {outgoing.map((i) => (
            <p key={i.id}>
              等待 {i.toName} 接受{LABELS[i.game] || i.game}
            </p>
          ))}
        </div>
      ) : null}
      {room ? (
        <div className="row-actions">
          <button className="btn btn-ghost" type="button" onClick={() => void leave()}>
            离开对局
          </button>
        </div>
      ) : null}
    </aside>
  );
}
