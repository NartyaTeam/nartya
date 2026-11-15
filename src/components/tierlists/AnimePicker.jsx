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
import SegmentedControl from "@/components/ui/SegmentedControl";
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
      className="relative shrink-0 cursor-grab transition-transform enabled:hover:scale-[1.04] disabled:cursor-default active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <TierPoster item={item} dimmed={added} />
      {added && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-fg">
          <Check size={12} />
        </span>
      )}
    </button>
  );
}

const chip = (active) =>
  `h-8 shrink-0 rounded-md px-3 text-xs font-bold transition-colors ${
    active ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-text"
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
  const sources = SOURCES.filter((src) => !src.account || hasAccount).map(({ value, label: text, Icon }) => ({
    value,
    label: text,
    Icon,
  }));

  let hint = null;
  if (loading && !results.length) hint = <Loader2 size={18} className="animate-spin" />;
  else if (source === "search" && !query.trim()) hint = "Tape le nom d'un anime, en français, anglais ou japonais.";
  else if (!results.length) hint = "Aucun résultat.";

  return (
    <section aria-label="Ajouter des animes" className="rounded-md bg-surface ring-2 ring-border">
      <div className="flex flex-wrap items-center gap-2 p-3 pb-2">
        <div className="no-scrollbar max-w-full overflow-x-auto">
          <SegmentedControl label="Source des animes" options={sources} value={source} onChange={setSource} />
        </div>

        {source === "search" && (
          <div className="flex h-11 min-w-[12rem] flex-1 items-center gap-2.5 rounded-md bg-bg/60 px-3 ring-2 ring-border focus-within:ring-primary/70 md:h-10">
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
          <div className="no-scrollbar max-w-full overflow-x-auto">
            <SegmentedControl
              label="Statut"
              size="sm"
              options={LIST_STATUSES.map((st) => ({ value: st.key, label: st.label }))}
              value={status}
              onChange={setStatus}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {!loading && results.length > 0 && (
            <span className="hidden text-xs tabular-nums text-muted sm:inline">
              {results.length} anime{results.length > 1 ? "s" : ""}
            </span>
          )}
          {fresh.length > 1 && !loading && (
            <button
              type="button"
              onClick={() => onAdd(fresh.map(label))}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary/15 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/25"
            >
              <Plus size={14} /> Tout ajouter ({fresh.length})
            </button>
          )}
        </div>
      </div>

      {source === "genre" && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2">
          {MAIN_GENRES.map((g) => (
            <button key={g} type="button" onClick={() => setGenre(g)} className={chip(genre === g)}>
              {g}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-border px-3 py-3">
        {hint ? (
          <p className="flex min-h-[7.5rem] items-center justify-center text-center text-xs text-muted">{hint}</p>
        ) : (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {results.map((item) => (
              <PickPoster key={item.slug} item={label(item)} added={has(item.slug)} onAdd={onAdd} />
            ))}
          </div>
        )}
        {!hint && (
          <p className="mt-1.5 text-[0.7rem] text-muted">Glisse un anime dans une rangée, ou clique pour le mettre de côté.</p>
        )}
      </div>
    </section>
  );
}
