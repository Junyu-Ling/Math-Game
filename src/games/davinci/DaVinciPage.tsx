import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  aiGuess,
  ARRANGE_MS,
  continueGuess,
  currentPlayer,
  drawCard,
  finishArrange,
  guessTile,
  insertIndices,
  selectTile,
  setPendingSlot,
  playRps,
  startCoda,
  stay,
  OPENING,
  type CodaAction,
  type CodaState,
  type CodaTile,
  type CodaValue,
} from "./engine";
import { MahjongTile } from "../../components/MahjongTile";
import { DeckStack } from "../../components/PlayingCard";
import { wait } from "../../lib/shuffle";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { InvitePanel } from "../../components/InvitePanel";

type Flash = {
  kind: "hit" | "miss" | "win" | "lose";
  playerId?: string;
  index?: number;
};

function statusText(state: CodaState, myTurn: boolean, remain: number, matching: boolean): string {
  if (matching) return "等待对手接受邀请。";
  if (state.phase === "over") {
    const w = state.players.find((p) => p.id === state.winnerId);
    return w ? `${w.name} 获胜` : "结束";
  }
  if (state.phase === "rps") {
    return "石头剪刀布，输的人先摸牌再猜。";
  }
  if (state.phase === "arrange") {
    if (state.resume === "draw") {
      return `开局整理 ${remain.toFixed(1)}s · 杠在外面，点空隙插入`;
    }
    return `整理 ${remain.toFixed(1)}s · 选好位置也要等满 5 秒`;
  }
  if (state.phase === "guess" && state.selected) {
    return myTurn ? "已锁定对面的牌，猜数字。双方都能看见箭头。" : "对手正在瞄准一张牌。";
  }
  if (!myTurn) return "对手思考中…";
  if (state.phase === "draw") return "从牌堆摸一张。";
  if (state.phase === "guess") return "点对手未翻开的牌，再猜数字。";
  if (state.phase === "continue") return "猜中了。继续进攻，或停牌秘密插入。";
  return "";
}

function Row({
  tiles,
  hide,
  downRevealed,
  selectedIndex,
  flash,
  playerId,
  onTile,
  onGap,
  gaps,
  ghostAt,
}: {
  tiles: CodaTile[];
  hide: boolean;
  downRevealed?: boolean;
  selectedIndex?: number;
  flash?: Flash | null;
  playerId?: string;
  onTile?: (i: number) => void;
  onGap?: (i: number) => void;
  gaps?: number[];
  ghostAt?: number | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const gapSet = new Set(gaps ?? []);
  const cells: { key: string; node: ReactNode }[] = [];
  const max = tiles.length;
  for (let i = 0; i <= max; i++) {
    if (gapSet.has(i)) {
      const chosen = ghostAt === i;
      cells.push({
        key: `g-${i}`,
        node: (
          <button
            className={`gap on ${chosen ? "ghost" : ""}`}
            type="button"
            onClick={() => onGap?.(i)}
            aria-label="插入位置"
          >
            {chosen ? <span className="mj-arrow" aria-hidden /> : null}
          </button>
        ),
      });
    }
    const tile = tiles[i];
    if (tile) {
      const aimed = selectedIndex === i;
      const fxKind = flash && flash.playerId === playerId && flash.index === i ? flash.kind : null;
      const fx = fxKind === "hit" || fxKind === "miss" ? fxKind : null;
      cells.push({
        key: tile.id,
        node: (
          <MahjongTile
            tile={tile}
            hide={hide}
            selected={aimed}
            aimed={aimed && !tile.revealed}
            flash={fx}
            down={Boolean(downRevealed && tile.revealed)}
            onClick={onTile ? () => onTile(i) : undefined}
          />
        ),
      });
    }
  }
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const row = rowRef.current;
    if (!wrap || !row) return;
    const fit = () => {
      const avail = wrap.clientWidth;
      if (avail < 8) return;
      const prev = row.style.zoom;
      row.style.zoom = "1";
      const need = Math.max(row.scrollWidth, row.getBoundingClientRect().width);
      row.style.zoom = prev;
      const next = need > avail ? Math.max(0.42, avail / need) : 1;
      setZoom((z) => (Math.abs(z - next) < 0.004 ? z : next));
    };
    fit();
    const ro = new ResizeObserver(() => requestAnimationFrame(fit));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [tiles, gaps, ghostAt]);

  return (
    <div className="tiles-fit" ref={wrapRef}>
      <div className="tiles" ref={rowRef} style={{ zoom }}>
        {cells.map((c) => (
          <span key={c.key}>{c.node}</span>
        ))}
      </div>
    </div>
  );
}

