import type { CodaTile, CodaValue } from "../games/davinci/engine";

type Props = {
  tile: Pick<CodaTile, "color" | "value" | "revealed">;
  hide: boolean;
  selected?: boolean;
  aimed?: boolean;
  flash?: "hit" | "miss" | null;
  down?: boolean;
  dim?: boolean;
  mini?: boolean;
  tried?: CodaValue[];
  onClick?: () => void;
};

function mark(value: CodaValue): string {
  return value === "joker" ? "—" : String(value);
}

export function MahjongTile({ tile, hide, selected, aimed, flash, down, dim, mini, tried, onClick }: Props) {
  const show = tile.revealed || !hide;
  const num = tile.value === "joker" ? "-" : String(tile.value);
  const className = [
    "mj",
    tile.color,
    down ? "down" : "stand",
    show ? "face-up" : "face-down",
    selected || aimed ? "selected" : "",
    flash === "hit" ? "fx-hit" : "",
    flash === "miss" ? "fx-miss" : "",
    dim ? "dim" : "",
    mini ? "mini" : "",
  ].join(" ");

  const body = (
    <>
      {aimed ? <span className="mj-arrow" aria-hidden /> : null}
      <span className="mj-shade" />
      <span className="coda-flip">
        <span className="coda-face">
          {show ? (
            <span className="coda-num">
              <b>{num}</b>
              {tile.value === "joker" ? null : <i className="coda-rule" />}
            </span>
          ) : (
            <span className="coda-blank" />
          )}
          {!mini && tried && tried.length > 0 && !tile.revealed ? (
            <span className="mj-tried" aria-hidden>
              {tried.map((v) => (
                <i key={String(v)}>{mark(v)}</i>
              ))}
            </span>
          ) : null}
        </span>
        <span className="coda-side coda-top" />
        <span className="coda-side coda-right" />
      </span>
    </>
  );

  if (!onClick) {
    return <span className={className}>{body}</span>;
  }

  return (
    <button type="button" className={className} onClick={onClick} aria-label={`${tile.color} ${show ? num : "hidden"}`}>
      {body}
    </button>
  );
}
