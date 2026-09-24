import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GithubButton } from "../components/GithubButton";
import { IconMail } from "../components/Icons";

export function Register() {
  const { register, verify, live } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const cooldownSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    if (busy || cooldownSec > 0) return;
    setErr(false);
    setBusy(true);
    try {
      const res = await register(email.trim().toLowerCase(), password);
      setNeedCode(true);
      setCooldownUntil(Date.now() + (res.cooldownSec ?? 60) * 1000);
      setNow(Date.now());
      setMsg(res.hint || "A code was sent to your email.");
    } catch (ex) {
      setErr(true);
      const text = ex instanceof Error ? ex.message : "Registration failed";
      setMsg(text);
      const wait = text.match(/Wait (\d+)s/i);
      if (wait) {
        setCooldownUntil(Date.now() + Number(wait[1]) * 1000);
        setNow(Date.now());
      }
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setErr(false);
    setBusy(true);
    try {
      await verify(email.trim().toLowerCase(), code.trim());
      nav("/account");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <p className="kicker">{live ? "Live API" : "Local mock"}</p>
      <h1>Register</h1>
      <p className="lede">Or continue with GitHub to create an account in one step.</p>
      <div className="auth-method">
        <GithubButton />
      </div>
      <p className="auth-or">or email</p>
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
            <button className="btn btn-icon" type="submit" disabled={busy || cooldownSec > 0}>
              <IconMail />
              {cooldownSec > 0 ? `Send code (${cooldownSec}s)` : "Send code"}
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
            <button className="btn" type="submit" disabled={busy}>
              Verify
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy || cooldownSec > 0}
              onClick={() => void onRegister({ preventDefault() {} } as FormEvent)}
            >
              {cooldownSec > 0 ? `Resend (${cooldownSec}s)` : "Resend"}
            </button>
          </div>
        </form>
      )}
      <p className={`msg ${err ? "err" : "ok"}`}>{msg}</p>
    </div>
  );
}
