import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Play, RotateCcw, Search, X } from "lucide-react";
import { searchCatalog } from "@/api/animeApi";
import { getAnimeIdsByTag } from "@/api/anilist";
import { TROPE_GROUPS, TROPE_LABEL } from "@/utils/anilistTags";
import CatalogResults from "@/components/catalog/CatalogResults";
import FilterPopover from "@/components/ui/FilterPopover";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { EPISODE_RANGES, episodeRangeFor } from "@/utils/episodeRanges";
import { MAIN_GENRES, SECONDARY_GENRES } from "@/utils/genres";

const TYPE_OPTIONS = [
  { value: "", label: "Peu importe" },
  { value: "Anime", label: "Série" },
  { value: "Film", label: "Film" },
  { value: "OVA", label: "OAV" },
  { value: "ONA", label: "ONA" },
  { value: "SPECIAL", label: "Spécial" },
  { value: "TV_SHORT", label: "Format court" },
  { value: "Autres", label: "Autres séries" },
];
// Formats AniList : envoyés en `format`, les autres valeurs restent le `type` d'anime-sama.
const ANILIST_FORMATS = new Set(["OVA", "ONA", "SPECIAL", "TV_SHORT"]);

const ORIGIN_OPTIONS = [
  { value: "", label: "Peu importe" },
  { value: "manga", label: "Manga" },
  { value: "webtoon", label: "Manhwa / Manhua" },
];

const LANG_OPTIONS = [
  { value: "", label: "Peu importe" },
  { value: "vf", label: "VF" },
  { value: "vostfr", label: "VOSTFR" },
];

// Note AniList minimale, sur 10.
const SCORE_OPTIONS = [
  { value: "", label: "Peu importe" },
  { value: "6", label: "6+" },
  { value: "7", label: "7+" },
  { value: "8", label: "8+" },
];

const MEDIA_OPTIONS = [
  { value: "anime", label: "Anime", Icon: Play },
  { value: "manga", label: "Manga", Icon: BookOpen },
];

// Radix refuse la valeur vide : « aucun filtre » s'écrit ANY dans les menus.
const ANY = "any";
const forSelect = (options) => options.map((o) => ({ ...o, value: o.value || ANY }));
const fromSelect = (value) => (value === ANY ? "" : value);
const TYPE_SELECT = forSelect(TYPE_OPTIONS);
const ORIGIN_SELECT = forSelect(ORIGIN_OPTIONS);
const LANG_SELECT = forSelect(LANG_OPTIONS);
const SCORE_SELECT = forSelect(SCORE_OPTIONS);
const EPISODES_SELECT = forSelect(EPISODE_RANGES);

