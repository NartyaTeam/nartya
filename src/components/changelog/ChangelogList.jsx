import { Crown, Sparkles, TrendingUp, Wrench } from "lucide-react";

const TYPE_META = {
  new: { label: "Nouveau", Icon: Sparkles, cls: "text-primary" },
  improved: {
    label: "Amélioration",
    Icon: TrendingUp,
    cls: "text-sky-400",
  },
  fixed: {
    label: "Correction",
    Icon: Wrench,
    cls: "text-emerald-400",
  },
};
const PREMIUM_META = {
  label: "Premium",
  Icon: Crown,
  cls: "text-amber-300",
};

export default function ChangelogList({ entries, card = false }) {
  return (
    <div className={card ? "space-y-4" : "space-y-6"}>
      {entries.map((entry, entryIndex) => (
        <section
          key={entry.version}
          className={
            card
              ? "overflow-hidden rounded-lg border border-border/80 bg-surface/75 shadow-sm"
              : ""
          }
        >
          <div
            className={
              card
                ? "flex items-center justify-between border-b border-border/70 px-4 py-3.5"
                : "mb-3 flex items-baseline gap-2"
            }
          >
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-sm font-black tracking-tight text-text">
                v{entry.version}
              </h2>
              {entryIndex === 0 && card ? (
                <span className="rounded-sm border border-primary/20 bg-primary/[0.08] px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wider text-primary">
                  Récent
                </span>
              ) : null}
            </div>
            {entry.date && <span className="text-[0.68rem] text-muted">{entry.date}</span>}
          </div>

          <ul className={card ? "divide-y divide-border/55 px-4" : "space-y-2.5"}>
            {entry.items.map((item, itemIndex) => {
              const meta = item.premiumOnly
                ? PREMIUM_META
                : TYPE_META[item.type] || TYPE_META.improved;
              const { Icon } = meta;
              return (
                <li
                  key={`${entry.version}-${itemIndex}`}
                  className={
                    card
                      ? "flex gap-3 py-3.5"
                      : `flex gap-3 ${
                          item.premiumOnly
                            ? "rounded-md border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2.5"
                            : ""
                        }`
                  }
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-start justify-center pt-0.5 ${meta.cls}`}
                  >
                    <Icon size={16} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[0.62rem] font-bold uppercase tracking-wider ${meta.cls}`}>
                      {meta.label}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{item.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
