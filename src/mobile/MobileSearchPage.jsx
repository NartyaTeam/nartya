import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, History, Loader2, Search, X } from "lucide-react";
import { getAnimesByGenre, getGenreCards, searchAnimes } from "@/api/animeApi";
import { getOrFetch } from "@/hooks/useCachedResource";

const RECENTS_KEY = "nartya:mobile-recent-searches";

function readRecents() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function AnimeRow({ anime, onOpen }) {
  return (
    <button
      onClick={() => onOpen(anime)}
      className="flex w-full items-center gap-3 border-b border-white/[0.05] py-2.5 text-left active:bg-white/[0.04]"
    >
      {anime.image ? (
        <img src={anime.image} alt="" loading="lazy" className="h-16 w-12 shrink-0 rounded-sm object-cover" />
      ) : (
        <div className="h-16 w-12 shrink-0 rounded-sm bg-surface-2" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{anime.title}</span>
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </button>
  );
}

function PosterCard({ anime, onOpen }) {
  return (
    <button onClick={() => onOpen(anime)} className="min-w-0 text-left active:scale-[0.98]">
      {anime.image ? (
        <img src={anime.image} alt="" loading="lazy" className="aspect-[2/3] w-full rounded-sm object-cover ring-1 ring-white/10" />
      ) : (
        <div className="aspect-[2/3] w-full rounded-sm bg-surface-2" />
      )}
      <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug">{anime.title}</p>
    </button>
  );
}

export default function MobileSearchPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const genre = params.get("genre") || "";
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState(readRecents);
  const [genreCards, setGenreCards] = useState([]);
  const [genreAnimes, setGenreAnimes] = useState([]);
  const [genresLoading, setGenresLoading] = useState(true);
  const [genreLoading, setGenreLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    getOrFetch("home:genre-cards", getGenreCards, 30 * 60 * 1000)
      .then((items) => active && setGenreCards(items || []))
      .catch(() => active && setGenreCards([]))
      .finally(() => active && setGenresLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!genre) {
      setGenreAnimes([]);
      return;
    }
    let active = true;
    setGenreLoading(true);
    getOrFetch(`genre:${genre}:1`, () => getAnimesByGenre(genre, 1), 10 * 60 * 1000)
      .then((items) => active && setGenreAnimes(items || []))
      .catch(() => active && setGenreAnimes([]))
      .finally(() => active && setGenreLoading(false));
    return () => {
      active = false;
    };
  }, [genre]);

  useEffect(() => {
    const query = term.trim();
    if (!query) {
      setResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      getOrFetch(`mobile-search:${query.toLowerCase()}`, () => searchAnimes(query, 30), 5 * 60 * 1000)
        .then((items) => active && setResults(items || []))
        .catch(() => active && setResults([]))
        .finally(() => active && setSearching(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term]);

  const saveRecent = useCallback((value) => {
    const query = value.trim();
    if (!query) return;
    const next = [query, ...readRecents().filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 8);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    setRecents(next);
  }, []);

  const openAnime = (anime) => {
    saveRecent(term);
    navigate(`/anime/${anime.slug}`);
  };

  const clearRecents = () => {
    localStorage.removeItem(RECENTS_KEY);
    setRecents([]);
  };

  const showSearch = Boolean(term.trim());

  return (
    <div className="min-h-full pb-5">
      <div
        className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-bg px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        {genre && !showSearch ? (
          <button onClick={() => setParams({})} aria-label="Retour aux genres" className="p-2 text-text active:scale-90">
            <ArrowLeft size={21} />
          </button>
        ) : null}
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg bg-surface px-3.5 ring-1 ring-border focus-within:ring-primary/60">
          <Search size={17} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Rechercher un anime…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
          {searching ? <Loader2 size={16} className="animate-spin text-muted" /> : null}
          {!searching && term ? (
            <button onClick={() => setTerm("")} aria-label="Effacer la recherche" className="text-muted">
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-4 pt-4">
        {showSearch ? (
          !searching && results.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">Aucun résultat pour « {term.trim()} ».</p>
          ) : (
            results.map((anime) => <AnimeRow key={anime.slug} anime={anime} onOpen={openAnime} />)
          )
        ) : genre ? (
          <>
            <h1 className="mb-4 font-display text-2xl font-bold">{genre}</h1>
            {genreLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 9 }, (_, index) => <div key={index} className="aspect-[2/3] animate-pulse bg-surface-2" />)}
              </div>
            ) : genreAnimes.length ? (
              <div className="grid grid-cols-3 gap-3">
                {genreAnimes.map((anime) => <PosterCard key={anime.slug} anime={anime} onOpen={openAnime} />)}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted">Aucun anime dans ce genre.</p>
            )}
          </>
        ) : (
          <>
            {recents.length ? (
              <section className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <h1 className="font-display text-xs uppercase tracking-kana text-muted">Recherches récentes</h1>
                  <button onClick={clearRecents} className="text-xs text-muted">Effacer</button>
                </div>
                {recents.map((recent) => (
                  <button key={recent} onClick={() => setTerm(recent)} className="flex w-full items-center gap-3 py-2.5 text-left">
                    <History size={16} className="text-muted" />
                    <span className="truncate text-sm">{recent}</span>
                  </button>
                ))}
              </section>
            ) : null}
            <h1 className="mb-3 font-display text-xs uppercase tracking-kana text-muted">Parcourir par genre</h1>
            {genresLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[16/10] animate-pulse bg-surface-2" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {genreCards.map((card) => (
                  <button
                    key={card.genre}
                    onClick={() => setParams({ genre: card.genre })}
                    className="relative aspect-[16/10] overflow-hidden rounded-lg text-left ring-1 ring-white/10 active:scale-[0.98]"
                  >
                    {card.image ? <img src={card.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                    <span className="absolute inset-x-0 bottom-0 p-2.5 font-display text-base font-bold text-white">{card.genre}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
