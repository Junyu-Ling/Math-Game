import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function measureFit(wrap: HTMLElement, row: HTMLElement, vertical: boolean) {
  const style = getComputedStyle(wrap);
  const pad = vertical
    ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    : parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const avail = (vertical ? wrap.clientHeight : wrap.clientWidth) - pad - 6;
  if (avail < 8) return null;
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
  const need = Math.max(along, max - min) + 12;
  row.style.zoom = prev;
  if (!Number.isFinite(need) || need <= 0) return 1;
  return need > avail ? Math.max(0.28, avail / need) : 1;
}

export function FitCards({
  vertical = false,
  className = "",
  children,
}: {
  vertical?: boolean;
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
  }, [children, vertical]);

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
