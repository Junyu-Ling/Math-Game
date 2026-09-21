import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GithubButton } from "../components/GithubButton";

const GH_ERR: Record<string, string> = {
  config: "未配置 GITHUB_CLIENT_SECRET。请写入 server/.env 后重启后端。",
  denied: "已取消 GitHub 授权。",
  missing_code: "GitHub 未返回授权码。",
  bad_state: "登录状态失效，请再点一次。",
  server: "GitHub 登录失败，请重试。",
  missing_token: "没有收到登录令牌。",
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
      setMsg(ex instanceof Error ? ex.message : "登录失败");
    }
  }

  return (
    <div className="auth-wrap">
      <p className="kicker">{live ? "LIVE API" : "LOCAL MOCK"}</p>
      <h1>登录</h1>
      <p className="lede">正式账号请用 GitHub。邮箱密码和虚拟用户仍可用于本机对战。</p>
      <div className="row-actions" style={{ marginBottom: 18 }}>
        <GithubButton />
      </div>
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
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={async () => {
            setErr(false);
            try {
              await login("player1@axiom.local", "axiom123");
              nav("/play/davinci");
            } catch (ex) {
              setErr(true);
              setMsg(ex instanceof Error ? ex.message : "登录失败");
            }
          }}
        >
          虚拟用户 P1
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={async () => {
            setErr(false);
            try {
              await login("player2@axiom.local", "axiom123");
              nav("/play/davinci");
            } catch (ex) {
              setErr(true);
              setMsg(ex instanceof Error ? ex.message : "登录失败");
            }
          }}
        >
          虚拟用户 P2
        </button>
      </div>
    </div>
  );
}
