import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LobbyProvider } from "./context/LobbyContext";
import { Shell } from "./components/Shell";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { AuthCallback } from "./pages/AuthCallback";
import { Register } from "./pages/Register";
import { Account } from "./pages/Account";
import { DaVinciPage } from "./games/davinci/DaVinciPage";
import { Flip7Page } from "./games/flip7/Flip7Page";
import { BlackjackPage } from "./games/blackjack/BlackjackPage";
import { Math24Page } from "./games/math24/Math24Page";
import { HoldemPage } from "./games/holdem/HoldemPage";
import { UnoPage } from "./games/uno/UnoPage";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <LobbyProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/register" element={<Register />} />
            <Route path="/account" element={<Account />} />
            <Route path="/play/davinci" element={<DaVinciPage />} />
            <Route path="/play/flip7" element={<Flip7Page />} />
            <Route path="/play/blackjack" element={<BlackjackPage />} />
            <Route path="/play/24" element={<Math24Page />} />
            <Route path="/play/holdem" element={<HoldemPage />} />
            <Route path="/play/uno" element={<UnoPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
        </LobbyProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
