import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Flame, LayoutGrid, LayoutList, List, Loader2, Plus, Search, Sparkles, User, X } from "lucide-react";
import { listTierLists } from "@/api/tierLists";
import { useHasAccount, guestBlockToast, GUEST_FEATURE_MSG } from "@/lib/guest";
import { useAuthStore } from "@/stores/useAuthStore";
import TierListCard from "@/components/tierlists/TierListCard";
import SegmentedControl from "@/components/ui/SegmentedControl";

const PAGE = 24;
/** Chargement serveur par appel (maximum accepté par la fonction). */
const FETCH = 48;
/** Classement « populaires » : tout est chargé puis trié ici, au plus ce nombre de listes. */
const POPULAR_CAP = 240;
const VIEW_KEY = "nartya:tierlists:view";
const VIEWS = [
  { value: "blocks", label: "Blocs", Icon: LayoutGrid },
  { value: "list", label: "Liste", Icon: List },
];

/** Les plus aimées d'abord, puis les plus commentées, puis les plus récentes : ce que montrent les cartes. */
const byPopularity = (a, b) =>
  b.likes - a.likes ||
  b.comments - a.comments ||
  new Date(b.publishedAt || b.createdAt || 0) - new Date(a.publishedAt || a.createdAt || 0);

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "blocks";
  } catch {
    return "blocks";
  }
}
const TABS = [
  { value: "popular", label: "Populaires", Icon: Flame },
  { value: "recent", label: "Récentes", Icon: Sparkles },
  { value: "mine", label: "Mes tier lists", Icon: User, account: true },
];

export default function TierListsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const hasAccount = useHasAccount();
  const session = useAuthStore((s) => s.session);
  const tab = TABS.some((t) => t.value === params.get("tab")) ? params.get("tab") : "popular";
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState("");
  const [items, setItems] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState(readView);
  // Classement « populaires » : liste complète triée ici, affichée par tranches.
  const [shown, setShown] = useState(PAGE);

  const changeView = (value) => {
    setView(value);
    try {
      localStorage.setItem(VIEW_KEY, value);
    } catch {
      // le choix reste valable pour la session
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setCommitted(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (offset) => {
      setLoading(true);
      try {
        if (tab === "popular") {
          // La fonction classe sur likes moins dislikes ; les cartes montrent les likes et les
          // commentaires, on charge donc tout et on trie sur ce qui est affiché.
          const all = [];
          for (let at = 0; at < POPULAR_CAP; at += FETCH) {
            const rows = await listTierLists({ sort: tab, query: committed, offset: at, limit: FETCH });
            all.push(...rows);
            if (rows.length < FETCH) break;
          }
          setItems(all.sort(byPopularity));
          setShown(PAGE);
          setDone(true);
          return;
        }
        const rows = await listTierLists({ sort: tab, query: committed, offset, limit: PAGE });
        setItems((prev) => (offset ? [...(prev || []), ...rows] : rows));
        setDone(rows.length < PAGE);
      } catch {
        if (!offset) setItems([]);
        setDone(true);
      } finally {
        setLoading(false);
      }
    },
    [tab, committed]
  );

  useEffect(() => {
    setItems(null);
    load(0);
  }, [load]);

  const popular = tab === "popular";
  const visible = popular && items ? items.slice(0, shown) : items;
  const more = popular ? Boolean(items) && shown < items.length : !done;
  const gridClass =
    view === "list"
      ? "flex flex-col gap-2"
      : "grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4";

  const create = () => {
    if (!hasAccount) {
      guestBlockToast(session ? GUEST_FEATURE_MSG : "Connecte-toi pour créer une tier list");
      return;
    }
    navigate("/tierlists/new");
  };

  return (
    <div className="animate-fade-in px-4 pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:py-10">
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-px w-6 bg-primary" />
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Communauté</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="t-impact text-4xl md:text-5xl">Tier lists</h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted">
              Classe tes animes, publie ta tier list et découvre celles de la communauté.
            </p>
          </div>
          <button
            onClick={create}
            className="flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-fg transition-[filter,transform] hover:brightness-110 active:scale-95 md:h-10"
          >
            <Plus size={17} /> Créer une tier list
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md bg-surface px-3.5 ring-2 ring-border transition-colors focus-within:ring-primary/70 md:h-10">
            <Search size={16} className="shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une tier list…"
              aria-label="Rechercher une tier list"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer la recherche"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted active:bg-white/10 active:text-text"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <SegmentedControl label="Affichage" options={VIEWS} value={view} onChange={changeView} />
            <SegmentedControl
              label="Tier lists à afficher"
              options={TABS.filter((t) => !t.account || hasAccount)}
              value={tab}
              onChange={(value) => setParams(value === "popular" ? {} : { tab: value }, { replace: true })}
            />
          </div>
        </div>
      </header>

      {items === null ? (
        <div className={gridClass}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={`${view === "list" ? "h-[4.25rem]" : "h-[19.5rem]"} skeleton rounded-md`} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[40dvh] flex-col items-center justify-center rounded-md border-2 border-dashed border-border px-7 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-md bg-primary/10 text-primary">
            <LayoutList size={24} />
          </span>
          <p className="mt-4 max-w-sm text-sm text-muted">
            {committed
              ? `Aucune tier list ne correspond à « ${committed} ».`
              : tab === "mine"
                ? "Tu n'as pas encore de tier list. Lance-toi !"
                : "Aucune tier list publiée pour l'instant. Sois le premier !"}
          </p>
          {!committed && (
            <button
              onClick={create}
              className="mt-5 flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-fg active:scale-95"
            >
              <Plus size={16} /> Créer une tier list
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={gridClass}>
            {visible.map((list) => (
              <TierListCard key={list.id} list={list} row={view === "list"} />
            ))}
          </div>
          {more && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => (tab === "popular" ? setShown((n) => n + PAGE) : load(items.length))}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-md bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-text ring-1 ring-border transition-colors hover:bg-white/[0.1] hover:text-primary disabled:opacity-50"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                Voir plus
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
