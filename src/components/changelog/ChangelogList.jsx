import { Crown } from "lucide-react";

/** Étiquette en parallélogramme, comme les numéros d'épisode. */
const TYPE_META = {
  new: { label: "Nouveau", tag: "bg-primary text-primary-fg" },
  improved: { label: "Amélioré", tag: "bg-accent text-primary-fg" },
  fixed: { label: "Corrigé", tag: "bg-text/90 text-primary-fg" },
};
const PREMIUM_META = { label: "Premium", tag: "bg-accent text-primary-fg" };

// Les nouveautés d'abord, puis les améliorations, puis les corrections.
const ORDER = { new: 0, improved: 1, fixed: 2 };
const sortItems = (items) =>
  [...items].sort((a, b) => (ORDER[a.type] ?? 1) - (ORDER[b.type] ?? 1));

function Tag({ meta, premium }) {
  return (
    <span
      className={`inline-flex w-[4.9rem] shrink-0 items-center justify-center gap-1 py-[3px] pl-2 pr-3 font-impact text-[0.7rem] uppercase leading-none tracking-wide [clip-path:polygon(0_0,100%_0,calc(100%_-_7px)_100%,0_100%)] ${meta.tag}`}
    >
      {premium && <Crown size={11} strokeWidth={2.5} />}
      {meta.label}
    </span>
  );
}

export default function ChangelogList({ entries, card = false, showHeader = true }) {
  return (
    <div className={card ? "space-y-4" : "space-y-5"}>
      {entries.map((entry, entryIndex) => (
        <section
          key={entry.version}
          className={card ? "overflow-hidden rounded-md border-2 border-border bg-surface/60" : ""}
        >
          {(card || showHeader) && (
            <div
              className={
                card
                  ? "flex items-center justify-between gap-3 border-b-2 border-border px-4 py-2.5"
                  : "mb-3 flex items-center gap-3 border-b-2 border-border pb-2"
              }
            >
              <h2 className="section-title !text-lg">v{entry.version}</h2>
              {card && entryIndex === 0 && (
                <span className="rounded bg-primary px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wider text-primary-fg">
                  Récent
                </span>
              )}
              {entry.date && <span className="ml-auto text-[0.7rem] font-medium text-muted">{entry.date}</span>}
            </div>
          )}

          <ul className={card ? "divide-y-2 divide-border/60 px-4" : "space-y-2.5"}>
            {sortItems(entry.items).map((item, itemIndex) => {
              const meta = item.premiumOnly ? PREMIUM_META : TYPE_META[item.type] || TYPE_META.improved;
              return (
                <li
                  key={`${entry.version}-${itemIndex}`}
                  className={`flex items-start gap-2.5 animate-fade-in-fast ${card ? "py-3" : ""} ${
                    item.premiumOnly && !card ? "rounded-md border-2 border-accent/40 bg-accent/[0.06] p-2" : ""
                  }`}
                  style={{ animationDelay: `${Math.min(entryIndex * 4 + itemIndex, 10) * 45}ms` }}
                >
                  <Tag meta={meta} premium={!!item.premiumOnly} />
                  <p className="min-w-0 flex-1 text-sm leading-snug text-text/90">{item.text}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
