import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Flame, LayoutList, Loader2, Plus, Search, Sparkles, User, X } from "lucide-react";
import { listTierLists } from "@/api/tierLists";
import { useHasAccount, guestBlockToast, GUEST_FEATURE_MSG } from "@/lib/guest";
import { useAuthStore } from "@/stores/useAuthStore";
import TierListCard from "@/components/tierlists/TierListCard";

const PAGE = 24;
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

  useEffect(() => {
    const timer = setTimeout(() => setCommitted(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (offset) => {
      setLoading(true);
      try {
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

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div role="tablist" className="flex h-11 w-fit items-center gap-1 rounded-md bg-surface p-1 ring-2 ring-border md:h-10">
            {TABS.filter((t) => !t.account || hasAccount).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setParams(value === "popular" ? {} : { tab: value }, { replace: true })}
                className={`flex h-full items-center gap-1.5 rounded px-3 text-xs font-bold transition-colors ${
                  tab === value ? "bg-primary text-primary-fg" : "text-muted hover:text-text"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          <div className="flex h-11 flex-1 items-center gap-2.5 rounded-md bg-surface px-3.5 ring-2 ring-border transition-colors focus-within:ring-primary/70 md:h-10 md:max-w-xs">
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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted active:bg-white/10 active:text-text"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </header>

      {items === null ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-60 skeleton rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[40dvh] flex-col items-center justify-center rounded-md border-2 border-dashed border-border px-7 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
            {items.map((list) => (
              <TierListCard key={list.id} list={list} />
            ))}
          </div>
          {!done && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => load(items.length)}
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
