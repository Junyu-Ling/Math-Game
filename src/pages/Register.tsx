import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthFrame, CodeBoxes } from "../components/AuthFrame";
import { GithubButton } from "../components/GithubButton";
import { GoogleButton } from "../components/GoogleButton";
import { useAuth } from "../context/AuthContext";

export function Register() {
  const { register, verify } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  async function onRegister(event: { preventDefault(): void }) {
    event.preventDefault();
    if (busy || cooldownSec > 0) return;
    setErr(false);
    setBusy(true);
    try {
      await register(email.trim().toLowerCase(), password);
      setNeedCode(true);
      setCooldownUntil(Date.now() + 60 * 1000);
      setNow(Date.now());
      setMsg("Code sent. It expires in 10 minutes.");
    } catch (ex) {
      setErr(true);
      const text = ex instanceof Error ? ex.message : "Could not create the account";
      setMsg(text);
      const wait = text.match(/Wait (\d+)s/i);
      if (wait?.[1]) {
        setCooldownUntil(Date.now() + Number(wait[1]) * 1000);
        setNow(Date.now());
      }
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault();
    setErr(false);
    setBusy(true);
    try {
      await verify(email.trim().toLowerCase(), code.trim());
      nav("/account");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "That code did not work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Create your account"
      lede="One account for every table, your name and photo, and the games you want to watch again."
      foot={
        <>
          Already playing? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <div className="auth-method">
        <GoogleButton />
        <GithubButton />
      </div>
      <div className="auth-divider">
        <span>or with email</span>
      </div>
      {!needCode ? (
        <form onSubmit={onRegister}>
          <div className="field">
            <label htmlFor="reg-email">Email</label>
            <input id="reg-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="reg-password">Password</label>
            <div className="field-secret">
              <input
                id="reg-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button type="button" className="field-reveal" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <em>At least 6 characters.</em>
          </div>
          <button className="btn auth-submit" type="submit" disabled={busy || cooldownSec > 0 || password.length < 6}>
            {cooldownSec > 0 ? `Send code in ${cooldownSec}s` : busy ? "Sending…" : "Create account"}
          </button>
        </form>
      ) : (
        <form onSubmit={onVerify}>
          <p className="auth-sent">
            Enter the 6-digit code sent to <strong>{email}</strong>
          </p>
          <div className="field">
            <label>Code</label>
            <CodeBoxes value={code} onChange={setCode} />
          </div>
          <button className="btn auth-submit" type="submit" disabled={busy || code.length < 6}>
            {busy ? "Checking…" : "Verify and continue"}
          </button>
          <button className="auth-text" type="button" disabled={busy || cooldownSec > 0} onClick={onRegister}>
            {cooldownSec > 0 ? `Resend in ${cooldownSec}s` : "Resend code"}
          </button>
        </form>
      )}
      {msg ? <p className={`auth-note${err ? " is-err" : ""}`}>{msg}</p> : null}
    </AuthFrame>
  );
}
