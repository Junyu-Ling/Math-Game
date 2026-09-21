import { Link } from "react-router-dom";
import { MahjongTile } from "../components/MahjongTile";
import { FlipFace, MiniPoker } from "../components/PlayingCard";

const games = [
  {
    to: "/play/davinci",
    idx: "01",
    code: "CODA",
    name: "达芬奇密码",
    blurb: "黑白骨牌立成密码。摸牌、指认、见好就收。",
    preview: "coda" as const,
  },
  {
    to: "/play/flip7",
    idx: "02",
    code: "FLIP7",
    name: "七翻天",
    blurb: "不重复地翻牌累分。七张不同数字触发暴击。",
    preview: "flip" as const,
  },
  {
    to: "/play/blackjack",
    idx: "03",
    code: "BJ21",
    name: "二十一点",
    blurb: "贴近 21 且不超过。对庄家，筹码写入账号。",
    preview: "bj" as const,
  },
  {
    to: "/play/24",
    idx: "04",
    code: "M24",
    name: "二十四点",
    blurb: "四张牌，加减乘除各用一次，凑成 24。",
    preview: "m24" as const,
  },
];

function Preview({ kind }: { kind: (typeof games)[number]["preview"] }) {
  if (kind === "coda") {
    return (
      <div className="preview-row">
        <MahjongTile mini hide={false} tile={{ color: "black", value: 2, revealed: true }} />
        <MahjongTile mini hide={false} down tile={{ color: "white", value: 5, revealed: true }} />
        <MahjongTile mini hide tile={{ color: "black", value: 8, revealed: false }} />
      </div>
    );
  }
  if (kind === "flip") {
    return (
      <div className="preview-row">
        <FlipFace card={{ id: "p1", kind: "number", value: 7 }} />
        <FlipFace card={{ id: "p2", kind: "freeze" }} />
      </div>
    );
  }
  if (kind === "bj") {
    return (
      <div className="preview-row">
        <MiniPoker rank="A" suit="S" />
        <MiniPoker rank="K" suit="H" />
      </div>
    );
  }
  return (
    <div className="preview-row">
      <button className="m24-num" type="button" style={{ width: 52, height: 70, fontSize: 24 }}>
        8
      </button>
      <button className="m24-num" type="button" style={{ width: 52, height: 70, fontSize: 24 }}>
        3
      </button>
    </div>
  );
}

export function Home() {
  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="kicker">NUMERICAL TABLE</p>
          <h1>四术同桌。</h1>
          <p className="lede">
            骨牌立桌，纸牌铺毡。本地即可开局；邮箱登录已接好前端，后端用你自己的服务加 Redis，不绑第三方
            BaaS。
          </p>
        </div>
        <div className="hero-stage" aria-hidden>
          <MahjongTile mini hide={false} tile={{ color: "white", value: 3, revealed: true }} />
          <MahjongTile mini hide={false} tile={{ color: "black", value: 7, revealed: true }} />
          <MahjongTile mini hide={false} down tile={{ color: "white", value: "joker", revealed: true }} />
          <MiniPoker rank="Q" suit="D" />
        </div>
      </section>
      <div className="game-grid">
        {games.map((g) => (
          <Link key={g.code} to={g.to} className="game-card">
            <div>
              <div className="idx">
                {g.idx} / {g.code}
              </div>
              <h2>{g.name}</h2>
              <p>{g.blurb}</p>
              <Preview kind={g.preview} />
            </div>
            <div className="enter">ENTER →</div>
          </Link>
        ))}
      </div>
      <p className="section-note">GUEST 可直接玩 · 登录后 21 点筹码写入账号</p>
    </div>
  );
}
