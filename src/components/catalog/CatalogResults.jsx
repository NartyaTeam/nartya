import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import AnimeCard from "@/components/home/AnimeCard";

const GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]";

/** `fetchPage(page)` renvoie [{ slug, title, image }]. Changer `resetKey` réinitialise la liste. */
export default function CatalogResults({
  fetchPage,
  resetKey,
  emptyLabel = "Aucun résultat.",
  openScans = false,
  gridClassName = GRID_CLASS,
  cardProps = {},
}) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const seenRef = useRef(new Set());
  const reqRef = useRef(0);
  // Souvent recréée à chaque rendu : passée par une ref.
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  useEffect(() => {
    seenRef.current = new Set();
    setItems([]);
    setPage(1);
    setDone(false);
    setError(false);
    setLoading(true);
  }, [resetKey]);

  useEffect(() => {
    if (done && page > 1) return;
    const id = ++reqRef.current;
    setLoading(true);
    Promise.resolve(fetchRef.current(page))
      .then((batch) => {
        if (id !== reqRef.current) return;
        const list = Array.isArray(batch) ? batch : [];
        const fresh = list.filter((a) => a.slug && !seenRef.current.has(a.slug));
        fresh.forEach((a) => seenRef.current.add(a.slug));
        setItems((prev) => [...prev, ...fresh]);
        if (!list.length || !fresh.length) setDone(true); // fin de pagination
        setError(false);
      })
      .catch(() => {
        if (id !== reqRef.current) return;
        setError(true);
        setDone(true);
      })
      .finally(() => {
        if (id === reqRef.current) setLoading(false);
      });
  }, [resetKey, page, done]);

  const loadMore = useCallback(() => {
    if (!loading && !done) setPage((p) => p + 1);
  }, [loading, done]);

  if (loading && !items.length) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted">
        <Loader2 className="animate-spin" size={20} />
        Chargement…
      </div>
    );
  }

  if (!items.length) {
    return (
      <p className="py-20 text-center text-muted">
        {error ? "Impossible de charger les résultats." : emptyLabel}
      </p>
    );
  }

  return (
    <>
      <div className={gridClassName}>
        {items.map((a) => (
          <AnimeCard
            key={a.slug}
            anime={{ ...a, cover: a.cover || a.image }}
            openScans={openScans}
            {...cardProps}
          />
        ))}
      </div>
      <div className="mt-10 flex justify-center">
        {!done ? (
          <button
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-text ring-1 ring-border transition-colors hover:bg-white/[0.1] hover:text-primary disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={15} /> : null}
            Charger plus
          </button>
        ) : (
          <p className="text-xs text-muted/60">— fin —</p>
        )}
      </div>
    </>
  );
}
