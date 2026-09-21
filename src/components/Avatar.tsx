export function Avatar({ src, name, size = 28 }: { src?: string; name: string; size?: number }) {
  const letter = (name || "?").slice(0, 1).toUpperCase();
  if (src) {
    return (
      <img
        className="avatar"
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {letter}
    </span>
  );
}
