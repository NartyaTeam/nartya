import { BookOpen, Play } from "lucide-react";

/** `media_type` des favoris et des listes ; les lignes anciennes n'en ont pas : anime. */
export const mediaOf = (row) => (row?.media_type === "manga" ? "manga" : "anime");

const TABS = [
  { value: "anime", label: "Animes", Icon: Play },
  { value: "manga", label: "Mangas", Icon: BookOpen },
];

/** Onglets Animes / Mangas des favoris, des listes et de l'historique. */
export default function MediaTabs({ value, onChange, counts, className = "" }) {
  return (
    <div
      role="tablist"
      className={`flex h-11 w-fit items-center gap-1 rounded-md bg-surface p-1 ring-2 ring-border md:h-10 ${className}`}
    >
      {TABS.map(({ value: tab, label, Icon }) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          onClick={() => onChange(tab)}
          className={`flex h-full items-center gap-1.5 rounded px-3.5 text-xs font-bold transition-colors ${
            value === tab ? "bg-primary text-primary-fg" : "text-muted hover:text-text"
          }`}
        >
          <Icon size={14} />
          {label}
          {counts && <span className="tabular-nums opacity-70">{counts[tab] ?? 0}</span>}
        </button>
      ))}
    </div>
  );
}
