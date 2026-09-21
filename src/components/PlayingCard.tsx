import { useId, type CSSProperties } from "react";
import type { UnoCard, UnoColor } from "../games/uno/engine";
import type { FlipCard } from "../games/flip7/engine";
import type { BjCard, Suit } from "../games/blackjack/engine";
import { isRed, suitGlyph } from "../games/blackjack/engine";

const NAMES = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE"];

const UNO_INK: Record<string, string> = {
  red: "#D42027",
  yellow: "#F4C400",
  green: "#339447",
  blue: "#2266C7",
  black: "#161616",
};

const FLIP_INK: Record<number, string> = {
  0: "#243A86",
  1: "#C9A024",
  2: "#2E9A48",
  3: "#E07030",
  4: "#2F6EC8",
  5: "#6B8A32",
  6: "#8B5A32",
  7: "#7A48B4",
  8: "#E0B430",
  9: "#E04090",
  10: "#E87820",
  11: "#2CB8C4",
  12: "#E07068",
};

const PETAL = ["#3A78D4", "#E04850", "#E0B428", "#2E9A3A", "#E07028", "#7B58A8", "#3CB8C0", "#C84A88"];

function cardBox(extra?: CSSProperties): CSSProperties {
  return { width: "var(--cw, 86px)", height: "var(--ch, 130px)", flex: "0 0 auto", display: "block", ...extra };
}

function UnoOval({ fill }: { fill: string }) {
  return (
    <g transform="rotate(-26 70 106)">
      <ellipse cx="70" cy="106" rx="52" ry="74" fill={fill} />
    </g>
  );
}

function UnoCorners({ text, fill = "#fff" }: { text: string; fill?: string }) {
  const size = text.length > 1 ? 15 : 20;
  return (
    <>
      <text x="12" y="28" fill={fill} fontFamily="Nunito,Arial Black,sans-serif" fontWeight="900" fontSize={size}>
        {text}
      </text>
      <text x="128" y="198" textAnchor="end" fill={fill} fontFamily="Nunito,Arial Black,sans-serif" fontWeight="900" fontSize={size}>
        {text}
      </text>
    </>
  );
}

function MiniUno({ x, y, rot, color }: { x: number; y: number; rot: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x="-10" y="-15" width="20" height="30" rx="3" fill={color} stroke="#fff" strokeWidth="1.4" />
      <ellipse cx="0" cy="0" rx="6" ry="9" fill="#fff" transform="rotate(-24)" />
    </g>
  );
}

function UnoArt({ card }: { card: UnoCard }) {
  const glossId = `unoGloss-${useId().replace(/:/g, "")}`;
  const fill = card.hidden ? "#171717" : UNO_INK[card.color] || "#171717";
  const n = card.kind === "number" ? String(card.value ?? 0) : "";
  const corner =
    card.kind === "number"
      ? String(card.value ?? 0)
      : card.kind === "skip"
        ? "⊘"
        : card.kind === "reverse"
          ? "⇄"
          : card.kind === "draw2"
            ? "+2"
            : card.kind === "wild4"
              ? "+4"
              : "";

  return (
    <svg viewBox="0 0 140 212" className="card-svg uno-svg" style={cardBox()} aria-hidden>
      <defs>
        <linearGradient id={glossId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="137" height="209" rx="16" fill={fill} stroke="#0c0c0c" strokeWidth="3" />
      {card.hidden ? (
        <g transform="rotate(-26 70 106)">
          <ellipse cx="70" cy="106" rx="50" ry="70" fill="#111" stroke="#E8C45A" strokeWidth="5" />
          <text x="70" y="116" textAnchor="middle" fill="#fff" fontFamily="Nunito,Arial Black,sans-serif" fontWeight="900" fontSize="26" letterSpacing="1">
            UNO
          </text>
        </g>
      ) : (
        <>
          {card.kind === "wild" || card.kind === "wild4" ? (
            <>
              <g transform="rotate(-26 70 106)">
                <ellipse cx="70" cy="106" rx="50" ry="70" fill="#111" />
                <g transform="translate(70 106) rotate(26)">
                  <path d="M0 0 L0 -58 A50 70 0 0 1 50 0 Z" fill="#D42027" />
                  <path d="M0 0 L50 0 A50 70 0 0 1 0 70 Z" fill="#F4C400" />
                  <path d="M0 0 L0 70 A50 70 0 0 1 -50 0 Z" fill="#339447" />
                  <path d="M0 0 L-50 0 A50 70 0 0 1 0 -58 Z" fill="#2266C7" />
                </g>
              </g>
              {card.kind === "wild4" ? (
                <>
                  <MiniUno x={52} y={86} rot={-28} color="#D42027" />
                  <MiniUno x={70} y={78} rot={-8} color="#2266C7" />
                  <MiniUno x={88} y={86} rot={18} color="#339447" />
                  <MiniUno x={78} y={104} rot={8} color="#F4C400" />
                  <UnoCorners text="+4" />
                </>
              ) : null}
            </>
          ) : (
            <>
              <UnoOval fill="#F7F3E8" />
              {card.kind === "number" ? (
                <g transform="rotate(-26 70 106)">
                  <text
                    x="70"
                    y="128"
                    textAnchor="middle"
                    fill={fill}
                    fontFamily="Nunito,Arial Black,sans-serif"
                    fontWeight="900"
                    fontSize={n.length > 1 ? 64 : 82}
                    style={{ fontStyle: "italic" }}
                  >
                    {n}
                  </text>
                </g>
              ) : null}
              {card.kind === "skip" ? (
                <g transform="rotate(-26 70 106)" fill="none" stroke={fill} strokeWidth="11" strokeLinecap="round">
                  <circle cx="70" cy="106" r="30" />
                  <path d="M50 126 L90 86" />
                </g>
              ) : null}
              {card.kind === "reverse" ? (
                <g transform="rotate(-26 70 106)" fill={fill}>
                  <path d="M44 88c2-18 18-32 36-32 12 0 22 5 28 13l10-16-28 6 12 8c-8-8-18-11-28-11-22 0-38 18-38 36h8z" />
                  <path d="M96 124c-2 18-18 32-36 32-12 0-22-5-28-13l-10 16 28-6-12-8c8 8 18 11 28 11 22 0 38-18 38-36h-8z" />
                </g>
              ) : null}
              {card.kind === "draw2" ? (
                <g transform="rotate(-26 70 106)">
                  <MiniUno x={58} y={112} rot={-18} color={fill} />
                  <MiniUno x={82} y={96} rot={8} color={fill} />
                  <path d="M92 62 l8 16 18 4 -14 10 4 18 -16-12 -18 8 8-16 -12-14 20 2z" fill={fill} />
                </g>
              ) : null}
              {corner ? <UnoCorners text={corner} /> : null}
            </>
          )}
          <rect x="1.5" y="1.5" width="137" height="209" rx="16" fill={`url(#${glossId})`} />
        </>
      )}
    </svg>
  );
}

function Wreath({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  const n = 22;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry;
        const rot = (a * 180) / Math.PI + 90;
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx="5.2"
            ry="11"
            fill={PETAL[i % PETAL.length]}
            transform={`rotate(${rot} ${x} ${y})`}
          />
        );
      })}
    </g>
  );
}