function outcomeFlash(next: CodaState, youId: string): Flash | null {
  if (next.phase !== "over" || !next.winnerId) return null;
  return { kind: next.winnerId === youId ? "win" : "lose" };
}

function applyGuess(state: CodaState, value: CodaValue, youId: string): { next: CodaState; flash: Flash | null } {
  const sel = state.selected;
  const next = guessTile(state, value);
  if (!sel || next.log.length === state.log.length) return { next, flash: null };
  const end = outcomeFlash(next, youId);
  if (end) return { next, flash: { ...end, playerId: sel.playerId, index: sel.index } };
  const added = next.log.slice(state.log.length);
  const hit = added.some((l) => l.text.includes("猜中"));
  const miss = added.some((l) => l.text.includes("猜错"));
  const kind = hit ? "hit" : miss ? "miss" : null;
  return { next, flash: kind ? { kind, playerId: sel.playerId, index: sel.index } : null };
}

const BURST: Record<Flash["kind"], { title: string; sub: string }> = {
  hit: { title: "HIT", sub: "猜中，牌翻倒" },
  miss: { title: "MISS", sub: "猜错，公开手牌" },
  win: { title: "WIN", sub: "对手出局，你赢了" },
  lose: { title: "LOSE", sub: "你的牌全部翻开" },
};

