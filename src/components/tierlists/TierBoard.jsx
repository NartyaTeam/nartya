import { forwardRef } from "react";
import { kindOfSlug, readableTextColor } from "@/lib/tierLists";

/** Affiche + nom en bas, comme sur TierMaker. */
export const TierPoster = forwardRef(function TierPoster({ item, className = "", dimmed = false, ...props }, ref) {
  return (
    <div
      ref={ref}
      title={item.title}
      className={`relative w-[var(--tp,4.5rem)] shrink-0 select-none overflow-hidden bg-surface-2 sm:w-[var(--tp,5.25rem)] ${
        kindOfSlug(item.slug) === "music" ? "aspect-square" : "aspect-[5/7]"
      } ${dimmed ? "opacity-40" : ""} ${className}`}
      {...props}
    >
      {item.cover ? (
        <img src={item.cover} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-1 text-center text-[0.6rem] font-bold text-muted">
          {item.title}
        </div>
      )}
      <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-1 pb-0.5 pt-3 text-center text-[0.6rem] font-bold leading-tight text-white sm:text-[0.65rem] lg:text-xs 2xl:text-sm">
        {item.title}
      </span>
    </div>
  );
});

export function TierLabel({ tier, onClick, className = "" }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={{ background: tier.color, color: readableTextColor(tier.color) }}
      className={`flex w-[var(--tl,5rem)] shrink-0 items-center justify-center break-words px-1.5 py-2 text-center text-xs font-bold leading-tight sm:w-[var(--tl,7rem)] sm:text-sm 2xl:text-base ${
        onClick ? "transition-[filter] hover:brightness-110" : ""
      } ${className}`}
    >
      {tier.label || " "}
    </Tag>
  );
}

/** Lecture seule. `onOpen(item)` au clic sur une affiche. */
export default function TierBoard({ tiers, onOpen }) {
  return (
    // Les affiches grandissent avec l'écran : sur un grand moniteur, le tableau remplit la colonne.
    <div className="overflow-hidden rounded-md bg-black ring-2 ring-border [--tl:5rem] [--tp:4.5rem] sm:[--tl:7rem] sm:[--tp:5.25rem] lg:[--tl:8rem] lg:[--tp:6rem] xl:[--tp:6.25rem] 2xl:[--tl:10rem] 2xl:[--tp:7.5rem] min-[1900px]:[--tl:11rem] min-[1900px]:[--tp:8.5rem]">
      {tiers.map((tier) => (
        <div key={tier.id} className="flex min-h-[calc(var(--tp)*1.4+0.25rem)] border-b-2 border-black last:border-b-0">
          <TierLabel tier={tier} />
          <div className="flex flex-1 flex-wrap content-start gap-0.5 bg-surface/70 p-0.5">
            {(tier.items || []).map((item) =>
              onOpen ? (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => onOpen(item)}
                  className="outline-2 -outline-offset-2 outline-primary hover:outline"
                >
                  <TierPoster item={item} />
                </button>
              ) : (
                <TierPoster key={item.slug} item={item} />
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
