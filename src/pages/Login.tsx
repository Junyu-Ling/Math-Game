import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GithubButton } from "../components/GithubButton";

const GH_ERR: Record<string, string> = {
  config: "GITHUB_CLIENT_SECRET is missing. Add it to server/.env and restart.",
  denied: "GitHub authorization was cancelled.",
  missing_code: "GitHub did not return a code.",
  bad_state: "Login state expired. Try again.",
  server: "GitHub login failed. Try again.",
  missing_token: "No login token received.",
};

export function Login() {
  const { login, live } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(GH_ERR[params.get("gh_error") || ""] || "");
  const [err, setErr] = useState(Boolean(params.get("gh_error")));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr(false);
    try {
      await login(email.trim().toLowerCase(), password);
      nav("/account");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "Login failed");
    }
  }

  return (
    <div className="auth-wrap">
      <p className="kicker">{live ? "Live API" : "Local mock"}</p>
      <h1>Log in</h1>
      <p className="lede">Use GitHub for a real account. After that you can invite anyone who is online.</p>
      <div className="row-actions" style={{ marginBottom: 18 }}>
        <GithubButton />
      </div>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="row-actions">
          <button className="btn" type="submit">
            Enter
          </button>
          <Link to="/register" className="btn btn-ghost">
            Register
          </Link>
        </div>
        <p className={`msg ${err ? "err" : ""}`}>{msg}</p>
      </form>
    </div>
  );
}
