import type { CodaTile } from "../games/davinci/engine";

type Props = {
  tile: Pick<CodaTile, "color" | "value" | "revealed">;
  hide: boolean;
  selected?: boolean;
  aimed?: boolean;
  flash?: "hit" | "miss" | null;
  down?: boolean;
  dim?: boolean;
  mini?: boolean;
  fresh?: boolean;
  onClick?: () => void;
};

export function MahjongTile({ tile, hide, selected, aimed, flash, down, dim, mini, fresh, onClick }: Props) {
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
    fresh ? "fresh" : "",
  ].join(" ");

  const body = (
    <>
      {aimed ? <span className="mj-arrow" aria-hidden /> : null}
      {fresh ? <span className="mj-fresh" aria-hidden /> : null}
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