function FlipArt({ card }: { card: FlipCard }) {
  if (card.kind === "number") {
    const n = card.value ?? 0;
    const ink = FLIP_INK[n] ?? "#C9B07A";
    return (
      <svg viewBox="0 0 140 212" className="card-svg" style={cardBox()} aria-hidden>
        <rect x="2" y="2" width="136" height="208" rx="14" fill="#F6E9C4" stroke="#E2D19A" strokeWidth="2.5" />
        <rect x="10" y="10" width="120" height="192" rx="10" fill="none" stroke="#E8D7A4" strokeWidth="1.2" />
        <Wreath cx={70} cy={86} rx={38} ry={48} />
        <ellipse cx="70" cy="86" rx="34" ry="44" fill={ink} />
        <text
          x="70"
          y="102"
          textAnchor="middle"
          fill="#F8EBC8"
          fontFamily="Nunito,Arial Black,sans-serif"
          fontWeight="900"
          fontSize={n >= 10 ? 42 : 54}
        >
          {n}
        </text>
        <text
          x="70"
          y="168"
          textAnchor="middle"
          fill={ink}
          fontFamily="Nunito,Arial Black,sans-serif"
          fontWeight="800"
          fontSize="13"
          letterSpacing="1.8"
        >
          {NAMES[n]}
        </text>
      </svg>
    );
  }
  if (card.kind === "plus" || card.kind === "double") {
    const label = card.kind === "double" ? "×2" : `+${card.value}`;
    return (
      <svg viewBox="0 0 140 212" className="card-svg" style={cardBox()} aria-hidden>
        <rect x="2" y="2" width="136" height="208" rx="14" fill="#E89428" stroke="#8A4A08" strokeWidth="3" />
        <rect x="12" y="12" width="116" height="188" rx="10" fill="none" stroke="#FFF3C8" strokeWidth="2" strokeDasharray="7 6" />
        <ellipse cx="70" cy="106" rx="46" ry="58" fill="#FFF4D0" />
        <text x="70" y="120" textAnchor="middle" fill="#8A3A08" fontFamily="Nunito,Arial Black,sans-serif" fontWeight="900" fontSize="36">
          {label}
        </text>
      </svg>
    );
  }
  if (card.kind === "freeze") {
    return (
      <svg viewBox="0 0 140 212" className="card-svg" style={cardBox()} aria-hidden>
        <rect x="2" y="2" width="136" height="208" rx="14" fill="#3EC4EE" stroke="#1A7AA8" strokeWidth="2.5" />
        <rect x="12" y="12" width="116" height="188" rx="10" fill="none" stroke="#fff" strokeWidth="2.2" strokeDasharray="6 5" />
        <g fill="#fff" opacity="0.85">
          <polygon points="28,36 32,48 28,60 24,48" />
          <polygon points="112,36 116,48 112,60 108,48" />
          <polygon points="22,150 28,162 22,174 16,162" />
          <polygon points="118,150 124,162 118,174 112,162" />
        </g>
        <rect x="18" y="78" width="104" height="36" rx="3" fill="#F4D23A" />
        <text x="70" y="103" textAnchor="middle" fill="#1A3A58" fontFamily="Nunito,Arial Black,sans-serif" fontWeight="900" fontSize="18" letterSpacing="1.4">
          FREEZE
        </text>
        <g transform="translate(70 154)">
          <rect x="-16" y="-2" width="32" height="26" rx="5" fill="none" stroke="#163A58" strokeWidth="5" />
          <path d="M-10 -2 v-10 a10 10 0 0 1 20 0 v10" fill="none" stroke="#163A58" strokeWidth="5" />
        </g>
      </svg>
    );
  }
  if (card.kind === "flip3") {
    return (
      <svg viewBox="0 0 140 212" className="card-svg" style={cardBox()} aria-hidden>
        <rect x="2" y="2" width="136" height="208" rx="14" fill="#F0CC32" stroke="#C49A10" strokeWidth="2.5" />
        <rect x="12" y="12" width="116" height="188" rx="10" fill="none" stroke="#fff" strokeWidth="2.2" strokeDasharray="6 5" />
        <rect x="22" y="58" width="96" height="52" rx="3" fill="#E24A3A" />
        <text x="70" y="80" textAnchor="middle" fill="#FFF6D8" fontFamily="Nunito,Arial Black,sans-serif" fontWeight="900" fontSize="16">
          FLIP
        </text>
        <text x="70" y="100" textAnchor="middle" fill="#FFF6D8" fontFamily="Nunito,Arial Black,sans-serif" fontWeight="900" fontSize="16">
          THREE
        </text>
        <g>
          <rect x="34" y="128" width="26" height="38" rx="4" fill="#F8EBC8" transform="rotate(-18 47 147)" stroke="#8A5A10" />
          <rect x="57" y="122" width="26" height="38" rx="4" fill="#F8EBC8" stroke="#8A5A10" />
          <rect x="80" y="128" width="26" height="38" rx="4" fill="#F8EBC8" transform="rotate(16 93 147)" stroke="#8A5A10" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 140 212" className="card-svg" style={cardBox()} aria-hidden>
      <rect x="2" y="2" width="136" height="208" rx="14" fill="#EE7A6A" stroke="#C45042" strokeWidth="2.5" />
      <rect x="12" y="12" width="116" height="188" rx="10" fill="none" stroke="#fff" strokeWidth="2.2" strokeDasharray="6 5" />
      <rect x="18" y="62" width="104" height="48" rx="3" fill="#2F6EC8" />
      <text x="70" y="82" textAnchor="middle" fill="#F4F0E0" fontFamily="Nunito,Arial Black,sans-serif" fontWeight="900" fontSize="13">
        SECOND
      </text>
      <text x="70" y="100" textAnchor="middle" fill="#F4F0E0" fontFamily="Nunito,Arial Black,sans-serif" fontWeight="900" fontSize="13">
        CHANCE
      </text>
      <g fill="#2A4A88" transform="translate(70 150)">
        <path d="M-24 2 c0-12 10-18 16-18 6 0 8 5 8 9 0-4 2-9 8-9 6 0 16 6 16 18 0 16-24 30-24 30S-24 18 -24 2z" />
        <path d="M8 6 c0-12 10-18 16-18 6 0 8 5 8 9 0-4 2-9 8-9 6 0 16 6 16 18 0 16-24 30-24 30S8 22 8 6z" />
      </g>
    </svg>
  );
}

export function FlipFace({ card }: { card: FlipCard }) {
  return <FlipArt card={card} />;
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
        {label ?? "Deck"}
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
    </article>
  );
}

export function UnoFace({
  card,
  playable,
  onClick,
}: {
  card: UnoCard;
  playable?: boolean;
  onClick?: () => void;
}) {
  const art = <UnoArt card={card} />;
  if (!onClick) return art;
  return (
    <button type="button" className={`card-svg-btn ${playable ? "playable" : ""}`} onClick={onClick} disabled={!playable}>
      {art}
    </button>
  );
}

export function UnoColorPick({ onPick }: { onPick: (c: UnoColor) => void }) {
  return (
    <div className="uno-colors">
      {(["red", "yellow", "green", "blue"] as const).map((c) => (
        <button key={c} className={`uno-dot ${c}`} type="button" onClick={() => onPick(c)} aria-label={c} />
      ))}
    </div>
  );
}
