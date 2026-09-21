import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Account() {
  const { user, live } = useAuth();
  if (!user) {
    return (
      <div className="page">
        <p className="kicker">ACCOUNT</p>
        <h1>未登录</h1>
        <p className="lede">登录后筹码会跟着邮箱走，匹配上线时同一套余额。</p>
        <div className="row-actions">
          <Link className="btn" to="/login">
            LOGIN
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <p className="kicker">{live ? "LIVE" : "MOCK STORE"}</p>
      <h1>{user.name || user.login || user.email}</h1>
      <p className="lede">
        {user.provider === "github" || user.githubId
          ? `GitHub 账号 @${user.login || user.email}。筹码跟这个正式账号走。`
          : "账号已建立。达芬奇可登录后匹配联机；筹码跟这套账号走。"}
      </p>
      <div className="account-grid">
        <div className="stat">
          <span>CHIPS</span>
          <b>{user.chips}</b>
        </div>
        <div className="stat">
          <span>SINCE</span>
          <b>{new Date(user.createdAt).toISOString().slice(0, 10)}</b>
        </div>
        <div className="stat">
          <span>ID</span>
          <b style={{ fontSize: 16, fontFamily: "IBM Plex Mono, monospace" }}>{user.id}</b>
        </div>
        <div className="stat">
          <span>NEXT</span>
          <b style={{ fontSize: 16 }}>MATCH QUEUE</b>
        </div>
      </div>
    </div>
  );
}
