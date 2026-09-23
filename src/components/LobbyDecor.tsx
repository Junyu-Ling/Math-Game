import { MahjongTile } from "./MahjongTile";
import { FlipFace, PokerFace, UnoFace } from "./PlayingCard";
import type { FlipCard } from "../games/flip7/engine";
import type { UnoCard } from "../games/uno/engine";
import type { PokerCard } from "../lib/poker";

export type LobbyGame = "coda" | "flip7" | "uno" | "bj" | "holdem" | "m24";

const poker = (id: string, suit: PokerCard["suit"], rank: PokerCard["rank"]): PokerCard => ({ id, suit, rank });

const flip = (id: string, kind: FlipCard["kind"], value?: number): FlipCard => ({ id, kind, value });

const uno = (id: string, color: UnoCard["color"], kind: UnoCard["kind"], value?: number): UnoCard => ({
  id,
  color,
  kind,
  value,
});

export function LobbyDecor({ game }: { game: LobbyGame }) {
  return (
    <div className="lobby-decor" aria-hidden>
      {game === "coda" ? (
        <>
          <span className="decor-card a"><MahjongTile tile={{ color: "black", value: 11, revealed: true }} hide={false} /></span>
          <span className="decor-card b"><MahjongTile tile={{ color: "white", value: 4, revealed: true }} hide={false} /></span>
          <span className="decor-card c"><MahjongTile tile={{ color: "black", value: "joker", revealed: true }} hide={false} /></span>
          <span className="decor-card d"><MahjongTile tile={{ color: "white", value: 8, revealed: true }} hide={false} /></span>
        </>
      ) : null}
      {game === "flip7" ? (
        <>
          <span className="decor-card a"><FlipFace card={flip("f7", "number", 7)} /></span>
          <span className="decor-card b"><FlipFace card={flip("f12", "number", 12)} /></span>
          <span className="decor-card c"><FlipFace card={flip("ff", "freeze")} /></span>
          <span className="decor-card d"><FlipFace card={flip("f3", "number", 3)} /></span>
        </>
      ) : null}
      {game === "uno" ? (
        <>
          <span className="decor-card a"><UnoFace card={uno("ur", "red", "number", 7)} /></span>
          <span className="decor-card b"><UnoFace card={uno("ub", "blue", "skip")} /></span>
          <span className="decor-card c"><UnoFace card={uno("uy", "yellow", "reverse")} /></span>
          <span className="decor-card d"><UnoFace card={uno("ug", "green", "number", 2)} /></span>
        </>
      ) : null}
      {game === "bj" ? (
        <>
          <span className="decor-card a"><PokerFace card={poker("ba", "S", "A")} /></span>
          <span className="decor-card b"><PokerFace card={poker("bk", "H", "K")} /></span>
          <span className="decor-card c"><PokerFace card={poker("b10", "D", "10")} /></span>
          <span className="decor-card d"><PokerFace card={poker("b7", "C", "7")} /></span>
        </>
      ) : null}
      {game === "holdem" ? (
        <>
          <span className="decor-card a"><PokerFace card={poker("ha", "S", "A")} /></span>
          <span className="decor-card b"><PokerFace card={poker("hah", "H", "A")} /></span>
          <span className="decor-card c"><PokerFace card={poker("hk", "S", "K")} /></span>
          <span className="decor-card d"><PokerFace card={poker("hkh", "H", "K")} /></span>
        </>
      ) : null}
      {game === "m24" ? (
        <>
          <span className="decor-card a"><PokerFace card={poker("m8", "S", "8")} /></span>
          <span className="decor-card b"><PokerFace card={poker("m3", "H", "3")} /></span>
          <span className="decor-card c"><PokerFace card={poker("m3d", "D", "3")} /></span>
          <span className="decor-card d"><PokerFace card={poker("m4", "C", "4")} /></span>
        </>
      ) : null}
    </div>
  );
}
