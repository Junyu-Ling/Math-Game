import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
      const avail = vertical ? wrap.clientHeight : wrap.clientWidth;
      if (avail < 8) return;
      const prev = row.style.zoom;
      row.style.zoom = "1";
      const box = row.getBoundingClientRect();
      const need = vertical ? Math.max(row.scrollHeight, box.height) : Math.max(row.scrollWidth, box.width);
      row.style.zoom = prev;
      const next = need > avail ? Math.max(0.28, avail / need) : 1;
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
