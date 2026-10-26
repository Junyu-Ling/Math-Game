import { type ReactNode } from "react";
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
import { isPathOpen } from "./lib/weeks";

function WeekGate({ path, children }: { path: string; children: ReactNode }) {
  if (!isPathOpen(path)) return <Navigate to="/" replace />;
  return children;
}

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
            <Route path="/play/davinci" element={<WeekGate path="/play/davinci"><DaVinciPage /></WeekGate>} />
            <Route path="/play/flip7" element={<WeekGate path="/play/flip7"><Flip7Page /></WeekGate>} />
            <Route path="/play/blackjack" element={<WeekGate path="/play/blackjack"><BlackjackPage /></WeekGate>} />
            {/* Deferred — Make 24: /play/24 */}
            <Route path="/play/holdem" element={<WeekGate path="/play/holdem"><HoldemPage /></WeekGate>} />
            <Route path="/play/uno" element={<WeekGate path="/play/uno"><UnoPage /></WeekGate>} />
            <Route path="/play/halli" element={<WeekGate path="/play/halli"><HalliGalliPage /></WeekGate>} />
            <Route path="/play/ecard" element={<WeekGate path="/play/ecard"><EcardPage /></WeekGate>} />
            <Route path="/play/gomoku" element={<WeekGate path="/play/gomoku"><GomokuPage /></WeekGate>} />
            {/* Deferred — Werewolf: /play/werewolf */}
            <Route path="/play/roulette" element={<WeekGate path="/play/roulette"><RoulettePage /></WeekGate>} />
            <Route path="/play/slots" element={<WeekGate path="/play/slots"><SlotsPage /></WeekGate>} />
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
