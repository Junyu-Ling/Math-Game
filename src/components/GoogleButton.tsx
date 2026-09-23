import { useAuth } from "../context/AuthContext";
import { IconGoogle } from "./Icons";

export function GoogleButton() {
  const { googleStartUrl, live } = useAuth();

  function go() {
    if (!live || !googleStartUrl) {
      window.alert("Google login needs the live API. Set VITE_API_URL and start server/.");
      return;
    }
    window.location.href = googleStartUrl;
  }

  return (
    <button className="btn btn-icon btn-google" type="button" onClick={go}>
      <IconGoogle />
      Continue with Google
    </button>
  );
}
