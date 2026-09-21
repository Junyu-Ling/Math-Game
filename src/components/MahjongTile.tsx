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
  onClick?: () => void;
};

export function MahjongTile({ tile, hide, selected, aimed, flash, down, dim, mini, onClick }: Props) {
  const show = tile.revealed || !hide;
  const num = tile.value === "joker" ? "—" : tile.value;
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
          <span className="coda-idx">{show ? num : ""}</span>
          <span className="coda-num">{show ? num : <i className="mark" />}</span>
          <span className="coda-idx coda-br">{show ? num : ""}</span>
          <span className="coda-frame" />
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
