import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Check, GripVertical, ListPlus, Loader2, Plus, Search, X } from "lucide-react";
import { listMyAnimeLists, reorderAnimeList } from "@/api/lists";
import { searchAnimes } from "@/api/animeApi";
import { getFavoritesProgress } from "@/api/progress";
import { useListsStore } from "@/stores/useListsStore";
import { LIST_STATUSES, LIST_STATUS_LABEL } from "@/utils/lists";
import ListDetailDrawer from "@/components/lists/ListDetailDrawer";
import SortableGrid from "@/components/lists/SortableGrid";
import { toast } from "@/lib/toast";

const GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-x-5 sm:gap-y-8";

const STATUS_COPY = {
  watching: ["En cours", "Les séries que tu regardes en ce moment."],
  planned: ["À voir ensuite", "Ta file d’attente, prête pour la prochaine soirée."],
  completed: ["Terminés", "Les histoires que tu as déjà parcourues."],
  dropped: ["Abandonnés", "Mis de côté, sans encombrer le reste."],
};

function dedupeLists(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const key = (row.anime_title || row.anime_slug || "").trim().toLowerCase() || row.anime_slug;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function ListCard({ row, summary, onOpen, onRemove }) {
  const watched = summary?.watchedCount || 0;

  return (
    <article className="group relative min-w-0">
      <button onClick={onOpen} className="block w-full text-left active:scale-[0.985]">
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 ring-1 ring-white/[0.06] [transform:translateZ(0)]">
          {row.anime_cover ? (
            <img
              src={row.anime_cover}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 ease-out md:group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full skeleton" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/75 to-transparent" />
          {watched > 0 && (
            <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-[0.65rem] font-semibold tabular-nums text-white backdrop-blur-md">
              {watched} ép. vu{watched > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-text transition-colors md:group-hover:text-primary">
          {row.anime_title || row.anime_slug}
        </h3>
        <p className="mt-0.5 text-[0.68rem] text-muted">
          {row.status === "planned" && !watched ? "Prêt à commencer" : LIST_STATUS_LABEL[row.status]}
        </p>
      </button>

      <button
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        title="Retirer de ma liste"
        aria-label={`Retirer ${row.anime_title || row.anime_slug} de ma liste`}
        className="absolute right-2 top-2 z-10 hidden h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white/90 opacity-0 backdrop-blur-md transition-[opacity,background-color,transform] md:flex md:hover:bg-red-500/85 md:group-hover:opacity-100"
      >
        <X size={15} />
      </button>

      {/* Le glisser-déposer fonctionne sur toute la carte. */}
      <span className="pointer-events-none absolute left-2 top-2 z-10 hidden h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white/70 opacity-0 backdrop-blur-md transition-opacity md:flex md:group-hover:opacity-100">
        <GripVertical size={15} />
      </span>
    </article>
  );
}

function AddAnimeSheet({ rows, onAdd, onClose }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(null);

  const statuses = useMemo(
    () => new Map((rows || []).map((row) => [row.anime_slug, row.status])),
    [rows]
  );

  useEffect(() => {
    const query = term.trim();
    if (!query) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchAnimes(query, 20)
        .then((items) => active && setResults(items || []))
        .catch(() => active && setResults([]))
        .finally(() => active && setSearching(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term]);

  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const add = async (anime) => {
    setAdding(anime.slug);
    await onAdd(anime);
    setAdding(null);
  };

  const hasQuery = Boolean(term.trim());

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center md:justify-center md:p-6" role="dialog" aria-modal="true" aria-label="Ajouter un anime">
      <button className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-label="Fermer" />
      <section className="relative z-10 flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-bg shadow-2xl animate-slide-up md:max-w-xl md:rounded-2xl md:border">
        <div className="px-4 pb-3 pt-3 md:px-5">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 md:hidden" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-primary/80">À regarder plus tard</p>
              <h2 className="mt-1 font-display text-xl font-bold">Ajouter un anime</h2>
            </div>
            <button onClick={onClose} aria-label="Fermer" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-muted active:bg-white/10">
              <X size={19} />
            </button>
          </div>
          <div className="mt-4 flex h-12 items-center gap-3 rounded-xl bg-white/[0.055] px-4 ring-1 ring-white/[0.08] focus-within:ring-primary/45">
            <Search size={18} className="shrink-0 text-muted" />
            <input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Quel anime veux-tu garder ?"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
            {searching ? <Loader2 size={17} className="animate-spin text-muted" /> : null}
            {!searching && term ? (
              <button onClick={() => setTerm("")} aria-label="Effacer" className="text-muted"><X size={17} /></button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-5">
          {!hasQuery ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-8 text-center text-muted">
              <Bookmark size={25} strokeWidth={1.6} className="text-primary/70" />
              <p className="mt-3 text-sm leading-relaxed">Recherche un titre et ajoute-le en un geste à ta file « À voir ».</p>
            </div>
          ) : !searching && results.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">Aucun résultat pour « {term.trim()} ».</p>
          ) : (
            <div>
              {results.map((anime) => {
                const status = statuses.get(anime.slug);
                const isAdding = adding === anime.slug;
                return (
                  <div key={anime.slug} className="flex items-center gap-3 border-b border-white/[0.055] py-2.5">
                    {anime.image ? (
                      <img src={anime.image} alt="" loading="lazy" className="h-[4.5rem] w-12 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-[4.5rem] w-12 shrink-0 rounded-md bg-surface-2" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug text-text">{anime.title}</p>
                      <p className="mt-1 text-xs text-muted">{status ? LIST_STATUS_LABEL[status] : "Ajouter à À voir"}</p>
                    </div>
                    <button
                      onClick={() => add(anime)}
                      disabled={Boolean(status) || isAdding}
                      aria-label={status ? `${anime.title} est déjà dans tes listes` : `Ajouter ${anime.title} à À voir`}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors active:scale-90 ${
                        status ? "bg-primary/10 text-primary" : "bg-primary text-primary-fg"
                      } disabled:opacity-70`}
                    >
                      {isAdding ? <Loader2 size={17} className="animate-spin" /> : status ? <Check size={18} /> : <Plus size={19} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}

export default function MyListsPage() {
  const [rows, setRows] = useState(null);
  const [progress, setProgress] = useState({});
  const [active, setActive] = useState("planned");
  const [selected, setSelected] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const removeStatus = useListsStore((state) => state.remove);
  const setStatus = useListsStore((state) => state.setStatus);

  const load = useCallback(() => {
    listMyAnimeLists()
      .then((data) => setRows(dedupeLists(data)))
      .catch(() => setRows([]));
    getFavoritesProgress().then(setProgress).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeRow = useCallback(async (slug) => {
    const snapshot = rows;
    setRows((current) => (current || []).filter((row) => row.anime_slug !== slug));
    const ok = await removeStatus(slug);
    if (!ok) setRows(snapshot);
  }, [rows, removeStatus]);

  const updateRowStatus = useCallback((slug, status) => {
    setRows((current) => (current || []).map((row) => (
      row.anime_slug === slug ? { ...row, status } : row
    )));
  }, []);

  const updateRowDates = useCallback((slug, dates) => {
    setRows((current) => (current || []).map((row) => (
      row.anime_slug === slug ? { ...row, ...dates } : row
    )));
  }, []);

  /** Nouvel ordre des animes du statut actif ; les autres statuts ne bougent pas. */
  const reorderRows = useCallback(
    (slugOrder) => {
      const snapshot = rows;
      setRows((current) => {
        if (!current) return current;
        const bySlug = new Map(current.map((row) => [row.anime_slug, row]));
        const reordered = slugOrder.map((slug) => bySlug.get(slug)).filter(Boolean);
        let cursor = 0;
        return current.map((row) => (row.status === active ? reordered[cursor++] : row));
      });
      reorderAnimeList(active, slugOrder).catch(() => {
        toast.error("Impossible d'enregistrer le nouvel ordre");
        setRows(snapshot);
      });
    },
    [rows, active]
  );

  const addAnime = useCallback(async (anime) => {
    const nextRow = {
      anime_slug: anime.slug,
      anime_title: anime.title,
      anime_cover: anime.image,
      status: "planned",
      updated_at: new Date().toISOString(),
    };
    setRows((current) => [nextRow, ...(current || [])]);
    const ok = await setStatus(anime.slug, "planned", { title: anime.title, cover: anime.image });
    if (!ok) {
      setRows((current) => current.filter((row) => row.anime_slug !== anime.slug));
      return false;
    }
    setActive("planned");
    return true;
  }, [setStatus]);

  const counts = useMemo(() => {
    const value = {};
    (rows || []).forEach((row) => {
      value[row.status] = (value[row.status] || 0) + 1;
    });
    return value;
  }, [rows]);

  const items = useMemo(
    () => (rows || []).filter((row) => row.status === active),
    [rows, active]
  );
  const [sectionTitle, sectionCopy] = STATUS_COPY[active];
  const total = rows?.length || 0;

  return (
    <div className="animate-fade-in px-4 pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:py-10">
      <header className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-px w-6 bg-primary" />
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Carnet de visionnage</p>
            </div>
            <div className="flex items-baseline gap-2.5">
              <h1 className="font-display text-[2rem] font-bold leading-none tracking-tight md:text-3xl">Mes listes</h1>
              {rows !== null && <span className="text-sm tabular-nums text-muted">{total}</span>}
            </div>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex h-10 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-fg transition-transform hover:scale-[1.03] active:scale-95"
          >
            <Plus size={17} />
            Ajouter
          </button>
        </div>
      </header>

      <div className="-mx-4 mb-7 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div className="flex min-w-max border-b border-white/[0.07] sm:min-w-0">
          {LIST_STATUSES.map((status) => {
            const isActive = active === status.key;
            return (
              <button
                key={status.key}
                onClick={() => setActive(status.key)}
                className={`relative flex min-w-[5.4rem] flex-1 items-center justify-center gap-1.5 px-2 pb-3 pt-2 text-xs font-medium transition-colors ${
                  isActive ? "text-text" : "text-muted"
                }`}
              >
                {status.label}
                <span className={`text-[0.65rem] tabular-nums ${isActive ? "text-primary" : "text-muted/65"}`}>
                  {counts[status.key] || 0}
                </span>
                {isActive && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-5">
        <h2 className="font-display text-lg font-bold text-text">{sectionTitle}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          {sectionCopy} {items.length > 1 && "Glisse une carte pour la réordonner."}
        </p>
      </div>

      {rows === null ? (
        <div className={GRID_CLASS}>
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-[2/3] skeleton rounded-xl" />)}
        </div>
      ) : items.length ? (
        <SortableGrid
          items={items}
          getId={(row) => row.anime_slug}
          onReorder={reorderRows}
          className={GRID_CLASS}
          renderItem={(row) => (
            <ListCard
              row={row}
              summary={progress[row.anime_slug]}
              onOpen={() => setSelected(row)}
              onRemove={() => removeRow(row.anime_slug)}
            />
          )}
        />
      ) : (
        <div className="flex min-h-[40dvh] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 px-7 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            {active === "planned" ? <Bookmark size={24} /> : <ListPlus size={24} />}
          </span>
          <p className="mt-4 font-display text-lg font-bold text-text">Rien ici pour le moment</p>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
            {active === "planned"
              ? "Garde ici les animes qui te tentent pour ne plus jamais les oublier."
              : `Les animes marqués « ${LIST_STATUS_LABEL[active]} » apparaîtront ici.`}
          </p>
          {active === "planned" && (
            <button onClick={() => setAddOpen(true)} className="mt-5 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg active:scale-95">
              Ajouter mon premier anime
            </button>
          )}
        </div>
      )}

      {selected && (
        <ListDetailDrawer
          row={selected}
          onClose={() => setSelected(null)}
          onStatusChange={updateRowStatus}
          onDatesChange={updateRowDates}
          onRemove={removeRow}
        />
      )}
      {addOpen && <AddAnimeSheet rows={rows} onAdd={addAnime} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
