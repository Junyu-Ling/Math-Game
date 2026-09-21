import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Account() {
  const { user, live } = useAuth();
  if (!user) {
    return (
      <div className="page">
        <p className="kicker">Account</p>
        <h1>Not signed in</h1>
        <p className="lede">Log in to invite online players to a duel.</p>
        <div className="row-actions">
          <Link className="btn" to="/login">
            Log in
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <p className="kicker">{live ? "Live" : "Mock store"}</p>
      <h1>{user.name || user.login || user.email}</h1>
      <p className="lede">
        {user.provider === "github" || user.githubId
          ? `GitHub @${user.login || user.email}. Chips stay on this account.`
          : "Account ready. Invite someone who is online."}
      </p>
      <div className="account-grid">
        <div className="stat">
          <span>Chips</span>
          <b>{user.chips}</b>
        </div>
        <div className="stat">
          <span>Since</span>
          <b>{new Date(user.createdAt).toISOString().slice(0, 10)}</b>
        </div>
        <div className="stat">
          <span>ID</span>
          <b style={{ fontSize: 16, fontFamily: "Inter, sans-serif" }}>{user.id}</b>
        </div>
        <div className="stat">
          <span>Next</span>
          <b style={{ fontSize: 16 }}>Invite</b>
        </div>
      </div>
    </div>
  );
}
