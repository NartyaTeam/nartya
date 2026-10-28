import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Compass, Heart, LayoutGrid, ListOrdered, Play, Search, X } from "lucide-react";
import { listFavorites, reorderFavorites } from "@/api/favorites";
import { getFavoritesProgress } from "@/api/progress";
import { toast } from "@/lib/toast";
import FavoriteCard from "@/components/favorites/FavoriteCard";
import SortableGrid from "@/components/lists/SortableGrid";
import MediaTabs, { mediaOf } from "@/components/lists/MediaTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

// Les cartes gardent une largeur de 170 à 210 px.
const GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-x-5 sm:gap-y-8";

export default function FavoritesPage() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState(null);
  const [progress, setProgress] = useState({});
  const [query, setQuery] = useState("");
  // "manual" = liste plate réordonnable. Une recherche active force le groupement par genre.
  const [sortMode, setSortMode] = useState("genre");
  // Les mangas mis de côté ont leur onglet, au lieu d'être noyés parmi les animes.
  const [media, setMedia] = useState("anime");

  useEffect(() => {
    let alive = true;
    listFavorites()
      .then((rows) => {
        if (alive) setFavorites(rows);
      })
      .catch(() => {
        if (alive) setFavorites([]);
      });
    // Pour les infobulles.
    getFavoritesProgress()
      .then((map) => {
        if (alive) setProgress(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const counts = useMemo(() => {
    const out = { anime: 0, manga: 0 };
    for (const f of favorites || []) out[mediaOf(f)]++;
    return out;
  }, [favorites]);
  // Sans manga, pas d'onglets : la page reste celle des animes.
  const activeMedia = counts.manga > 0 ? media : "anime";

  const filtered = useMemo(() => {
    if (!favorites) return null;
    const q = query.trim().toLowerCase();
    return favorites.filter(
      (f) =>
        mediaOf(f) === activeMedia &&
        (!q || (f.anime_title || f.anime_slug || "").toLowerCase().includes(q))
    );
  }, [favorites, query, activeMedia]);

  // Du plus fourni au moins fourni ; « Non classé » en dernier.
  const groups = useMemo(() => {
    if (!filtered) return null;
    const byGenre = new Map();
    for (const fav of filtered) {
      const key = fav.genre || "Non classé";
      if (!byGenre.has(key)) byGenre.set(key, []);
      byGenre.get(key).push(fav);
    }
    return [...byGenre.entries()].sort(([a, itemsA], [b, itemsB]) => {
      if (a === "Non classé") return 1;
      if (b === "Non classé") return -1;
      return itemsB.length - itemsA.length;
    });
  }, [filtered]);

  const hasFavorites = favorites !== null && favorites.length > 0;
  const flatMode = sortMode === "manual" && !query.trim();

  const reorderRows = (slugOrder) => {
    const snapshot = favorites;
    setFavorites((current) => {
      if (!current) return current;
      const bySlug = new Map(current.map((f) => [f.anime_slug, f]));
      const moved = new Set(slugOrder);
      // L'onglet affiché seul est réordonné ; l'autre garde sa place.
      return [
        ...slugOrder.map((slug) => bySlug.get(slug)).filter(Boolean),
        ...current.filter((f) => !moved.has(f.anime_slug)),
      ];
    });
    reorderFavorites(slugOrder).catch(() => {
      toast.error("Impossible d'enregistrer le nouvel ordre");
      setFavorites(snapshot);
    });
  };

  return (
    <div className="animate-fade-in px-4 pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:py-10">
      <header className="mb-7 md:mb-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-px w-6 bg-primary" />
              <p className="text-2xs font-semibold uppercase tracking-[0.28em] text-primary/80">
                Ma collection
              </p>
            </div>
            <div className="flex items-baseline gap-2.5">
              <h1 className="t-impact text-4xl md:text-5xl">
                Favoris
              </h1>
              {hasFavorites && (
                <span className="text-sm font-medium tabular-nums text-muted">
                  {favorites.length}
                </span>
              )}
            </div>
          </div>
          {hasFavorites && (
            <Heart
              size={25}
              strokeWidth={1.6}
              className="mb-0.5 fill-primary/10 text-primary/70 md:hidden"
            />
          )}
        </div>
        {counts.manga > 0 && (
          <MediaTabs
            className="mt-5"
            value={activeMedia}
            onChange={setMedia}
            counts={counts}
          />
        )}
        {hasFavorites && (
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="flex h-11 flex-1 items-center gap-2.5 rounded-md bg-surface px-3.5 ring-2 ring-border transition-colors focus-within:ring-primary/70 md:h-10 md:max-w-xs">
              <Search size={16} className="shrink-0 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher dans mes favoris…"
                aria-label="Rechercher dans mes favoris"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Effacer la recherche"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted active:bg-white/10 active:text-text"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="flex h-11 shrink-0 items-center gap-1 self-start rounded-md bg-surface p-1 ring-2 ring-border md:h-10">
              <button
                type="button"
                onClick={() => setSortMode("genre")}
                className={`flex h-full items-center gap-1.5 rounded px-3 text-xs font-bold transition-colors ${
                  sortMode === "genre" ? "bg-primary text-primary-fg" : "text-muted hover:text-text"
                }`}
              >
                <LayoutGrid size={14} />
                Par genre
              </button>
              <button
                type="button"
                onClick={() => setSortMode("manual")}
                className={`flex h-full items-center gap-1.5 rounded px-3 text-xs font-bold transition-colors ${
                  sortMode === "manual" ? "bg-primary text-primary-fg" : "text-muted hover:text-text"
                }`}
              >
                <ListOrdered size={14} />
                Mon ordre
              </button>
            </div>
          </div>
        )}
        {sortMode === "manual" && query.trim() && (
          <p className="mt-2.5 text-xs text-muted">
            Le tri manuel reprendra une fois la recherche effacée.
          </p>
        )}
      </header>

      {favorites === null ? (
        <div className={GRID_CLASS}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] skeleton" />
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Ta collection commence ici"
          description="Ajoute tes animes préférés depuis leur fiche pour les retrouver ici."
          action={
            <Button icon={Compass} onClick={() => navigate("/recherche")}>
              Explorer le catalogue
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          icon={query.trim() ? Search : activeMedia === "manga" ? BookOpen : Play}
          description={
            query.trim()
              ? `Aucun favori ne correspond à « ${query.trim()} ».`
              : activeMedia === "manga"
                ? "Aucun manga dans tes favoris."
                : "Aucun anime dans tes favoris."
          }
        />
      ) : flatMode ? (
        <SortableGrid
          items={filtered}
          getId={(fav) => fav.anime_slug}
          onReorder={reorderRows}
          className={`isolate ${GRID_CLASS}`}
          renderItem={(fav) => (
            <FavoriteCard
              anime={{
                slug: fav.anime_slug,
                title: fav.anime_title || fav.anime_slug,
                cover: fav.anime_cover,
              }}
              summary={progress[fav.anime_slug]}
              sortable
            />
          )}
        />
      ) : (
        <div className="space-y-10 md:space-y-12">
          {groups.map(([genre, items]) => (
            <section key={genre}>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="section-title shrink-0 !text-xl">{genre}</h2>
                <span className="text-xs font-medium tabular-nums text-muted">{items.length}</span>
                <span className="h-px flex-1 bg-gradient-to-r from-border/80 to-transparent" />
              </div>
              <div className={`isolate ${GRID_CLASS}`}>
                {items.map((fav) => (
                  <FavoriteCard
                    key={fav.anime_slug}
                    anime={{
                      slug: fav.anime_slug,
                      title: fav.anime_title || fav.anime_slug,
                      cover: fav.anime_cover,
                    }}
                    summary={progress[fav.anime_slug]}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
