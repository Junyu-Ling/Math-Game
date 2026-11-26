import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthFrame, CodeBoxes } from "../components/AuthFrame";
import { GithubButton } from "../components/GithubButton";
import { GoogleButton } from "../components/GoogleButton";
import { useAuth } from "../context/AuthContext";

function oauthError(provider: "GitHub" | "Google", code: string) {
  const messages: Record<string, string> = {
    config: `${provider} sign-in is not available right now.`,
    denied: `${provider} sign-in was cancelled.`,
    missing_code: `${provider} did not finish sign-in.`,
    bad_state: "That sign-in expired. Try again.",
    server: `${provider} sign-in failed. Try again.`,
    missing_token: "Sign-in did not come back. Try again.",
  };
  return messages[code] || "";
}

export function Login() {
  const { login, requestEmailCode, loginWithCode } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const googleError = params.get("google_error") || "";
  const githubError = params.get("gh_error") || "";
  const [msg, setMsg] = useState(googleError ? oauthError("Google", googleError) : oauthError("GitHub", githubError));
  const [err, setErr] = useState(Boolean(googleError || githubError));
  const cooldownSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  function switchMode(next: "password" | "code") {
    setMode(next);
    setSent(false);
    setCode("");
    setMsg("");
    setErr(false);
  }

  async function onPassword(event: FormEvent) {
    event.preventDefault();
    setMsg("");
    setErr(false);
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      nav("/account");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function onSendCode(event: { preventDefault(): void }) {
    event.preventDefault();
    if (busy || cooldownSec > 0) return;
    setMsg("");
    setErr(false);
    setBusy(true);
    try {
      const res = await requestEmailCode(email.trim().toLowerCase());
      setSent(true);
      setCooldownUntil(Date.now() + (res.cooldownSec ?? 60) * 1000);
      setNow(Date.now());
      setMsg("Code sent. It expires in 10 minutes.");
    } catch (ex) {
      setErr(true);
      const text = ex instanceof Error ? ex.message : "Could not send the code";
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

  async function onCodeLogin(event: FormEvent) {
    event.preventDefault();
    setMsg("");
    setErr(false);
    setBusy(true);
    try {
      await loginWithCode(email.trim().toLowerCase(), code.trim());
      nav("/account");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Welcome back"
      lede="Sign in to sit at a table, watch a friend, and keep your last 100 games."
      foot={
        <>
          New here? <Link to="/register">Create an account</Link>
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
      <div className="auth-seg" role="tablist" aria-label="Sign-in method">
        <button type="button" role="tab" aria-selected={mode === "password"} className={mode === "password" ? "is-on" : ""} onClick={() => switchMode("password")}>
          Password
        </button>
        <button type="button" role="tab" aria-selected={mode === "code"} className={mode === "code" ? "is-on" : ""} onClick={() => switchMode("code")}>
          Email code
        </button>
      </div>
      {mode === "password" ? (
        <form onSubmit={onPassword}>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <div className="field-secret">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button type="button" className="field-reveal" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <button className="btn auth-submit" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form onSubmit={sent ? onCodeLogin : onSendCode}>
          <div className="field">
            <label htmlFor="code-email">Email</label>
            <input
              id="code-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSent(false);
                setCode("");
              }}
              required
            />
          </div>
          {sent ? (
            <div className="field">
              <label>Code</label>
              <CodeBoxes value={code} onChange={setCode} />
            </div>
          ) : null}
          <button className="btn auth-submit" type="submit" disabled={busy || (!sent && cooldownSec > 0) || (sent && code.length < 6)}>
            {sent ? (busy ? "Signing in…" : "Sign in") : cooldownSec > 0 ? `Send code in ${cooldownSec}s` : busy ? "Sending…" : "Send code"}
          </button>
          {sent ? (
            <button className="auth-text" type="button" disabled={busy || cooldownSec > 0} onClick={onSendCode}>
              {cooldownSec > 0 ? `Resend in ${cooldownSec}s` : "Resend code"}
            </button>
          ) : null}
        </form>
      )}
      {msg ? <p className={`auth-note${err ? " is-err" : ""}`}>{msg}</p> : null}
    </AuthFrame>
  );
}
