import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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
      setMsg(res.hint || "验证码已发到邮箱。");
    } catch (ex) {
      setErr(true);
      setMsg(ex instanceof Error ? ex.message : "注册失败");
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
      setMsg(ex instanceof Error ? ex.message : "验证失败");
    }
  }

  return (
    <div className="auth-wrap">
      <p className="kicker">{live ? "LIVE API" : "LOCAL MOCK"}</p>
      <h1>注册</h1>
      <p className="lede">邮箱 + 密码。第二步填写 6 位验证码。本地模式验证码为 000000。</p>
      {!needCode ? (
        <form onSubmit={onRegister}>
          <div className="field">
            <label>EMAIL</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>PASSWORD</label>
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
              SEND CODE
            </button>
            <Link to="/login" className="btn btn-ghost">
              LOGIN
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={onVerify}>
          <div className="field">
            <label>CODE</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required />
          </div>
          <div className="row-actions">
            <button className="btn" type="submit">
              VERIFY
            </button>
          </div>
        </form>
      )}
      <p className={`msg ${err ? "err" : "ok"}`}>{msg}</p>
    </div>
  );
}
