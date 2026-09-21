import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function AuthCallback() {
  const { acceptToken } = useAuth();
  const nav = useNavigate();
  const [msg, setMsg] = useState("正在完成 GitHub 登录…");
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const raw = window.location.hash.replace(/^#/, "");
    const token = new URLSearchParams(raw).get("token");
    if (!token) {
      nav("/login?gh_error=missing_token", { replace: true });
      return;
    }
    acceptToken(token)
      .then(() => nav("/account", { replace: true }))
      .catch(() => {
        setMsg("登录失败，请重试。");
        nav("/login?gh_error=server", { replace: true });
      });
  }, [acceptToken, nav]);

  return (
    <div className="auth-wrap">
      <p className="kicker">GITHUB</p>
      <h1>登录中</h1>
      <p className="lede">{msg}</p>
    </div>
  );
}
