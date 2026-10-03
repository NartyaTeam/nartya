import { useEffect, useRef, useState } from "react";
import { platform } from "@/platform";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, X, Loader2, ArrowLeft, SlidersHorizontal } from "lucide-react";
import { searchAnimes } from "@/api/animeApi";
import { CATALOG_GENRES } from "@/utils/genres";
import { EPISODE_RANGES } from "@/utils/episodeRanges";

// Valeurs exactes attendues par le catalogue.
const TYPE_OPTIONS = [
  { value: "", label: "Tous" },
  { value: "Anime", label: "Anime" },
  { value: "Film", label: "Film" },
];

/** Transparente au-dessus du hero, voilée au scroll. */
/** Avec Ctrl, ou Cmd sur macOS. Ctrl+F est géré à part. */
const SHORTCUT_ROUTES = { j: "/downloads", m: "/my-lists", k: "/mangas" };

export default function TopBar({ scrolled }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const isMangaSearch =
    pathname === "/mangas" ||
    (pathname === "/search" && new URLSearchParams(search).get("media") === "manga");
  const showBack =
    pathname.startsWith("/anime/") ||
    pathname.startsWith("/genre/") ||
    pathname.startsWith("/search") ||
    pathname === "/recherche";
  // Elle chevaucherait l'en-tête des pages profil, Uptime et Équipe.
  const hideSearch =
    pathname === "/recherche" ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/u/") ||
    pathname === "/uptime" ||
    pathname === "/equipe";
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  // Portés par la barre du haut, donc inactifs dans le lecteur.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "f") {
        e.preventDefault();
        // Pages sans barre de recherche : on ouvre la page Recherche.
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        } else navigate("/recherche");
        return;
      }
      const route = SHORTCUT_ROUTES[key];
      if (!route) return;
      e.preventDefault();
      navigate(route);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const [showFilters, setShowFilters] = useState(false);
  const [selGenres, setSelGenres] = useState(() => new Set());
  const [selType, setSelType] = useState("");
  const [selEps, setSelEps] = useState(""); // clé de EPISODE_RANGES

  useEffect(() => {
    setTerm("");
    setResults([]);
    setOpen(false);
    setShowFilters(false);
    if (isMangaSearch) {
      setSelGenres(new Set());
      setSelType("");
      setSelEps("");
    }
  }, [isMangaSearch]);

  useEffect(() => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const r = await searchAnimes(term, 8, isMangaSearch ? "manga" : "anime");
        setResults(r);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 320);
    return () => clearTimeout(id);
  }, [term, isMangaSearch]);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
        setShowFilters(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (slug) => {
    setOpen(false);
    setTerm("");
    navigate(`/anime/${slug}${isMangaSearch ? "?tab=scans" : ""}`);
  };

  const toggleGenre = (g) => {
    setSelGenres((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  const resetFilters = () => {
    setSelGenres(new Set());
    setSelType("");
    setSelEps("");
  };

  // La route historique /search reste celle des mangas.
  const runSearch = () => {
    const params = new URLSearchParams();
    if (term.trim()) params.set("q", term.trim());
    if (isMangaSearch) params.set("media", "manga");
    if (!isMangaSearch && selGenres.size) params.set("genre", Array.from(selGenres).join(","));
    if (!isMangaSearch && selType) params.set("type", selType);
    if (!isMangaSearch && selEps) params.set("eps", selEps);
    setOpen(false);
    setShowFilters(false);
    const query = params.toString();
    navigate(`${isMangaSearch ? "/search" : "/recherche"}${query ? `?${query}` : ""}`);
    setTerm("");
  };

  const filtersCount = selGenres.size + (selType ? 1 : 0) + (selEps ? 1 : 0);

  return (
    <header
      className={`app-drag pointer-events-none sticky top-0 z-40 flex h-16 items-center px-4 transition-colors duration-300 md:px-8 ${
        scrolled ? "border-b border-border/70 bg-bg/85 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          title="Retour"
          className="app-no-drag pointer-events-auto flex items-center gap-2 rounded-md bg-black/40 px-3 py-2.5 text-sm font-medium ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/60"
        >
          <ArrowLeft size={18} /> <span className="hidden sm:inline">Retour</span>
        </button>
      )}
      {!hideSearch && (
      <div ref={boxRef} className="app-no-drag pointer-events-auto relative ml-auto w-full max-w-md">
        <div className="flex items-center gap-2 rounded-md bg-black/40 px-3.5 py-2.5 shadow-sm ring-1 ring-white/15 backdrop-blur-md transition focus-within:bg-black/55 focus-within:ring-primary/60">
          <Search size={17} className="text-muted" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
            placeholder={`Rechercher un ${isMangaSearch ? "manga" : "anime"}…${platform.isMobile ? "" : " (Ctrl+F)"}`}
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
          />
          {loading ? (
            <Loader2 size={15} className="animate-spin text-muted" />
          ) : (
            term && (
              <button onClick={() => setTerm("")} className="text-muted hover:text-text">
                <X size={15} />
              </button>
            )
          )}
          {/* Pastille = nombre de filtres actifs */}
          {!isMangaSearch && <button
            onClick={() => {
              setShowFilters((v) => !v);
              setOpen(false);
            }}
            title="Filtres"
            aria-label="Filtres de recherche"
            className={`relative shrink-0 border-l border-white/15 pl-2.5 transition-colors ${
              showFilters || filtersCount ? "text-primary" : "text-muted hover:text-text"
            }`}
          >
            <SlidersHorizontal size={16} />
            {filtersCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-fg">
                {filtersCount}
              </span>
            )}
          </button>}
        </div>

        {showFilters && (
          <div className="absolute mt-2 w-full overflow-hidden rounded-lg bg-surface/95 p-4 shadow-card ring-1 ring-white/10 backdrop-blur-xl animate-slide-up">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Type</p>
            <div className="mb-4 flex gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value || "all"}
                  onClick={() => setSelType(t.value)}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    selType === t.value
                      ? "bg-primary text-primary-fg"
                      : "bg-white/[0.06] text-text hover:bg-white/[0.1]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Nombre d'épisodes
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              {EPISODE_RANGES.map((r) => (
                <button
                  key={r.value || "any"}
                  onClick={() => setSelEps(r.value)}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    selEps === r.value
                      ? "bg-primary text-primary-fg"
                      : "bg-white/[0.06] text-text hover:bg-white/[0.1]"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Genres</p>
            <div className="max-h-44 overflow-y-auto">
              <div className="flex flex-wrap gap-1.5">
                {CATALOG_GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    className={`rounded px-2 py-1 text-xs transition-colors ${
                      selGenres.has(g)
                        ? "bg-primary text-primary-fg"
                        : "bg-white/[0.06] text-text hover:bg-white/[0.1]"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={resetFilters}
                disabled={!filtersCount}
                className="text-xs font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
              >
                Réinitialiser
              </button>
              <button
                onClick={runSearch}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition-transform hover:scale-[1.03]"
              >
                Rechercher
              </button>
            </div>
          </div>
        )}

        {/* Masqués quand le panneau de filtres est ouvert. */}
        {open && !showFilters && results.length > 0 && (
          <div className="absolute mt-2 w-full overflow-hidden rounded-lg bg-surface/95 shadow-card ring-1 ring-white/10 backdrop-blur-xl animate-slide-up">
            {results.map((a) => (
              <button
                key={a.slug}
                onClick={() => go(a.slug)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                {a.image ? (
                  <img src={a.image} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-12 w-9 shrink-0 rounded bg-surface-2" />
                )}
                <p className="min-w-0 truncate text-sm font-semibold">{a.title}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      )}
    </header>
  );
}
