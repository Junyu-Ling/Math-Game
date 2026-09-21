import { InviteList } from "./InvitePanel";

export function GameSetup({
  kicker,
  title,
  blurb,
  onPractice,
  game,
  meta,
}: {
  kicker: string;
  title: string;
  blurb: string;
  onPractice: () => void;
  game: string;
  meta?: Record<string, unknown>;
}) {
  return (
    <div className="coda-deal">
      <p className="kicker">{kicker}</p>
      <h2>{title}</h2>
      <p>{blurb}</p>
      <div className="row-actions" style={{ justifyContent: "center" }}>
        <button className="btn" type="button" onClick={onPractice}>
          Practice vs CPU
        </button>
      </div>
      <InviteList game={game} meta={meta} />
    </div>
  );
}
