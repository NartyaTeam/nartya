import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { searchCatalog } from "@/api/animeApi";
import CatalogResults from "@/components/catalog/CatalogResults";
import { EPISODE_RANGES, episodeRangeFor } from "@/utils/episodeRanges";
import { CATALOG_GENRES } from "@/utils/genres";

const TYPE_OPTIONS = [
  { value: "", label: "Peu importe" },
  { value: "Anime", label: "Série" },
  { value: "Film", label: "Film" },
];

const LANG_OPTIONS = [
  { value: "", label: "Peu importe" },
  { value: "vf", label: "VF" },
  { value: "vostfr", label: "VOSTFR" },
];

const MEDIA_OPTIONS = [
  { value: "anime", label: "Anime" },
  { value: "manga", label: "Manga" },
];

function Choice({ active, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md border-2 px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-surface/60 text-muted hover:border-text/35 hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function genresFromParams(params) {
  return (params.get("genre") || "").split(",").filter(Boolean);
}

export default function SearchHubPage() {
  const [params, setParams] = useSearchParams();
  const inputRef = useRef(null);
  const committedSearch = params.get("q") || "";
  const committedMedia = params.get("media") === "manga" ? "manga" : "anime";
  const committedGenresString = params.get("genre") || "";
  const committedGenres = useMemo(
    () => committedGenresString.split(",").filter(Boolean),
    [committedGenresString]
  );
  const committedType = params.get("type") || "";
  const committedEps = params.get("eps") || "";
  const committedRange = episodeRangeFor(committedEps);
  const committedLang = params.get("lang") || "";

  const [searchInput, setSearchInput] = useState(committedSearch);
  const [media, setMedia] = useState(committedMedia);
  const [genres, setGenres] = useState(() => genresFromParams(params));
  const [type, setType] = useState(committedType);
  const [duration, setDuration] = useState(
    () => episodeRangeFor(committedEps) || EPISODE_RANGES[0]
  );
  const [lang, setLang] = useState(committedLang);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // La navbar peut naviguer vers cette page déjà montée : l'URL reste la source de vérité.
  useEffect(() => {
    setSearchInput(committedSearch);
    setMedia(committedMedia);
    setGenres(committedGenres);
    setType(committedType);
    setDuration(committedRange || EPISODE_RANGES[0]);
    setLang(committedLang);
  }, [committedSearch, committedMedia, committedGenres, committedType, committedRange, committedLang]);

  const isManga = committedMedia === "manga";

  const fetchPage = useCallback(
    (page) =>
      searchCatalog({
        search: committedSearch,
        media: committedMedia,
        genres: committedGenres,
        type: isManga ? "" : committedType,
        lang: isManga ? "" : committedLang,
        epMin: isManga || committedType === "Film" ? null : committedRange?.min ?? null,
        epMax: isManga || committedType === "Film" ? null : committedRange?.max ?? null,
        verifiedOnly: !isManga,
        page,
      }),
    [committedSearch, committedMedia, isManga, committedGenres, committedType, committedLang, committedRange]
  );

  const activeCriteria = useMemo(() => {
    const items = [...committedGenres];
    if (isManga) return items;
    if (committedType) items.unshift(committedType === "Anime" ? "Série" : committedType);
    if (committedRange && committedType !== "Film") {
      items.push(`${committedRange.label} épisodes`);
    }
    if (committedLang) items.push(committedLang === "vf" ? "VF" : "VOSTFR");
    return items;
  }, [isManga, committedGenres, committedType, committedRange, committedLang]);

  function toggleGenre(genre) {
    setGenres((current) =>
      current.includes(genre)
        ? current.filter((item) => item !== genre)
        : [...current, genre]
    );
  }

  function selectType(nextType) {
    setType(nextType);
    if (nextType === "Film") setDuration(EPISODE_RANGES[0]);
  }

  function selectMedia(nextMedia) {
    setMedia(nextMedia);
    // Format, durée et langue n'existent pas côté manga.
    if (nextMedia === "manga") {
      setType("");
      setDuration(EPISODE_RANGES[0]);
      setLang("");
    }
  }

  function applySearch(event) {
    event?.preventDefault();
    const next = new URLSearchParams();
    const query = searchInput.trim();
    if (query) next.set("q", query);
    if (genres.length) next.set("genre", genres.join(","));
    if (media === "manga") {
      next.set("media", "manga");
    } else {
      if (type) next.set("type", type);
      if (type !== "Film" && duration.value) next.set("eps", duration.value);
      if (lang) next.set("lang", lang);
    }
    setParams(next);
    setFiltersOpen(false);
  }

  function clearSearch() {
    setSearchInput("");
    const next = new URLSearchParams(params);
    next.delete("q");
    setParams(next);
    inputRef.current?.focus();
  }

  function resetFilters() {
    setGenres([]);
    setType("");
    setDuration(EPISODE_RANGES[0]);
    setLang("");
    const next = new URLSearchParams(params);
    next.delete("genre");
    next.delete("type");
    next.delete("eps");
    next.delete("lang");
    setParams(next);
  }

  const draftFiltersCount =
    genres.length + (type ? 1 : 0) + (duration.value ? 1 : 0) + (lang ? 1 : 0);
  const resultTitle = committedSearch
    ? `Résultats pour « ${committedSearch} »`
    : activeCriteria.length
      ? "Sélection filtrée"
      : isManga
        ? "Tous les mangas"
        : "Tous les animes";

  return (
    <div className="relative min-h-full overflow-hidden px-5 pb-16 pt-24 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: "radial-gradient(42% 58% at 52% 8%, rgb(var(--primary) / .11), transparent 72%)" }}
      />

      <div className="relative mx-auto max-w-[1500px]">
        <header className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Parcourir le catalogue</p>
          <h1 className="t-impact mt-3 text-5xl text-text sm:text-7xl">Recherche</h1>
          <div className="slash-rule mx-auto mt-4 w-40" />
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
            Recherche un titre ou affine directement le catalogue avec les critères qui t'intéressent.
          </p>
        </header>

        <div className="mx-auto mt-6 flex max-w-3xl items-center justify-center gap-2">
          {MEDIA_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => selectMedia(option.value)}
              aria-pressed={media === option.value}
              className={`rounded-md border-2 px-5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                media === option.value
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border text-muted hover:border-text/35 hover:text-text"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <form onSubmit={applySearch} className="mx-auto mt-4 max-w-3xl">
          <div className="flex items-center gap-2 rounded-md border-2 border-border bg-surface/90 p-2 pl-4 shadow-card transition-[border-color,box-shadow] focus-within:border-primary/70 focus-within:shadow-[0_18px_55px_-22px_rgb(var(--primary)/.4)] sm:gap-3">
            <Search size={19} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              autoFocus
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") clearSearch();
              }}
              placeholder={media === "manga" ? "Rechercher un manga par titre…" : "Rechercher un anime par titre…"}
              aria-label={media === "manga" ? "Rechercher un manga par titre" : "Rechercher un anime par titre"}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-text outline-none placeholder:text-muted/55"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="p-2 text-muted transition-colors hover:text-text"
                aria-label="Effacer la recherche"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className={`relative inline-flex items-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-bold transition-colors ${
                filtersOpen || draftFiltersCount
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted hover:border-text/35 hover:text-text"
              }`}
            >
              <SlidersHorizontal size={15} />
              <span className="hidden sm:inline">Filtres</span>
              {draftFiltersCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-fg">
                  {draftFiltersCount}
                </span>
              )}
              <ChevronDown size={13} className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-bold text-primary-fg shadow-[0_3px_0_color-mix(in_srgb,rgb(var(--primary))_58%,black)] transition hover:brightness-105 active:translate-y-[2px] active:shadow-none sm:px-5"
            >
              <Search size={15} className="sm:hidden" />
              <span className="hidden sm:inline">Rechercher</span>
            </button>
          </div>
        </form>

        {filtersOpen && (
          <section className="mx-auto mt-4 max-w-5xl rounded-md border-2 border-border bg-surface/80 p-5 shadow-card animate-fade-in-fast lg:p-6">
            <div className={`grid gap-6 ${media === "manga" ? "" : "lg:grid-cols-[0.8fr_1.2fr]"}`}>
              {media !== "manga" && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-2.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted/70">
                      Format
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {TYPE_OPTIONS.map((option) => (
                        <Choice
                          key={option.value || "any"}
                          active={type === option.value}
                          onClick={() => selectType(option.value)}
                        >
                          {option.label}
                        </Choice>
                      ))}
                    </div>
                  </div>

                  <div className={type === "Film" ? "opacity-40" : ""}>
                    <p className="mb-2.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted/70">
                      Nombre d'épisodes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {EPISODE_RANGES.map((range) => (
                        <Choice
                          key={range.value || "any"}
                          active={duration.value === range.value}
                          disabled={type === "Film"}
                          onClick={() => setDuration(range)}
                        >
                          {range.label}
                        </Choice>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted/70">
                      Langue
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {LANG_OPTIONS.map((option) => (
                        <Choice
                          key={option.value || "any"}
                          active={lang === option.value}
                          onClick={() => setLang(option.value)}
                        >
                          {option.label}
                        </Choice>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className={media === "manga" ? "" : "border-t border-white/[0.07] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"}>
                <p className="mb-2.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted/70">
                  Genres
                </p>
                <div className="max-h-52 overflow-y-auto pr-2">
                  <div className="flex flex-wrap gap-2">
                    {CATALOG_GENRES.map((genre) => (
                      <Choice
                        key={genre}
                        active={genres.includes(genre)}
                        onClick={() => toggleGenre(genre)}
                      >
                        {genre}
                      </Choice>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
              <button
                type="button"
                onClick={resetFilters}
                disabled={!draftFiltersCount}
                className="inline-flex items-center gap-2 px-2 py-2 text-xs text-muted transition-colors hover:text-text disabled:opacity-35"
              >
                <RotateCcw size={14} /> Réinitialiser les filtres
              </button>
              <button type="button" onClick={applySearch} className="btn-shu px-5 py-2.5 text-sm">
                <Search size={15} /> Appliquer les filtres
              </button>
            </div>
          </section>
        )}

        {!filtersOpen && activeCriteria.length > 0 && (
          <div className="mx-auto mt-4 flex max-w-5xl flex-wrap items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.025] px-4 py-3">
            <SlidersHorizontal size={14} className="mr-1 text-primary" />
            {activeCriteria.map((criterion) => (
              <span key={criterion} className="rounded-sm bg-white/[0.06] px-2.5 py-1 text-xs text-text/80">
                {criterion}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="ml-auto px-2 py-1 text-xs font-semibold text-muted transition-colors hover:text-text"
            >
              Modifier
            </button>
          </div>
        )}

        <section className="mt-10 border-t border-white/[0.07] pt-7">
          <p className="eyebrow text-center">Catalogue Nartya</p>
          <h2 className="t-impact mb-7 mt-2 block text-center text-3xl text-text">{resultTitle}</h2>
          <CatalogResults
            fetchPage={fetchPage}
            resetKey={`${committedMedia}|${committedSearch}|${committedGenresString}|${committedType}|${committedEps}|${committedLang}`}
            emptyLabel={isManga ? "Aucun manga ne correspond à ces critères." : "Aucun anime ne correspond à ces critères."}
            openScans={isManga}
            cardProps={{ highlightedGenres: committedGenres }}
          />
        </section>
      </div>
    </div>
  );
}
