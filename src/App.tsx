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
// Deferred — Make 24
// import { Math24Page } from "./games/math24/Math24Page";
import { HoldemPage } from "./games/holdem/HoldemPage";
import { UnoPage } from "./games/uno/UnoPage";
import { HalliGalliPage } from "./games/halligalli/HalliGalliPage";
import { EcardPage } from "./games/ecard/EcardPage";
import { GomokuPage } from "./games/gomoku/GomokuPage";
// Deferred — Werewolf
// import { WerewolfPage } from "./games/werewolf/WerewolfPage";
import { RoulettePage } from "./games/roulette/RoulettePage";
import { SlotsPage } from "./games/slots/SlotsPage";
// Deferred — Flying Chess
// import { LudoPage } from "./games/ludo/LudoPage";
// Deferred: Animal Chess / Army Chess
// import { AnimalPage } from "./games/animal/AnimalPage";
// import { ArmyPage } from "./games/army/ArmyPage";

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
            {/* Deferred — Make 24: /play/24 */}
            <Route path="/play/holdem" element={<HoldemPage />} />
            <Route path="/play/uno" element={<UnoPage />} />
            <Route path="/play/halli" element={<HalliGalliPage />} />
            <Route path="/play/ecard" element={<EcardPage />} />
            <Route path="/play/gomoku" element={<GomokuPage />} />
            {/* Deferred — Werewolf: /play/werewolf */}
            <Route path="/play/roulette" element={<RoulettePage />} />
            <Route path="/play/slots" element={<SlotsPage />} />
            {/* Deferred — Flying Chess: /play/ludo */}
            {/* Deferred: /play/animal, /play/army */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
        </LobbyProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
