import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

export type Lesson = {
  title: string;
  body: string;
  veteran: string;
  aim: string | null;
};

type RuleApi = {
  game: string | null;
  nonce: number;
  lesson: Lesson | null;
  open: (game: string) => void;
  close: () => void;
  setLesson: (lesson: Lesson | null) => void;
};

const Ctx = createContext<RuleApi | null>(null);

export function useRule() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Rule session is missing");
  return ctx;
}

export function mark(on: boolean, aim: string | null | undefined, id: string, className = "") {
  return on && aim === id ? `${className} coach-hot`.trim() : className;
}

/** Start a fresh CPU hand each time Rule is opened on this table. */
export function useRulePractice(game: string, blocked: boolean, start: () => void) {
  const { game: active, nonce } = useRule();
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (active !== game || blocked) return;
    startRef.current();
  }, [active, nonce, game, blocked]);
}

export function useRuleLesson(game: string, lesson: Lesson | null) {
  const { game: active, setLesson } = useRule();
  const title = lesson?.title ?? "";
  const body = lesson?.body ?? "";
  const veteran = lesson?.veteran ?? "";
  const aim = lesson?.aim ?? null;
  useEffect(() => {
    if (active !== game) return;
    setLesson(lesson);
  }, [active, game, title, body, veteran, aim, lesson, setLesson]);
}

export function RuleProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [game, setGame] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [lesson, setLessonState] = useState<Lesson | null>(null);

  const setLesson = useCallback((next: Lesson | null) => {
    setLessonState((prev) => {
      if (!prev && !next) return prev;
      if (prev && next && prev.aim === next.aim && prev.title === next.title && prev.body === next.body && prev.veteran === next.veteran) {
        return prev;
      }
      return next;
    });
  }, []);

  const open = useCallback((next: string) => {
    setLessonState(null);
    setGame(next);
    setNonce((n) => n + 1);
  }, []);

  const close = useCallback(() => {
    setGame(null);
    setLessonState(null);
  }, []);

  useEffect(() => {
    setGame(null);
    setLessonState(null);
  }, [pathname]);

  const api = useMemo<RuleApi>(
    () => ({ game, nonce, lesson, open, close, setLesson }),
    [game, nonce, lesson, open, close, setLesson],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function RuleDock({ notes }: { notes: (game: string) => ReactNode }) {
  const { game, lesson, open, close } = useRule();
  if (!game) return null;
  return (
    <aside className="rule-dock" role="dialog" aria-label="Rule">
      <div className="rule-dock-top">
        <p className="kicker">This hand</p>
        <button className="btn btn-ghost" type="button" onClick={close}>
          Close
        </button>
      </div>
      <h2>{lesson?.title ?? "Dealing a new hand"}</h2>
      <p>{lesson?.body ?? "A fresh game against the CPU is being dealt. The cards change every time you open Rule."}</p>
      {lesson?.veteran ? <p className="rule-dock-vet">{lesson.veteran}</p> : null}
      <div className="rule-dock-actions">
        <button className="btn" type="button" onClick={() => open(game)}>
          New hand
        </button>
      </div>
      <details className="rule-dock-notes">
        <summary>Written rules</summary>
        {notes(game)}
      </details>
    </aside>
  );
}
