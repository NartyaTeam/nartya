import { useState } from "react";
import {
  BookOpen,
  Crown,
  Feather,
  History,
  House,
  Image,
  LayoutList,
  MousePointer2,
  PanelLeft,
  Search,
  Shuffle,
  SkipForward,
  Sparkles,
  Trophy,
  TriangleAlert,
  UserRound,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import DiscordIcon from "@/components/icons/DiscordIcon";

/** Le glyphe Discord prend une classe, pas une taille. */
const DiscordGlyph = ({ size = 17, className = "" }) => (
  <span className={`inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
    <DiscordIcon className="h-full w-full" />
  </span>
);

/** Icônes nommables dans `icon` d'une ligne du changelog ; à défaut, celle de son type. */
const ICONS = {
  feather: Feather,
  users: Users,
  zap: Zap,
  tierlist: LayoutList,
  book: BookOpen,
  discord: DiscordGlyph,
  profile: UserRound,
  search: Search,
  home: House,
  shuffle: Shuffle,
  sidebar: PanelLeft,
  trophy: Trophy,
  skip: SkipForward,
  image: Image,
  pointer: MousePointer2,
  history: History,
};

const TYPES = [
  { type: "new", label: "Nouveautés", Icon: Sparkles, chip: "bg-primary/15 text-primary", count: "text-primary" },
  { type: "improved", label: "Améliorations", Icon: Zap, chip: "bg-accent/15 text-accent", count: "text-accent" },
  { type: "fixed", label: "Corrections", Icon: Wrench, chip: "bg-text/10 text-muted", count: "text-muted" },
];

export const MAX_HIGHLIGHTS = 3;

/** Titre en gras et description en gris ; une ligne ancienne, sans titre, reste un simple paragraphe. */
function ItemText({ item }) {
  if (!item.title) return <p className="text-sm leading-snug text-text/90">{item.text}</p>;
  return (
    <>
      <p className="flex items-center gap-1.5 text-sm font-semibold leading-snug">
        {item.title}
        {item.premiumOnly && <Crown size={12} className="shrink-0 text-accent" aria-label="Premium" />}
      </p>
      {item.text && <p className="mt-0.5 text-[0.8rem] leading-snug text-muted">{item.text}</p>}
    </>
  );
}

function Highlight({ item, meta }) {
  const Icon = ICONS[item.icon] || meta.Icon;
  return (
    <li className="rounded-md border border-border bg-surface-2/60 p-3 [border-top:3px_solid_rgb(var(--primary))] max-sm:flex max-sm:items-start max-sm:gap-3">
      <Icon size={20} className="shrink-0 text-primary max-sm:mt-0.5" />
      <div className="sm:mt-2">
        <ItemText item={item} />
      </div>
    </li>
  );
}

/**
 * Une version : accroche, bandeau d'avertissement, jusqu'à trois cartes « à la une », puis le reste
 * rangé par onglet. Une entrée sans `title`, `icon` ni `highlight` s'affiche comme un ancien journal.
 */
export default function ReleaseNotes({ entry }) {
  const highlights = entry.items.filter((item) => item.highlight).slice(0, MAX_HIGHLIGHTS);
  const rest = entry.items.filter((item) => !highlights.includes(item));
  const groups = TYPES.map((meta) => ({ ...meta, items: rest.filter((item) => (item.type || "improved") === meta.type) })).filter(
    (group) => group.items.length > 0
  );
  const [selected, setSelected] = useState(groups[0]?.type);
  const active = groups.find((group) => group.type === selected) || groups[0];

  return (
    <div className="space-y-4">
      {entry.notice && (
        <div className="flex items-start gap-2.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5">
          <TriangleAlert size={17} className="mt-px shrink-0 text-accent" />
          <p className="text-[0.8rem] leading-snug">{entry.notice}</p>
        </div>
      )}

      {highlights.length > 0 && (
        <section aria-label="À la une">
          <h3 className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">À la une</h3>
          <ul className="grid gap-2.5 sm:grid-cols-3">
            {highlights.map((item, index) => (
              <Highlight key={index} item={item} meta={TYPES.find((t) => t.type === item.type) || TYPES[0]} />
            ))}
          </ul>
        </section>
      )}

      {groups.length > 0 && (
        <section>
          <div role="tablist" aria-label="Type de changement" className="flex border-b border-border">
            {groups.map((group) => (
              <button
                key={group.type}
                type="button"
                role="tab"
                aria-selected={group.type === active.type}
                onClick={() => setSelected(group.type)}
                className={`flex-1 border-b-2 px-1.5 py-2 text-[0.8rem] font-medium transition-colors ${
                  group.type === active.type
                    ? "border-primary text-text"
                    : "border-transparent text-muted hover:text-text"
                }`}
              >
                {group.label} <span className={group.count}>{group.items.length}</span>
              </button>
            ))}
          </div>

          <ul>
            {active.items.map((item, index) => {
              const Icon = ICONS[item.icon] || active.Icon;
              return (
                <li key={`${active.type}-${index}`} className="flex gap-3 border-b border-border/70 py-3 last:border-b-0">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${active.chip}`}>
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <ItemText item={item} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
