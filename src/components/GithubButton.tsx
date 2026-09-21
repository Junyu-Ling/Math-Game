import { useAuth } from "../context/AuthContext";
import { IconGithub } from "./Icons";

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
    <button className="btn btn-icon" type="button" onClick={go}>
      <IconGithub />
      Continue with GitHub
    </button>
  );
}
