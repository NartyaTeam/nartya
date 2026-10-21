import { forwardRef } from "react";
import { readableTextColor } from "@/lib/tierLists";

/** Affiche + nom en bas, comme sur TierMaker. */
export const TierPoster = forwardRef(function TierPoster({ item, className = "", dimmed = false, ...props }, ref) {
  return (
    <div
      ref={ref}
      title={item.title}
      className={`relative aspect-[5/7] w-[4.5rem] shrink-0 select-none overflow-hidden bg-surface-2 sm:w-[5.25rem] ${
        dimmed ? "opacity-40" : ""
      } ${className}`}
      {...props}
    >
      {item.cover ? (
        <img src={item.cover} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-1 text-center text-[0.6rem] font-bold text-muted">
          {item.title}
        </div>
      )}
      <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-1 pb-0.5 pt-3 text-center text-[0.6rem] font-bold leading-tight text-white sm:text-[0.65rem]">
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
      className={`flex w-20 shrink-0 items-center justify-center break-words px-1.5 py-2 text-center text-xs font-bold leading-tight sm:w-28 sm:text-sm ${
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
    <div className="overflow-hidden rounded-md bg-black ring-2 ring-border">
      {tiers.map((tier) => (
        <div key={tier.id} className="flex min-h-[calc(4.5rem*1.4)] border-b-2 border-black last:border-b-0 sm:min-h-[calc(5.25rem*1.4)]">
          <TierLabel tier={tier} />
          <div className="flex flex-1 flex-wrap content-start gap-0.5 bg-surface/70 p-0.5">
            {(tier.items || []).map((item) =>
              onOpen ? (
                <button key={item.slug} type="button" onClick={() => onOpen(item)} className="transition-transform hover:scale-[1.03]">
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
