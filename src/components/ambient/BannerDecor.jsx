import { ITEMS } from "@/lib/cosmetics";
import { KurotsukiBannerDecor } from "./KurotsukiArt";

/**
 * L'image « overlay » est découpée en deux par `clip-path` : coin haut-gauche sous le voile
 * de l'en-tête (`layer="back"`), coin bas-droit par-dessus (`layer="front"`).
 */
export default function BannerDecor({ token, layer = "back" }) {
  if (token === "kurotsuki") return <KurotsukiBannerDecor layer={layer} />;
  const src = ITEMS.banner[token]?.asset;
  if (!src) return null;
  const front = layer === "front";
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      // L'asset 3:1 garde son ratio, chaque moitié ancrée à son coin.
      className={`pointer-events-none absolute inset-0 h-full w-full select-none object-fill sm:inset-auto sm:h-full sm:w-auto ${
        front ? "sm:right-0 sm:top-0" : "sm:left-0 sm:top-0"
      }`}
      style={{ clipPath: front ? "inset(0 0 0 50%)" : "inset(0 50% 0 0)" }}
    />
  );
}
