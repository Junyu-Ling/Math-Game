import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GithubButton } from "../components/GithubButton";
import { GoogleButton } from "../components/GoogleButton";
import { IconMail } from "../components/Icons";

function oauthError(provider: "GitHub" | "Google", code: string) {
  const messages: Record<string, string> = {
    config: `${provider} login is not configured. Add the client id and secret, then restart the API.`,
    denied: `${provider} authorization was cancelled.`,
    missing_code: `${provider} did not return a code.`,
    bad_state: "Login state expired. Try again.",
    server: `${provider} login failed. Try again.`,
    missing_token: "No login token received.",
  };
  return messages[code] || "";
}

export function Login() {
  const { login, requestEmailCode, loginWithCode, live } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const googleError = params.get("google_error") || "";
  const githubError = params.get("gh_error") || "";
  const [msg, setMsg] = useState(
    googleError ? oauthError("Google", googleError) : oauthError("GitHub", githubError),
  );
  const [err, setErr] = useState(Boolean(googleError || githubError));

  function switchMode(next: "password" | "code") {
    setMode(next);
    setSent(false);
    setCode("");
    setMsg("");
    setErr(false);
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr(false);
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      nav("/account");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSendCode(e: { preventDefault(): void }) {
    e.preventDefault();
    setMsg("");
    setErr(false);
    setBusy(true);
    try {
      const res = await requestEmailCode(email.trim().toLowerCase());
      setSent(true);
      setMsg(res.hint || "Check your email for the code.");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function onCodeLogin(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr(false);
    setBusy(true);
    try {
      await loginWithCode(email.trim().toLowerCase(), code.trim());
      nav("/account");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <p className="kicker">{live ? "Live API" : "Local mock"}</p>
      <h1>Log in</h1>
      <p className="lede">Use Google, GitHub, a password, or a code sent to your email.</p>
      <div className="auth-method">
        <GoogleButton />
        <GithubButton />
      </div>
      <p className="auth-or">or email</p>
      <div className="auth-switch">
        <button
          type="button"
          className={`btn btn-ghost${mode === "password" ? " on" : ""}`}
          onClick={() => switchMode("password")}
        >
          Password
        </button>
        <button
          type="button"
          className={`btn btn-ghost${mode === "code" ? " on" : ""}`}
          onClick={() => switchMode("code")}
        >
          Email code
        </button>
      </div>
      {mode === "password" ? (
        <form onSubmit={onPassword}>
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
            <button className="btn btn-icon" type="submit" disabled={busy}>
              <IconMail />
              Enter
            </button>
            <Link to="/register" className="btn btn-ghost">
              Register
            </Link>
          </div>
          <p className={`msg ${err ? "err" : ""}`}>{msg}</p>
        </form>
      ) : (
        <form onSubmit={sent ? onCodeLogin : onSendCode}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSent(false);
              }}
              required
            />
          </div>
          {sent ? (
            <div className="field">
              <label>Code</label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
          ) : null}
          <div className="row-actions">
            <button className="btn btn-icon" type="submit" disabled={busy}>
              <IconMail />
              {sent ? "Log in" : "Send code"}
            </button>
            {sent ? (
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={onSendCode}>
                Resend
              </button>
            ) : (
              <Link to="/register" className="btn btn-ghost">
                Register
              </Link>
            )}
          </div>
          <p className={`msg ${err ? "err" : "ok"}`}>{msg}</p>
        </form>
      )}
    </div>
  );
}
