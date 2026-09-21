import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { checkSolution, newPuzzle } from "./engine";

const OPS = ["+", "-", "×", "÷", "(", ")"];

export function Math24Page() {
  const [puzzle, setPuzzle] = useState(() => newPuzzle());
  const [used, setUsed] = useState<boolean[]>([false, false, false, false]);
  const [expr, setExpr] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [solved, setSolved] = useState(0);
  const [show, setShow] = useState(false);

  const hint = useMemo(() => puzzle.solution.replace(/\*/g, "×").replace(/\//g, "÷"), [puzzle]);

  function resetBoard(next = newPuzzle()) {
    setPuzzle(next);
    setUsed([false, false, false, false]);
    setExpr("");
    setMsg("");
    setOk(false);
    setShow(false);
  }

  function tapNum(i: number) {
    if (used[i]) return;
    const n = puzzle.nums[i];
    if (n === undefined) return;
    setExpr((e) => e + String(n));
    setUsed((u) => u.map((v, k) => (k === i ? true : v)));
  }

  function submit() {
    const res = checkSolution(puzzle.nums, expr);
    if (res.ok) {
      setOk(true);
      setMsg("正好 24。");
      setSolved((n) => n + 1);
    } else {
      setOk(false);
      setMsg(res.error || "不对");
    }
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">04 / M24 · SOLVED {solved}</p>
          <h1>二十四点</h1>
        </div>
        <div className="row-actions">
          <button className="btn btn-ghost" type="button" onClick={() => resetBoard()}>
            NEW
          </button>
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-m24">
          <div className="m24-board">
            {puzzle.nums.map((n, i) => (
              <button
                key={`${n}-${i}`}
                className={`m24-num ${used[i] ? "used" : ""}`}
                type="button"
                onClick={() => tapNum(i)}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="expr">{expr || "—"}</div>
          <div className="ops">
            {OPS.map((op) => (
              <button key={op} type="button" onClick={() => setExpr((e) => e + op)}>
                {op}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setExpr("");
                setUsed([false, false, false, false]);
                setMsg("");
                setOk(false);
              }}
            >
              CLR
            </button>
            <button type="button" onClick={() => setExpr((e) => e.slice(0, -1))}>
              DEL
            </button>
          </div>
          <div className="row-actions" style={{ justifyContent: "center", marginTop: 24 }}>
            <button className="btn" type="button" onClick={submit}>
              SUBMIT
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setShow(true)}>
              SOLUTION
            </button>
          </div>
          <p className={`msg ${ok ? "ok" : msg ? "err" : ""}`} style={{ textAlign: "center" }}>
            {ok ? msg : show ? hint : msg}
          </p>
        </div>
        <aside className="side">
          <div>
            <h3>RULE</h3>
            <ul>
              <li>四张牌各用一次。</li>
              <li>只用 + − × ÷ 与括号。</li>
              <li>禁止拼数，例如 2 与 4 不能写成 24。</li>
              <li>A=1，本桌只用 1–10。</li>
            </ul>
          </div>
          <div>
            <h3>ROUTINES</h3>
            <p>先找 3×8、4×6、2×12。分数法：6÷(1−3÷4)=24。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