function Choice({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-md border-2 px-3 py-1.5 text-xs font-bold leading-4 transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-surface/60 text-muted hover:border-text/35 hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function PanelTitle({ children }) {
  return <p className="mb-2.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted/70">{children}</p>;
}

function CriterionChip({ label, onRemove, what }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Retirer ${what} ${label}`}
      className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
    >
      {label}
      <X size={12} />
    </button>
  );
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
  const committedScore = SCORE_OPTIONS.some((o) => o.value === params.get("score"))
    ? params.get("score")
    : "";
  const committedOrigin = ORIGIN_OPTIONS.some((o) => o.value === params.get("origin"))
    ? params.get("origin")
    : "";
  const committedTag = TROPE_LABEL[params.get("tag")] ? params.get("tag") : "";

  const [searchInput, setSearchInput] = useState(committedSearch);
  // Thème précis : AniList donne les œuvres par paquets de 150, dont on garde celles du catalogue.
  // Un paquet sans aucune œuvre du catalogue est sauté, d'où ce curseur à part de la pagination.
  const tagCursorRef = useRef({ key: "", next: 1, hasMore: true });

  // La navbar peut naviguer vers cette page déjà montée : l'URL reste la source de vérité.
  useEffect(() => {
    setSearchInput(committedSearch);
  }, [committedSearch]);

  const isManga = committedMedia === "manga";
  const committedIsFormat = ANILIST_FORMATS.has(committedType);

  const resetKey = `${committedMedia}|${committedSearch}|${committedGenresString}|${committedType}|${committedEps}|${committedLang}|${committedScore}|${committedOrigin}|${committedTag}`;

  const fetchPage = useCallback(
    async (page) => {
      const filters = {
        search: committedSearch,
        media: committedMedia,
        genres: committedGenres,
        type: isManga || committedIsFormat ? "" : committedType,
        format: !isManga && committedIsFormat ? committedType : "",
        origin: isManga ? committedOrigin : "",
        lang: isManga ? "" : committedLang,
        epMin: isManga || committedType === "Film" ? null : committedRange?.min ?? null,
        epMax: isManga || committedType === "Film" ? null : committedRange?.max ?? null,
        scoreMin: isManga ? null : committedScore || null,
        verifiedOnly: !isManga,
        page,
      };
      if (isManga || !committedTag) return searchCatalog(filters);

      if (page === 1 || tagCursorRef.current.key !== resetKey) {
        tagCursorRef.current = { key: resetKey, next: 1, hasMore: true };
      }
      const cursor = tagCursorRef.current;
      for (let tries = 0; tries < 4 && cursor.hasMore; tries++) {
        const { ids, hasMore } = await getAnimeIdsByTag(committedTag, cursor.next);
        cursor.next += 1;
        cursor.hasMore = hasMore && ids.length > 0;
        if (!ids.length) break;
        const items = await searchCatalog({ ...filters, anilistIds: ids, page: 1 });
        if (!items?.length) continue;
        // Ordre de popularité d'AniList, pas l'ordre alphabétique du catalogue.
        const rank = new Map(ids.map((id, i) => [id, i]));
        return [...items].sort((a, b) => (rank.get(a.anilistId) ?? 1e9) - (rank.get(b.anilistId) ?? 1e9));
      }
      return [];
    },
    [committedSearch, committedMedia, isManga, committedGenres, committedType, committedIsFormat, committedOrigin, committedTag, committedLang, committedRange, committedScore, resetKey]
  );

  /** Un filtre s'applique dès qu'il change : l'URL est mise à jour, vide = critère retiré. */
  function updateParams(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      const text = Array.isArray(value) ? value.join(",") : value;
      if (text) next.set(key, text);
      else next.delete(key);
    }
    setParams(next);
  }

  function selectMedia(nextMedia) {
    if (nextMedia === committedMedia) return;
    // Format, durée, langue, note et thème précis n'existent pas côté manga ; l'origine, côté anime.
    updateParams(
      nextMedia === "manga"
        ? { media: "manga", type: "", eps: "", lang: "", score: "", tag: "" }
        : { media: "", origin: "" }
    );
  }

  function toggleGenre(genre) {
    updateParams({
      genre: committedGenres.includes(genre)
        ? committedGenres.filter((item) => item !== genre)
        : [...committedGenres, genre],
    });
  }

  function applySearch(event) {
    event.preventDefault();
    updateParams({ q: searchInput.trim() });
  }

  function clearSearch() {
    setSearchInput("");
    updateParams({ q: "" });
    inputRef.current?.focus();
  }

  function resetFilters() {
    updateParams({ genre: "", type: "", eps: "", lang: "", score: "", origin: "", tag: "" });
  }

  const hasCriteria =
    committedGenres.length > 0 ||
    Boolean(committedType || committedRange || committedLang || committedScore || committedOrigin || committedTag);
  const resultTitle = committedSearch
    ? `Résultats pour « ${committedSearch} »`
    : hasCriteria
      ? "Sélection filtrée"
      : isManga
        ? "Tous les mangas"
        : "Tous les animes";

  return (
    <div className="relative min-h-full overflow-hidden px-5 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: "radial-gradient(42% 58% at 52% 8%, rgb(var(--primary) / .11), transparent 72%)" }}
      />

      <div className="relative mx-auto max-w-[1500px]">
        <header className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Parcourir le catalogue</p>
          <h1 className="t-impact mt-3 text-5xl text-text sm:text-7xl">Recherche</h1>
          <div className="mx-auto mt-4 h-[3px] w-40 bg-primary" />
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
            Recherche un titre ou affine directement le catalogue avec les critères qui t'intéressent.
          </p>
        </header>

        <div className="mx-auto mt-6 flex max-w-4xl justify-center">
          <SegmentedControl
            label="Catalogue"
            options={MEDIA_OPTIONS}
            value={committedMedia}
            onChange={selectMedia}
          />
        </div>

        <form onSubmit={applySearch} className="mx-auto mt-4 max-w-4xl">
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
              placeholder={isManga ? "Rechercher un manga par titre…" : "Rechercher un anime par titre…"}
              aria-label={isManga ? "Rechercher un manga par titre" : "Rechercher un anime par titre"}
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
              type="submit"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-bold text-primary-fg shadow-[0_3px_0_color-mix(in_srgb,rgb(var(--primary))_58%,black)] transition hover:brightness-105 active:translate-y-[2px] active:shadow-none sm:px-5"
            >
              <Search size={15} className="sm:hidden" />
              <span className="hidden sm:inline">Rechercher</span>
            </button>
          </div>
        </form>

        <div
          role="group"
          aria-label="Filtres"
          className="mx-auto mt-3 flex max-w-4xl flex-wrap items-center justify-center gap-2"
        >
          {isManga ? (
            <Select
              title="Origine"
              prefix="Origine"
              emptyValue={ANY}
              options={ORIGIN_SELECT}
              value={committedOrigin || ANY}
              onValueChange={(value) => updateParams({ origin: fromSelect(value) })}
            />
          ) : (
            <>
              <Select
                title="Format"
                prefix="Format"
                emptyValue={ANY}
                options={TYPE_SELECT}
                value={committedType || ANY}
                onValueChange={(value) =>
                  updateParams(value === "Film" ? { type: value, eps: "" } : { type: fromSelect(value) })
                }
              />
              <Select
                title="Nombre d'épisodes"
                prefix="Épisodes"
                emptyValue={ANY}
                disabled={committedType === "Film"}
                options={EPISODES_SELECT}
                value={committedRange?.value || ANY}
                onValueChange={(value) => updateParams({ eps: fromSelect(value) })}
              />
              <Select
                title="Langue"
                prefix="Langue"
                emptyValue={ANY}
                options={LANG_SELECT}
                value={committedLang || ANY}
                onValueChange={(value) => updateParams({ lang: fromSelect(value) })}
              />
              <Select
                title="Note AniList minimale"
                prefix="Note"
                emptyValue={ANY}
                options={SCORE_SELECT}
                value={committedScore || ANY}
                onValueChange={(value) => updateParams({ score: fromSelect(value) })}
              />
            </>
          )}

          <FilterPopover label="Genres" count={committedGenres.length} panelClassName="w-[min(92vw,36rem)]">
            <PanelTitle>Genres</PanelTitle>
            <div className="flex flex-wrap gap-2">
              {MAIN_GENRES.map((genre) => (
                <Choice key={genre} active={committedGenres.includes(genre)} onClick={() => toggleGenre(genre)}>
                  {genre}
                </Choice>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <PanelTitle>Thèmes</PanelTitle>
              {committedGenres.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateParams({ genre: "" })}
                  className="mb-2.5 text-xs font-semibold text-muted transition-colors hover:text-text"
                >
                  Tout désélectionner
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {SECONDARY_GENRES.map((genre) => (
                <Choice key={genre} active={committedGenres.includes(genre)} onClick={() => toggleGenre(genre)}>
                  {genre}
                </Choice>
              ))}
            </div>
          </FilterPopover>

          {!isManga && (
            <FilterPopover
              label="Thèmes précis"
              count={committedTag ? 1 : 0}
              align="end"
              panelClassName="w-[min(92vw,46rem)]"
            >
              <p className="mb-3 text-xs text-muted">Un thème à la fois, d'après les tags d'AniList.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {TROPE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="mb-2 text-xs font-semibold text-text/70">{group.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.tags.map(([value, label]) => (
                        <Choice
                          key={value}
                          active={committedTag === value}
                          onClick={() => updateParams({ tag: committedTag === value ? "" : value })}
                        >
                          {label}
                        </Choice>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </FilterPopover>
          )}

          {hasCriteria && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-muted transition-colors hover:text-text md:h-10"
            >
              <RotateCcw size={14} /> Réinitialiser
            </button>
          )}
        </div>

        {(committedGenres.length > 0 || committedTag) && (
          <div className="mx-auto mt-3 flex max-w-4xl flex-wrap items-center justify-center gap-2">
            {committedGenres.map((genre) => (
              <CriterionChip key={genre} label={genre} what="le genre" onRemove={() => toggleGenre(genre)} />
            ))}
            {committedTag && (
              <CriterionChip
                label={TROPE_LABEL[committedTag]}
                what="le thème"
                onRemove={() => updateParams({ tag: "" })}
              />
            )}
          </div>
        )}

        <section className="mt-10 border-t border-white/[0.07] pt-7">
          <p className="eyebrow text-center">Catalogue Nartya</p>
          <h2 className={`t-impact mt-2 block text-center text-3xl text-text ${committedSearch ? "mb-3" : "mb-7"}`}>{resultTitle}</h2>
          {committedSearch && (
            <p className="mb-7 text-center text-xs text-muted">
              <button
                type="button"
                onClick={() => setParams(new URLSearchParams({ q: committedSearch, ...(isManga ? {} : { media: "manga" }) }))}
                className="font-semibold text-primary hover:underline"
              >
                Chercher « {committedSearch} » dans les {isManga ? "animes" : "scans"}
              </button>
            </p>
          )}
          <CatalogResults
            fetchPage={fetchPage}
            resetKey={resetKey}
            emptyLabel={isManga ? "Aucun manga ne correspond à ces critères." : "Aucun anime ne correspond à ces critères."}
            openScans={isManga}
            cardProps={{ highlightedGenres: committedGenres }}
          />
        </section>
      </div>
    </div>
  );
}
