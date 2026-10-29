import { useEffect } from "react";

function isPhone() {
  const shortestScreen = Math.min(screen.width || Infinity, screen.height || Infinity);
  const shortestInner = Math.min(window.innerWidth, window.innerHeight);
  return Math.min(shortestScreen, shortestInner) <= 520;
}

function tryLockLandscape() {
  if (!isPhone()) return;
  const orientation = screen.orientation;
  if (!orientation || typeof orientation.lock !== "function") return;
  void orientation.lock("landscape").catch(() => undefined);
}

export function RotateGate() {
  useEffect(() => {
    tryLockLandscape();
    const onChange = () => tryLockLandscape();
    window.addEventListener("orientationchange", onChange);
    window.addEventListener("pointerdown", tryLockLandscape, { once: true });
    orientationChangeTarget()?.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("orientationchange", onChange);
      window.removeEventListener("pointerdown", tryLockLandscape);
      orientationChangeTarget()?.removeEventListener("change", onChange);
    };
  }, []);

  return (
    <div className="rotate-gate" role="dialog" aria-modal="true" aria-labelledby="rotate-title">
      <div className="rotate-phone" aria-hidden />
      <p id="rotate-title">Turn your phone sideways</p>
      <span>This table is landscape only.</span>
    </div>
  );
}

function orientationChangeTarget() {
  return typeof screen !== "undefined" && screen.orientation ? screen.orientation : null;
}
