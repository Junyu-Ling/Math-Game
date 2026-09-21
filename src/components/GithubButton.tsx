import { useAuth } from "../context/AuthContext";

export function GithubButton() {
  const { githubStartUrl, live } = useAuth();

  function go() {
    if (!live || !githubStartUrl) {
      window.alert("GitHub login needs the live API. Set VITE_API_URL and start server/.");
      return;
    }
    window.location.href = githubStartUrl;
  }

  return (
    <button className="btn" type="button" onClick={go}>
      Continue with GitHub
    </button>
  );
}
