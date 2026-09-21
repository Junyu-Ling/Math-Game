import type { ReactNode } from "react";
import type { FlipCard, FlipKind } from "../games/flip7/engine";
import { cardLabel } from "../games/flip7/engine";
import type { BjCard, Suit } from "../games/blackjack/engine";
import { isRed, suitGlyph } from "../games/blackjack/engine";

function pips(n: number): ReactNode {
  const count = Math.min(n, 7);
  return (
    <span className={`pips p-${count}`} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

const special: Record<Exclude<FlipKind, "number" | "plus">, { cls: string; sub: string; glyph: string }> = {
  freeze: { cls: "ice", sub: "冻结", glyph: "❄" },
  flip3: { cls: "amber", sub: "连翻", glyph: "⚂" },
  chance: { cls: "jade", sub: "复活", glyph: "✚" },
  double: { cls: "ruby", sub: "加倍", glyph: "×2" },
};

export function FlipFace({ card }: { card: FlipCard }) {
  if (card.kind === "number") {
    const n = card.value ?? 0;
    return (
      <article className={`fcard num n-${n}`}>
        <span className="idx tl">{n}</span>
        <span className="idx br">{n}</span>
        <span className="center">
          <b>{n}</b>
          {pips(n)}
        </span>
        <span className="frame" />
      </article>
    );
  }
  if (card.kind === "plus") {
    return (
      <article className="fcard special gold">
        <span className="idx tl">+{card.value}</span>
        <span className="idx br">+{card.value}</span>
        <span className="center">
          <b className="glyph">+{card.value}</b>
          <em>BONUS</em>
        </span>
        <span className="frame" />
      </article>
    );
  }
  const meta = special[card.kind];
  return (
    <article className={`fcard special ${meta.cls}`}>
      <span className="idx tl">{cardLabel(card)}</span>
      <span className="idx br">{cardLabel(card)}</span>
      <span className="center">
        <b className="glyph">{meta.glyph}</b>
        <em>{meta.sub}</em>
      </span>
      <span className="frame" />
    </article>
  );
}

export function PokerFace({ card }: { card: BjCard }) {
  if (card.hidden) {
    return (
      <article className="fcard back">
        <span className="back-sig">AX</span>
      </article>
    );
  }
  const red = isRed(card.suit);
  const g = suitGlyph(card.suit);
  return (
    <article className={`fcard poker ${red ? "red" : "ink"}`}>
      <span className="idx tl">
        {card.rank}
        <small>{g}</small>
      </span>
      <span className="idx br">
        {card.rank}
        <small>{g}</small>
      </span>
      <span className="center">
        <b className="suit-xl">{g}</b>
      </span>
      <span className="frame" />
    </article>
  );
}

export function DeckStack({
  count,
  label,
  onClick,
}: {
  count: number;
  label?: string;
  onClick?: () => void;
}) {
  return (
    <button className="deck-stack" type="button" onClick={onClick}>
      <i />
      <i />
      <i />
      <span>
        {label ?? "牌堆"}
        <strong>{count}</strong>
      </span>
    </button>
  );
}

export function MiniPoker({ rank, suit }: { rank: string; suit: Suit }) {
  const red = isRed(suit);
  return (
    <article className={`fcard mini poker ${red ? "red" : "ink"}`}>
      <span className="idx tl">
        {rank}
        <small>{suitGlyph(suit)}</small>
      </span>
      <span className="center">
        <b className="suit-xl">{suitGlyph(suit)}</b>
      </span>
      <span className="frame" />
    </article>
  );
}
