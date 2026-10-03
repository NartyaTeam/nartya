import { KUROTSUKI } from "@/lib/profileArt";
import "./kurotsuki.css";

export function KurotsukiBannerDecor({ layer = "back" }) {
  const front = layer === "front";
  return (
    <img
      src={KUROTSUKI.overlay}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      className={`pointer-events-none absolute inset-0 h-full w-full select-none object-fill sm:inset-auto sm:h-full sm:w-auto ${
        front ? "sm:right-0 sm:top-0" : "sm:left-0 sm:top-0"
      }`}
      style={{
        objectPosition: front ? "right bottom" : "left top",
        clipPath: front ? "inset(0 0 0 50%)" : "inset(0 50% 0 0)",
      }}
    />
  );
}

export function KurotsukiAvatarFrame({ className = "" }) {
  return (
    <img
      src={KUROTSUKI.frame}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      className={`pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 select-none ${className}`}
      style={{ width: "154%", height: "154%" }}
    />
  );
}

export function KurotsukiStreaks() {
  return (
    <div className="kurotsuki-streaks pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} style={{
          left: `${8 + (i * 31) % 88}%`,
          top: `${12 + (i * 19) % 70}%`,
          animationDelay: `${-i * 0.7}s`,
          animationDuration: `${4.5 + (i % 4) * 0.8}s`,
        }} />
      ))}
    </div>
  );
}
