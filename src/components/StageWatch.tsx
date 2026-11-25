import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Card rows can hang out of a clipped box without growing scrollHeight. Measure the painted edges. */
function neededSize(stage: HTMLElement) {
  const origin = stage.getBoundingClientRect();
  let right = stage.scrollWidth;
  let bottom = stage.scrollHeight;
  const nodes = stage.querySelectorAll<HTMLElement>("*");
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || node.closest(".rule-dock, .net-modal, .invite-toasts")) continue;
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
 * Watches the real window and shrinks a live table until every seat and card row
 * sits inside it. A size that is too big is what used to clip the hand.
 */
export function StageWatch({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const sizer = sizerRef.current;
    const stage = stageRef.current;
    if (!frame || !sizer || !stage) return;
    let pending = 0;
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    const topbar = document.querySelector<HTMLElement>(".topbar");

    const watch = () => {
      ro?.observe(frame);
      ro?.observe(stage);
      if (topbar) ro?.observe(topbar);
    };

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
      ro?.disconnect();
      const { w, h } = visibleSize();
      const root = document.documentElement;
      root.style.setProperty("--app-w", `${w}px`);
      root.style.setProperty("--app-h", `${h}px`);

      const page = stage.querySelector<HTMLElement>(".page-wide");
      if (!page) {
        clearFit();
        watch();
        return;
      }

      frame.classList.add("is-fit");
      stage.classList.add("is-measuring");
      stage.style.transform = "none";
      stage.style.width = "100%";
      stage.style.height = "auto";
      sizer.style.width = "100%";
      sizer.style.height = "auto";
      const availW = Math.max(1, frame.clientWidth);
      const availH = Math.max(1, frame.clientHeight);
      const measured = neededSize(stage);
      const needW = Math.max(measured.needW, 1);
      const needH = Math.max(measured.needH, 1);
      stage.classList.remove("is-measuring");
      if (needW <= availW + 1 && needH <= availH + 1) {
        sizer.style.width = "100%";
        sizer.style.height = "100%";
        stage.style.width = "100%";
        stage.style.height = "100%";
        stage.style.transform = "";
        watch();
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
      watch();
    };

    function schedule() {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        apply();
      }, 30);
    }

    apply();
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    const late = window.setTimeout(schedule, 250);
    const pulse = ro ? 0 : window.setInterval(schedule, 600);
    return () => {
      if (pending) window.clearTimeout(pending);
      window.clearTimeout(late);
      if (pulse) window.clearInterval(pulse);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, []);

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