export function DaVinciPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const codaRoom = lobby.room?.game === "coda" ? lobby.room : null;
  const [jokers, setJokers] = useState(true);
  const [blackN, setBlackN] = useState(2);
  const [whiteN, setWhiteN] = useState(2);
  const [state, setState] = useState<CodaState | null>(null);
  const [remain, setRemain] = useState(ARRANGE_MS / 1000);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const endsAtRef = useRef<number | null>(null);
  const prevLog = useRef(0);
  const online = Boolean(codaRoom);
  const matching = Boolean(user && lobby.invites.some((i) => i.game === "coda" && i.fromId === user.id));

  const playing = state !== null;
  const you = playing ? (youId ? state.players.find((p) => p.id === youId) : state.players[0]) ?? state.players[0] : null;
  const rival = playing && you ? (state.players.find((p) => p.id !== you.id) ?? state.players[1]) : null;
  const me = playing ? currentPlayer(state) : null;
  const arranging = Boolean(playing && state?.phase === "arrange");
  const opening = arranging && state?.resume === "draw";
  const rpsing = Boolean(playing && state?.phase === "rps");
  const myTurn = Boolean(you && me && me.id === you.id && state && state.phase !== "over" && !arranging && !rpsing);
  const humanRow = arranging && !opening && you && me?.id === you.id ? (state?.humanDraft ?? you.tiles) : (you?.tiles ?? []);
  const rivalRow = opening ? (state?.frozenRival ?? rival?.tiles ?? []) : (rival?.tiles ?? []);
  const myInsert = opening
    ? you?.stash ?? null
    : arranging && you && me?.id === you.id
      ? state?.pending ?? null
      : null;
  const insertOpts = myInsert ? insertIndices(humanRow, myInsert) : [];
  const autoSlot = myInsert
    ? opening
      ? (you && state?.stashSlots[you.id] !== undefined ? state.stashSlots[you.id]! : (insertOpts[0] ?? 0))
      : (state?.pendingSlot ?? insertOpts[0] ?? 0)
    : null;
  const arrangeGaps = arranging && myInsert ? insertOpts : [];

  function dispatch(action: CodaAction) {
    if (codaRoom) {
      void lobby.sendAction(action);
      return;
    }
    if (action.type === "draw") setState((s) => (s ? drawCard(s) : s));
    else if (action.type === "select") setState((s) => (s ? selectTile(s, action.playerId, action.index) : s));
    else if (action.type === "guess") {
      if (!state || !you) return;
      const { next, flash: fx } = applyGuess(state, action.value, you.id);
      setState(next);
      if (fx) setFlash(fx);
    } else if (action.type === "continue") setState((s) => (s ? continueGuess(s) : s));
    else if (action.type === "stay") setState((s) => (s ? stay(s) : s));
    else if (action.type === "slot") setState((s) => (s ? setPendingSlot(s, action.index, you?.id) : s));
    else if (action.type === "rps") setState((s) => (s ? playRps(s, action.throw, you?.id) : s));
  }

  useEffect(() => {
    if (!arranging) return;
    const start = endsAtRef.current ? endsAtRef.current - ARRANGE_MS : Date.now();
    const tick = () => {
      const deadline = endsAtRef.current ?? start + ARRANGE_MS;
      const left = Math.max(0, deadline - Date.now());
      setRemain(left / 1000);
      if (left <= 0) {
        window.clearInterval(id);
        if (!online) setState((s) => (s ? finishArrange(s) : s));
      }
    };
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [state?.arrangeId, arranging, online]);

  useEffect(() => {
    if (!flash) return;
    if (flash.kind === "win" || flash.kind === "lose") return;
    const t = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!state || state.phase !== "over" || !state.winnerId || !you) return;
    setFlash((cur) => {
      if (cur?.kind === "win" || cur?.kind === "lose") return cur;
      return { kind: state.winnerId === you.id ? "win" : "lose" };
    });
  }, [state, you]);

  useEffect(() => {
    if (!state || online) return;
    if (!me || me.human || state.phase === "over" || arranging || state.phase === "rps") return;
    let stop = false;
    (async () => {
      await wait(650);
      if (stop) return;
      if (state.phase === "draw") {
        setState((s) => (s ? drawCard(s) : s));
        return;
      }
      if (state.phase === "guess") {
        const g = aiGuess(state);
        if (!g) return;
        const locked =
          state.selected && state.selected.playerId === g.playerId && state.selected.index === g.index;
        if (!locked) {
          await wait(380);
          if (stop) return;
          setState((s) => (s ? selectTile(s, g.playerId, g.index) : s));
          return;
        }
        await wait(1200);
        if (stop) return;
        const { next, flash: fx } = applyGuess(state, g.value, you?.id ?? "");
        setState(next);
        if (fx) setFlash(fx);
        return;
      }
      if (state.phase === "continue") {
        await wait(400);
        if (stop) return;
        setState((s) => (s ? (Math.random() < 0.4 ? continueGuess(s) : stay(s)) : s));
      }
    })();
    return () => {
      stop = true;
    };
  }, [state, me, arranging, online, you?.id]);

  const numbers = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);
  const showDrawn = Boolean(
    (state?.drawn && (myTurn || me?.id === you?.id || (state.drawn.revealed && arranging))) ||
      (opening && you?.stash),
  );
  const drawnTile = opening && you?.stash ? you.stash : state?.drawn;
  const aimedRival = state?.selected && rival && state.selected.playerId === rival.id ? state.selected.index : undefined;
  const aimedYou = state?.selected && you && state.selected.playerId === you.id ? state.selected.index : undefined;

  function setBlack(n: number) {
    const black = Math.max(0, Math.min(OPENING, n));
    setBlackN(black);
    setWhiteN(OPENING - black);
  }

  function setWhite(n: number) {
    const white = Math.max(0, Math.min(OPENING, n));
    setWhiteN(white);
    setBlackN(OPENING - white);
  }

  function resetTable() {
    setFlash(null);
    setState(null);
    setYouId(null);
    endsAtRef.current = null;
    prevLog.current = 0;
    if (codaRoom) void lobby.leave();
  }

  function beginPractice() {
    if (codaRoom) void lobby.leave();
    setFlash(null);
    setYouId(null);
    setState(startCoda(jokers, blackN, whiteN));
  }

  useEffect(() => {
    if (!codaRoom) return;
    const view = codaRoom.view as CodaState;
    setYouId(user?.id ?? null);
    setState((prev) => {
      if (prev && view.log.length > prev.log.length) {
        const added = view.log.slice(prev.log.length);
        const sel = view.selected ?? prev.selected;
        if (added.some((l) => l.text.includes("猜中")) && sel) {
          setFlash({ kind: "hit", playerId: sel.playerId, index: sel.index });
        } else if (added.some((l) => l.text.includes("猜错")) && sel) {
          setFlash({ kind: "miss", playerId: sel.playerId, index: sel.index });
        }
      }
      prevLog.current = view.log.length;
      return view;
    });
    endsAtRef.current = codaRoom.endsAt;
  }, [codaRoom, user?.id]);

  return (
    <div className="page-wide coda-page">
      <div className="game-head">
        <div>
          <p className="kicker">01 / CODA</p>
          <h1>达芬奇密码</h1>
        </div>
        <div className="row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setJokers((v) => !v);
              if (playing) resetTable();
            }}
          >
            {jokers ? "JOKER ON" : "JOKER OFF"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => resetTable()}>
            RESET
          </button>
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className={`table table-coda ${flash ? `table-${flash.kind}` : ""}`}>
          <div className="coda-lamp" />
          <div className="coda-ring" />
          {!playing || !you || !rival || !state ? (
            <div className="coda-deal">
              <p className="kicker">{matching ? "INVITE" : "OPENING DRAW"}</p>
              <h2>{matching ? "正在邀请对手" : "选择开局摸牌"}</h2>
              <p>
                {matching
                  ? "等待对方接受邀请。"
                  : `开局 ${OPENING} 张。登录后邀请在线玩家，双人对战。右侧列表可邀请。`}
              </p>
              {!matching ? (
                <>
                  <div className="deal-colors">
                    <div className="deal-color black">
                      <span>BLACK</span>
                      <div className="deal-step">
                        <button type="button" disabled={blackN <= 0} onClick={() => setBlack(blackN - 1)}>
                          −
                        </button>
                        <b>{blackN}</b>
                        <button type="button" disabled={blackN >= OPENING} onClick={() => setBlack(blackN + 1)}>
                          +
                        </button>
                      </div>
                    </div>
                    <div className="deal-color white">
                      <span>WHITE</span>
                      <div className="deal-step">
                        <button type="button" disabled={whiteN <= 0} onClick={() => setWhite(whiteN - 1)}>
                          −
                        </button>
                        <b>{whiteN}</b>
                        <button type="button" disabled={whiteN >= OPENING} onClick={() => setWhite(whiteN + 1)}>
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="deal-preview" aria-hidden>
                    {Array.from({ length: blackN }, (_, i) => (
                      <MahjongTile key={`b-${i}`} tile={{ color: "black", value: 0, revealed: false }} hide mini />
                    ))}
                    {Array.from({ length: whiteN }, (_, i) => (
                      <MahjongTile key={`w-${i}`} tile={{ color: "white", value: 0, revealed: false }} hide mini />
                    ))}
                  </div>
                  <div className="row-actions" style={{ justifyContent: "center" }}>
                    <button className="btn btn-ghost" type="button" onClick={beginPractice}>
                      练习人机
                    </button>
                  </div>
                  <p>对战请登录后在右侧邀请在线玩家。练习人机仅本机。</p>
                  {!user ? (
                    <p>
                      对战需先 <Link to="/login">登录</Link>
                    </p>
                  ) : (
                    <p>当前账号 {user.email}</p>
                  )}
                </>
              ) : (
                <button className="btn btn-ghost" type="button" onClick={resetTable}>
                  取消邀请
                </button>
              )}
            </div>
          ) : (
            <>
          <div className={`seat seat-rival ${opening ? "veiled" : ""}`}>
            <div className="seat-plaque">
              <b>{rival.name}</b>
              <span>
                {rival.out ? "OUT" : opening ? "整理" : me?.id === rival.id ? "回合" : "等待"}
              </span>
            </div>
            <div className="tiles-wrap">
              {opening ? (
                <div className="arrange-veil" aria-hidden>
                  <strong>整理中</strong>
                  <span>5 秒后揭晓顺序</span>
                </div>
              ) : null}
              <Row
                tiles={rivalRow}
                hide
                downRevealed
                playerId={rival.id}
                selectedIndex={aimedRival}
                flash={flash}
                onTile={(i) => myTurn && state.phase === "guess" && dispatch({ type: "select", playerId: rival.id, index: i })}
              />
            </div>
          </div>

          <div className="center-well">
            {arranging ? (
              <div className="arrange-clock" aria-live="polite">
                <b>{Math.ceil(remain)}</b>
                <span>{opening ? "开局整理" : "插入中"}</span>
              </div>
            ) : (
              <DeckStack
                count={state.deck.length}
                label="牌堆"
                onClick={() => myTurn && state.phase === "draw" && dispatch({ type: "draw" })}
              />
            )}
            <div className="hand-card">
              <div className="seat-label">{arranging ? "待插入" : "摸到的牌"}</div>
              {showDrawn && drawnTile ? (
                <MahjongTile tile={drawnTile} hide={!drawnTile.revealed && me?.id !== you.id} />
              ) : (
                <MahjongTile tile={{ color: "black", value: 0, revealed: false }} hide dim />
              )}
            </div>
          </div>

          <div className="seat seat-you">
            <div className="seat-plaque you">
              <b>{you.name}</b>
              <span>
                {you.out ? "OUT" : opening ? "整理" : arranging ? "插入" : me?.id === you.id ? "回合" : "等待"}
              </span>
            </div>
            <div className="tiles-wrap">
              <Row
                tiles={humanRow}
                hide={false}
                downRevealed
                playerId={you.id}
                selectedIndex={aimedYou}
                flash={flash}
                gaps={arrangeGaps}
                ghostAt={myInsert ? autoSlot : null}
                onGap={(i) => {
                  if (!arranging || !myInsert) return;
                  dispatch({ type: "slot", index: i });
                }}
              />
            </div>
          </div>

          {rpsing ? (
            <div className="coda-deal coda-rps">
              <p className="kicker">FIRST MOVE</p>
              <h2>石头剪刀布</h2>
              <p>输的人先摸一张，再开始猜。</p>
              <div className="rps-row">
                {([
                  ["rock", "石头"],
                  ["scissors", "剪刀"],
                  ["paper", "布"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => dispatch({ type: "rps", throw: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {flash ? (
            <div className={`coda-burst ${flash.kind}`} aria-live="assertive">
              <div>
                <strong>{BURST[flash.kind].title}</strong>
                <span>{BURST[flash.kind].sub}</span>
                {(flash.kind === "win" || flash.kind === "lose") && (
                  <button className="btn btn-gold burst-again" type="button" onClick={resetTable}>
                    再来一局
                  </button>
                )}
              </div>
            </div>
          ) : null}
            </>
          )}
        </div>

        <aside className="side coda-panel">
          <InvitePanel game="coda" meta={{ useJokers: jokers, black: blackN, white: whiteN }} />
          <div>
            <h3>STATUS</h3>
            <p className="status-line">
              {matching
                ? statusText(state ?? ({} as CodaState), false, remain, true)
                : playing && state
                  ? statusText(state, myTurn, remain, false)
                  : `选择开局：黑 ${blackN} · 白 ${whiteN}${online ? " · 对战" : ""}`}
            </p>
          </div>
          {playing && state?.phase === "guess" && myTurn && (
            <div>
              <h3>GUESS {state.selected ? "· 已锁定" : "· 先点对面的牌"}</h3>
              <div className="pad">
                {numbers.map((n) => (
                  <button key={n} type="button" disabled={!state.selected} onClick={() => dispatch({ type: "guess", value: n })}>
                    {n}
                  </button>
                ))}
                {jokers && (
                  <button type="button" disabled={!state.selected} onClick={() => dispatch({ type: "guess", value: "joker" })}>
                    —
                  </button>
                )}
              </div>
            </div>
          )}
          {playing && state?.phase === "continue" && myTurn && (
            <div className="row-actions">
              <button className="btn btn-go" type="button" onClick={() => dispatch({ type: "continue" })}>
                HIT AGAIN
              </button>
              <button className="btn btn-gold" type="button" onClick={() => dispatch({ type: "stay" })}>
                STAY
              </button>
            </div>
          )}
          <div>
            <h3>RULE</h3>
            <ul>
              <li>登录后邀请在线玩家，双人对战。</li>
              <li>开局 4 张在手里。摸到 — 才插入锁定；没摸到不用插入。</li>
              <li>仅开局蒙版。插入都要等满 5 秒，选好位置也不提前入列。</li>
              <li>开局 4 张后猜拳，输的人先摸再猜。</li>
            </ul>
          </div>
          <div>
            <h3>LOG</h3>
            <div className="log">
              {playing && state
                ? [...state.log].reverse().map((l) => (
                    <div key={l.id} className={l.tone}>
                      {l.text}
                    </div>
                  ))
                : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
