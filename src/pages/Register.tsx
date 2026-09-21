import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GithubButton } from "../components/GithubButton";

export function Register() {
  const { register, verify, live } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setErr(false);
    try {
      const res = await register(email.trim().toLowerCase(), password);
      setNeedCode(true);
      setMsg(res.hint || "A code was sent to your email.");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "Registration failed");
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setErr(false);
    try {
      await verify(email.trim().toLowerCase(), code.trim());
      nav("/account");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "Verification failed");
    }
  }

  return (
    <div className="auth-wrap">
      <p className="kicker">{live ? "Live API" : "Local mock"}</p>
      <h1>Register</h1>
      <p className="lede">Or continue with GitHub to create an account in one step.</p>
      <div className="row-actions" style={{ marginBottom: 18 }}>
        <GithubButton />
      </div>
      {!needCode ? (
        <form onSubmit={onRegister}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="row-actions">
            <button className="btn" type="submit">
              Send code
            </button>
            <Link to="/login" className="btn btn-ghost">
              Log in
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={onVerify}>
          <div className="field">
            <label>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required />
          </div>
          <div className="row-actions">
            <button className="btn" type="submit">
              Verify
            </button>
          </div>
        </form>
      )}
      <p className={`msg ${err ? "err" : "ok"}`}>{msg}</p>
    </div>
  );
}
