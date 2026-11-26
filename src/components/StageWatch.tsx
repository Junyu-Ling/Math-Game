import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * A reel, log, or board window clips its children on purpose.
 * Counting those children makes the page scale, which changes their size, which scales the page again.
 */
function neededSize(stage: HTMLElement) {
  const origin = stage.getBoundingClientRect();
  let right = stage.scrollWidth;
  let bottom = stage.scrollHeight;
  const clipOf = new Map<HTMLElement, HTMLElement | null>();
  const nodes = stage.querySelectorAll<HTMLElement>("*");
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || node.closest(".rule-dock, .net-modal, .invite-toasts, .watch-bar")) continue;
    const parent = node.parentElement;
    const parentClip = parent && clipOf.has(parent) ? clipOf.get(parent) || null : null;
    let selfClip = parentClip;
    if (!selfClip) {
      const style = getComputedStyle(node);
      const box = `${style.overflowX} ${style.overflowY}`;
      const clips = /hidden|clip|auto|scroll/.test(box);
      const structural =
        node.classList.contains("page-wide") ||
        node.classList.contains("game-layout") ||
        node.classList.contains("table") ||
        node.classList.contains("stage-scale");
      if (clips && !structural) selfClip = node;
    }
    clipOf.set(node, selfClip);
    if (parentClip) continue;
    const box = node.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    right = Math.max(right, box.right - origin.left);
    bottom = Math.max(bottom, box.bottom - origin.top);
  }
  return { needW: Math.ceil(right), needH: Math.ceil(bottom) };
}

/** Visible CSS pixels. Old Windows often reports a taller or wider window than the area that is actually on screen. */
function visibleSize() {
  const root = document.documentElement;
  const view = window.visualViewport;
  const width = Math.min(root.clientWidth || Infinity, view?.width ?? Infinity, window.innerWidth || Infinity);
  const height = Math.min(root.clientHeight || Infinity, view?.height ?? Infinity, window.innerHeight || Infinity);
  return {
    w: Math.max(1, Math.floor(Number.isFinite(width) ? width : window.innerWidth || 1)),
    h: Math.max(1, Math.floor(Number.isFinite(height) ? height : window.innerHeight || 1)),
  };
}

/**
 * Fits a live table to the window once per size. It does not watch the table itself:
 * spins, deals, and timers used to change a child box and make the whole page jump.
 */
export function StageWatch({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const frameRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const sizer = sizerRef.current;
    const stage = stageRef.current;
    if (!frame || !sizer || !stage) return;
    let pending = 0;
    let lastSig = "";

    const clearFit = () => {
      frame.classList.remove("is-fit");
      stage.classList.remove("is-measuring");
      sizer.style.width = "";
      sizer.style.height = "";
      stage.style.width = "";
      stage.style.height = "";
      stage.style.transform = "";
    };

    const apply = () => {
      const { w, h } = visibleSize();
      const root = document.documentElement;
      const nextW = `${w}px`;
      const nextH = `${h}px`;
      if (root.style.getPropertyValue("--app-w") !== nextW) root.style.setProperty("--app-w", nextW);
      if (root.style.getPropertyValue("--app-h") !== nextH) root.style.setProperty("--app-h", nextH);

      const page = stage.querySelector<HTMLElement>(".page-wide");
      const sig = `${w}x${h}|${page ? "game" : "home"}|${pathname}`;
      if (sig === lastSig) return;
      lastSig = sig;

      if (!page) {
        clearFit();
        return;
      }

      frame.classList.add("is-fit");
      stage.classList.add("is-measuring");
      stage.style.transform = "none";
      stage.style.width = "100%";
      stage.style.height = "auto";
      sizer.style.width = "100%";
      sizer.style.height = "auto";
      const measured = neededSize(stage);
      stage.classList.remove("is-measuring");
      const availW = Math.max(1, frame.clientWidth);
      const availH = Math.max(1, frame.clientHeight);
      const needW = Math.max(measured.needW, 1);
      const needH = Math.max(measured.needH, 1);
      if (needW <= availW + 12 && needH <= availH + 12) {
        sizer.style.width = "100%";
        sizer.style.height = "100%";
        stage.style.width = "100%";
        stage.style.height = "100%";
        stage.style.transform = "";
        return;
      }
      const next = Math.max(0.3, Math.min(1, availW / needW, availH / needH));
      const visualW = Math.ceil(needW * next);
      const visualH = Math.ceil(needH * next);
      sizer.style.width = `${Math.min(availW, visualW)}px`;
      sizer.style.height = `${Math.min(availH, visualH)}px`;
      stage.style.width = `${Math.ceil(needW)}px`;
      stage.style.height = `${Math.ceil(needH)}px`;
      stage.style.transformOrigin = "top left";
      stage.style.transform = next < 0.992 ? `scale(${next.toFixed(4)})` : "";
    };

    function schedule() {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        apply();
      }, 60);
    }

    apply();
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    const late = window.setTimeout(() => {
      lastSig = "";
      apply();
    }, 400);
    return () => {
      if (pending) window.clearTimeout(pending);
      window.clearTimeout(late);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [pathname]);

  return (
    <div className="stage-frame" ref={frameRef}>
      <div className="stage-sizer" ref={sizerRef}>
        <div className="stage-scale" ref={stageRef}>
          {children}
        </div>
      </div>
    </div>
  );
}
