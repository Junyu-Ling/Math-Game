import { useAuth } from "../context/AuthContext";

export function GithubButton() {
  const { githubStartUrl, live } = useAuth();

  function go() {
    if (!live || !githubStartUrl) {
      window.alert("GitHub 登录需要 LIVE API。请配置 VITE_API_URL 并启动 server/。");
      return;
    }
    window.location.href = githubStartUrl;
  }

  return (
    <button className="btn" type="button" onClick={go}>
      使用 GitHub 登录
    </button>
  );
}
