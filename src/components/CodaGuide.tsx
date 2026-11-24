import { useState } from "react";
import { MahjongTile } from "./MahjongTile";
import type { CodaValue } from "../games/davinci/engine";

const STEPS = [
  {
    title: "Choose your mix",
    body: "Before any tile is dealt, you pick how many black tiles and how many white tiles to start with. Two players get 4 tiles. Black and white are separate: each color is 0–11 plus one dash. Follow the arrow and take 2 black and 2 white.",
  },
  {
    title: "Ready starts the deal",
    body: "Ready locks that mix. Nothing is dealt until every player is ready. Your numbers will land in order, small on the left. If a dash was dealt to you, it waits beside the row until you place it.",
  },
  {
    title: "Place the dash",
    body: "You drew a black dash. It may sit in any gap, and it stays exactly where you put it. The numbers stay sorted: 2, then 5, then 8. In a real game you have 5 seconds. Put this dash between 5 and 8.",
  },
  {
    title: "Draw one color",
    body: "The dash is in the row. On your turn you draw one tile by picking a color that is still in the deck. You cannot pick a color that has run out. White is still there. Draw white.",
  },
  {
    title: "Guess a hidden tile",
    body: "White 6 joins your row between 5 and the dash. You can see it. The other player cannot, until someone guesses it. Now guess one face-down tile on their side. The arrow marks the left one.",
  },
  {
    title: "Call the number",
    body: "Say the number you think is on that tile. One call. A dash is a legal call too, but this tile is a number. Tap 3.",
  },
  {
    title: "A hit keeps your turn",
    body: "3 is correct, so that tile stays face up for everyone. You may guess another hidden tile, or end the turn. A wrong call would knock one of your own tiles face up instead. End the turn.",
  },
  {
    title: "A miss shows one of yours",
    body: "If the number is wrong, one of your hidden tiles is turned face up for the whole table. Your black 8 is shown now. They can use it to narrow down what is still hidden. Tap that tile to finish the walkthrough.",
  },
] as const;

type Color = "black" | "white";

function Aim({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={on ? "guide-aim on" : "guide-aim"}>
      {on ? <i className="guide-arrow" aria-hidden /> : null}
      {children}
    </span>
  );
}

function Tile({
  color,
  value,
  hide,
  down,
  aim,
  onClick,
}: {
  color: Color;
  value: CodaValue;
  hide?: boolean;
  down?: boolean;
  aim?: boolean;
  onClick?: () => void;
}) {
  return (
    <Aim on={Boolean(aim)}>
      <MahjongTile
        tile={{ color, value, revealed: !hide }}
        hide={Boolean(hide)}
        down={down}
        mini
        onClick={onClick}
      />
    </Aim>
  );
}

export function CodaGuide() {
  const [step, setStep] = useState(0);
  const [note, setNote] = useState("");
  const last = STEPS.length - 1;
  const placed = step >= 3;
  const drawn = step >= 4;
  const revealed = step >= 6;
  const knocked = step >= 7;
  const done = step > last;

  function go(next: number) {
    setNote("");
    setStep(next);
  }

  function wrong(text: string) {
    setNote(text);
  }

  const info = done ? null : STEPS[step];

  return (
    <section className="coda-guide" aria-label="How a turn works">
      <div className="coda-guide-copy">
        <p className="kicker">{done ? "Walkthrough" : `Step ${step + 1} of ${STEPS.length}`}</p>
        <h3>{done ? "You can play a real hand" : info?.title}</h3>
        <p>
          {done
            ? "The arrow walked one opening, one draw, one correct guess, and one miss. Close this and use the same buttons on the table. Replay if you want to see it again."
            : info?.body}
        </p>
        {note ? <p className="coda-guide-note">{note}</p> : null}
        <div className="coda-guide-nav">
          <button className="btn btn-ghost" type="button" disabled={step === 0} onClick={() => go(Math.max(0, step - 1))}>
            Back
          </button>
          {done ? (
            <button className="btn" type="button" onClick={() => go(0)}>
              Replay
            </button>
          ) : null}
        </div>
      </div>

      <div className="coda-guide-table">
        <div className="coda-guide-seat">
          <span>Rival</span>
          <div className="coda-guide-row">
            <Tile
              color="white"
              value={3}
              hide={!revealed}
              aim={step === 4}
              onClick={step === 4 ? () => go(5) : undefined}
            />
            <Tile color="white" value={7} />
            <Tile
              color="black"
              value={9}
              hide
              onClick={step === 4 ? () => wrong("Not this one. The arrow is on the left tile.") : undefined}
            />
          </div>
        </div>

        <div className="coda-guide-seat you">
          <span>You</span>
          <div className="coda-guide-row">
            <Tile color="black" value={2} />
            <Tile color="white" value={5} />
            {step === 2 ? (
              <Aim on>
                <button type="button" className="guide-slot" aria-label="Place the dash between 5 and 8" onClick={() => go(3)} />
              </Aim>
            ) : null}
            {drawn ? <Tile color="white" value={6} /> : null}
            {placed ? <Tile color="black" value="joker" /> : null}
            <Tile color="black" value={8} down={knocked} aim={step === 7} onClick={step === 7 ? () => go(8) : undefined} />
          </div>
        </div>

        {step === 0 ? (
          <div className="coda-guide-actions">
            <button type="button" className="btn btn-ghost" onClick={() => wrong("That mix is legal later. This lesson uses the arrow: 2 black and 2 white.")}>
              4 black
            </button>
            <Aim on>
              <button type="button" className="btn is-hot" onClick={() => go(1)}>
                2 black · 2 white
              </button>
            </Aim>
            <button type="button" className="btn btn-ghost" onClick={() => wrong("That mix is legal later. This lesson uses the arrow: 2 black and 2 white.")}>
              4 white
            </button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="coda-guide-actions">
            <Aim on>
              <button type="button" className="btn is-hot" onClick={() => go(2)}>
                Ready
              </button>
            </Aim>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="coda-guide-actions">
            <button type="button" className="btn btn-ghost" onClick={() => wrong("Black is allowed when it is still in the deck. Follow the arrow and draw white.")}>
              Black
            </button>
            <Aim on>
              <button type="button" className="btn is-hot" onClick={() => go(4)}>
                White
              </button>
            </Aim>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="coda-guide-pad" role="group" aria-label="Call a number">
            {Array.from({ length: 12 }, (_, n) => (
              <Aim key={n} on={n === 3}>
                <button
                  type="button"
                  className={n === 3 ? "is-hot" : ""}
                  onClick={() => (n === 3 ? go(6) : wrong("Not this number. The arrow is on 3."))}
                >
                  {n}
                </button>
              </Aim>
            ))}
          </div>
        ) : null}

        {step === 6 ? (
          <div className="coda-guide-actions">
            <button type="button" className="btn btn-ghost" onClick={() => wrong("You could guess again in a real game. Follow the arrow and end the turn.")}>
              Guess again
            </button>
            <Aim on>
              <button type="button" className="btn is-hot" onClick={() => go(7)}>
                End turn
              </button>
            </Aim>
          </div>
        ) : null}
      </div>
    </section>
  );
}
