import { useEffect, useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { searchAnimes } from "@/api/animeApi";
import { useDisplayTitle } from "@/stores/useTitlesStore";
import { toItem } from "@/lib/tierLists";
import { TierPoster } from "./TierBoard";

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

/**
 * Recherche d'animes à ajouter. `has(slug)` : déjà dans la tier list.
 * `onAdd(items)` reçoit des éléments au format de la tier list.
 */
export default function AnimePicker({ has, onAdd }) {
  const displayTitle = useDisplayTitle();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const term = query.trim();

  useEffect(() => {
    if (!term) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(
      () =>
        searchAnimes(term, 30)
          .then((rows) => alive && setResults((rows || []).filter((r) => r?.slug).map(toItem)))
          .catch(() => alive && setResults([]))
          .finally(() => alive && setLoading(false)),
      300
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term]);

  const fresh = useMemo(() => results.filter((r) => !has(r.slug)), [results, has]);
  const label = (item) => ({ ...item, title: displayTitle(item.slug, item.title) });

  return (
    <section aria-label="Ajouter des animes" className="w-full">
      <div className="mx-auto flex h-12 max-w-2xl items-center gap-3 rounded-md bg-surface px-4 ring-2 ring-border transition-colors focus-within:ring-primary/70">
        {loading ? (
          <Loader2 size={18} className="shrink-0 animate-spin text-muted" />
        ) : (
          <Search size={18} className="shrink-0 text-muted" />
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un anime à ajouter…"
          aria-label="Chercher un anime à ajouter"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Effacer la recherche"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:text-text"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {term && !loading && (
        <div className="mt-3 rounded-md bg-surface p-3 ring-2 ring-border">
          {results.length ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">Glisse un anime dans une rangée, ou clique pour le mettre de côté.</p>
                {fresh.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onAdd(fresh.map(label))}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary/15 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/25"
                  >
                    <Plus size={14} /> Tout ajouter ({fresh.length})
                  </button>
                )}
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {results.map((item) => (
                  <PickPoster key={item.slug} item={label(item)} added={has(item.slug)} onAdd={onAdd} />
                ))}
              </div>
            </>
          ) : (
            <p className="py-4 text-center text-xs text-muted">Aucun résultat pour « {term} ».</p>
          )}
        </div>
      )}
    </section>
  );
}
