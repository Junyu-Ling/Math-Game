import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function measureFit(wrap: HTMLElement, row: HTMLElement, vertical: boolean) {
  const style = getComputedStyle(wrap);
  const padAlong = vertical
    ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    : parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padCross = vertical
    ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
    : parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const alongAvail = (vertical ? wrap.clientHeight : wrap.clientWidth) - padAlong - 6;
  const crossAvail = (vertical ? wrap.clientWidth : wrap.clientHeight) - padCross - 6;
  if (alongAvail < 8) return null;
  const prev = row.style.zoom;
  row.style.zoom = "1";
  const kids = row.children.length ? [...row.children] : [row];
  let min = Infinity;
  let max = -Infinity;
  for (const kid of kids) {
    const box = kid.getBoundingClientRect();
    if (vertical) {
      min = Math.min(min, box.top);
      max = Math.max(max, box.bottom);
    } else {
      min = Math.min(min, box.left);
      max = Math.max(max, box.right);
    }
  }
  const rowBox = row.getBoundingClientRect();
  const along = vertical ? Math.max(row.scrollHeight, rowBox.height) : Math.max(row.scrollWidth, rowBox.width);
  const cross = vertical ? Math.max(row.scrollWidth, rowBox.width) : Math.max(row.scrollHeight, rowBox.height);
  const need = Math.max(along, max - min) + 12;
  row.style.zoom = prev;
  if (!Number.isFinite(need) || need <= 0) return 1;
  const alongScale = need > alongAvail ? alongAvail / need : 1;
  const crossScale = crossAvail > 8 && cross > crossAvail ? crossAvail / cross : 1;
  return Math.max(0.28, Math.min(alongScale, crossScale));
}

export function FitCards({
  vertical = false,
  lockSize = false,
  className = "",
  children,
}: {
  vertical?: boolean;
  lockSize?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const row = rowRef.current;
    if (!wrap || !row) return;
    if (lockSize) {
      setZoom((z) => (z === 1 ? z : 1));
      return;
    }
    const fit = () => {
      const next = measureFit(wrap, row, vertical);
      if (next == null) return;
      setZoom((z) => (Math.abs(z - next) < 0.004 ? z : next));
    };
    fit();
    const ro = new ResizeObserver(() => requestAnimationFrame(fit));
    ro.observe(wrap);
    ro.observe(row);
    return () => ro.disconnect();
  }, [children, vertical, lockSize]);

  return (
    <div className={`cards-fit ${vertical ? "is-vertical" : ""} ${className}`.trim()} ref={wrapRef}>
      <div className="pcards" ref={rowRef} style={{ zoom }}>
        {children}
      </div>
    </div>
  );
}

export function SideCard({ children }: { children: ReactNode }) {
  return <span className="side-card">{children}</span>;
}
