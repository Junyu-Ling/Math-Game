import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const { login, live } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr(false);
    try {
      await login(email.trim().toLowerCase(), password);
      nav("/account");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "登录失败");
    }
  }

  return (
    <div className="auth-wrap">
      <p className="kicker">{live ? "LIVE API" : "LOCAL MOCK"}</p>
      <h1>登录</h1>
      <p className="lede">仅邮箱。演示账号 player1@axiom.local / axiom123（需 LIVE API + Redis）。</p>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>EMAIL</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>PASSWORD</label>
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
            ENTER
          </button>
          <Link to="/register" className="btn btn-ghost">
            REGISTER
          </Link>
        </div>
        <p className={`msg ${err ? "err" : ""}`}>{msg}</p>
      </form>
    </div>
  );
}
