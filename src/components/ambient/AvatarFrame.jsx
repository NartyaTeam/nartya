import { ITEMS } from "@/lib/cosmetics";

export default function AvatarFrame({ token, className = "" }) {
  const item = ITEMS.ornament[token];
  if (!item?.asset) return null;
  return (
    <img
      src={item.asset}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      className={`pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 select-none ${className}`}
      style={{ width: `${item.frameScale || 140}%`, height: `${item.frameScale || 140}%` }}
    />
  );
}
