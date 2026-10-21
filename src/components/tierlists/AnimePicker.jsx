import { useEffect, useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Check, Clock, Heart, ListChecks, Loader2, Plus, Search, Tags } from "lucide-react";
import { searchAnimes, searchCatalog } from "@/api/animeApi";
import { listFavorites } from "@/api/favorites";
import { listMyAnimeLists } from "@/api/lists";
import { getWatchHistory } from "@/api/history";
import { LIST_STATUSES } from "@/utils/lists";
import { MAIN_GENRES } from "@/utils/genres";
import { mediaOf } from "@/components/lists/MediaTabs";
import { useHasAccount } from "@/lib/guest";
import { useDisplayTitle } from "@/stores/useTitlesStore";
import { toItem } from "@/lib/tierLists";
import { TierPoster } from "./TierBoard";

const SOURCES = [
  { value: "search", label: "Recherche", Icon: Search },
  { value: "favorites", label: "Favoris", Icon: Heart, account: true },
  { value: "lists", label: "Mes listes", Icon: ListChecks, account: true },
  { value: "history", label: "Historique", Icon: Clock, account: true },
  { value: "genre", label: "Genres", Icon: Tags },
];

/** Glissable directement dans une rangée ; un clic l'ajoute aux « Non classés ». */
function PickPoster({ item, added, onAdd }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pick:${item.slug}`,
    data: { type: "pick", item },
    disabled: added,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={added}
      onClick={() => onAdd([item])}
      style={{ touchAction: added ? undefined : "none", opacity: isDragging ? 0.35 : 1 }}
      className="relative cursor-grab transition-transform enabled:hover:scale-[1.04] disabled:cursor-default active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <TierPoster item={item} dimmed={added} />
      {added && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg">
          <Check size={12} />
        </span>
      )}
    </button>
  );
}

const chip = (active) =>
  `h-8 shrink-0 rounded-full px-3 text-xs font-bold transition-colors ${
    active ? "bg-primary text-primary-fg" : "bg-white/[0.06] text-muted ring-1 ring-border hover:text-text"
  }`;

/**
 * Ajoute des animes au bac « non classés ». `has(slug)` : déjà dans la tier list.
 * `onAdd(items)` reçoit des éléments au format de la tier list.
 */
export default function AnimePicker({ has, onAdd }) {
  const hasAccount = useHasAccount();
  const displayTitle = useDisplayTitle();
  const [source, setSource] = useState("search");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("completed");
  const [genre, setGenre] = useState(MAIN_GENRES[0]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (source === "search" && !query.trim()) return [];
      if (source === "search") return (await searchAnimes(query, 30)) || [];
      if (source === "favorites") {
        return (await listFavorites())
          .filter((f) => mediaOf(f) === "anime")
          .map((f) => ({ slug: f.anime_slug, title: f.anime_title, cover: f.anime_cover }));
      }
      if (source === "lists") {
        return (await listMyAnimeLists())
          .filter((r) => r.status === status && mediaOf(r) === "anime")
          .map((r) => ({ slug: r.anime_slug, title: r.anime_title, cover: r.anime_cover }));
      }
      if (source === "history") return getWatchHistory();
      return (await searchCatalog({ genres: [genre], page: 1 })) || [];
    };
    setLoading(true);
    const timer = setTimeout(
      () =>
        run()
          .then((rows) => alive && setResults(rows.filter((r) => r?.slug).map(toItem)))
          .catch(() => alive && setResults([]))
          .finally(() => alive && setLoading(false)),
      source === "search" ? 300 : 0
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [source, query, status, genre]);

  const fresh = useMemo(() => results.filter((r) => !has(r.slug)), [results, has]);
  const label = (item) => ({ ...item, title: displayTitle(item.slug, item.title) });

  return (
    <div className="rounded-md bg-surface/80 p-3 ring-2 ring-border">
      <div className="flex flex-wrap gap-1.5 pb-2">
        {SOURCES.filter((s) => !s.account || hasAccount).map(({ value, label: text, Icon }) => (
          <button key={value} type="button" onClick={() => setSource(value)} className={`${chip(source === value)} flex items-center gap-1.5`}>
            <Icon size={13} /> {text}
          </button>
        ))}
      </div>

      {source === "search" && (
        <div className="mb-2 flex h-10 items-center gap-2.5 rounded-md bg-bg/60 px-3 ring-2 ring-border focus-within:ring-primary/70">
          <Search size={15} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un anime à ajouter…"
            aria-label="Chercher un anime à ajouter"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </div>
      )}
      {source === "lists" && (
        <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
          {LIST_STATUSES.map((s) => (
            <button key={s.key} type="button" onClick={() => setStatus(s.key)} className={chip(status === s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      {source === "genre" && (
        <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
          {MAIN_GENRES.map((g) => (
            <button key={g} type="button" onClick={() => setGenre(g)} className={chip(genre === g)}>
              {g}
            </button>
          ))}
        </div>
      )}

      <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {loading
            ? "Chargement…"
            : source === "search" && !query.trim()
              ? "Tape le nom d'un anime, en français, anglais ou japonais."
              : `${results.length} anime${results.length > 1 ? "s" : ""} : glisse-les dans une rangée, ou clique pour les mettre de côté`}
        </p>
        {fresh.length > 1 && !loading && (
          <button
            type="button"
            onClick={() => onAdd(fresh.map(label))}
            className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary/15 px-2.5 text-xs font-bold text-primary hover:bg-primary/25"
          >
            <Plus size={13} /> Tout ajouter ({fresh.length})
          </button>
        )}
      </div>

      <div className="max-h-[22rem] overflow-y-auto">
        {loading && !results.length ? (
          <div className="flex justify-center py-8 text-muted">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {results.map((item) => (
              <PickPoster key={item.slug} item={label(item)} added={has(item.slug)} onAdd={onAdd} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
