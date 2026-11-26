import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function AuthFrame({
  title,
  lede,
  children,
  foot,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="auth-screen">
      <section className="auth-card">
        <Link to="/" className="auth-brand">
          <strong>ByteGame</strong>
          <span>Play</span>
        </Link>
        <h1>{title}</h1>
        <p className="auth-lede">{lede}</p>
        {children}
        {foot ? <p className="auth-foot">{foot}</p> : null}
      </section>
    </div>
  );
}

export function CodeBoxes({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");

  function write(next: string) {
    onChange(next.replace(/\D/g, "").slice(0, 6));
  }

  return (
    <div className="code-boxes" role="group" aria-label="Email code">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          aria-label={`Digit ${i + 1}`}
          onChange={(event) => {
            const text = event.target.value.replace(/\D/g, "");
            if (!text) {
              const next = digits.slice();
              next[i] = "";
              write(next.join(""));
              return;
            }
            if (text.length > 1) {
              write(text);
              refs.current[Math.min(5, text.length)]?.focus();
              return;
            }
            const next = digits.slice();
            next[i] = text;
            write(next.join(""));
            if (i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digits[i] && i > 0) {
              const next = digits.slice();
              next[i - 1] = "";
              write(next.join(""));
              refs.current[i - 1]?.focus();
            }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (!text) return;
            event.preventDefault();
            write(text);
            refs.current[Math.min(5, text.length)]?.focus();
          }}
        />
      ))}
    </div>
  );
}
