import { useEffect, useRef, useState } from "react";
import { Search, Play, ListPlus, ChevronLeft, Loader2, Check, X, ImageOff } from "lucide-react";
import { Flag, getLanguageLabel } from "@/components/ui/Flag";
import { searchAnimes, getAnimePage, getSeasonEpisodes } from "@/api/animeApi";
import { getOrFetch } from "@/hooks/useCachedResource";
import { Select } from "@/components/ui/Select";
import { hasPlayableSources } from "@/utils/videoSourceUtils";
import { sortSeasonsForDisplay } from "@/utils/seasonSort";

function isPlayable(ep) {
  if (!ep?.lecteurs) return false;
  return Object.values(ep.lecteurs).some(hasPlayableSources);
}

function episodeLanguages(ep) {
  if (!ep?.lecteurs) return [];
  return Object.keys(ep.lecteurs).filter((l) => hasPlayableSources(ep.lecteurs[l]));
}

/**
 * Anime → saison → lire un épisode ou l'ajouter à la file. Reste monté entre les ouvertures,
 * son état est préservé.
 */
export default function PartySearchPanel({ onPlay, onEnqueue, onDequeue, queue = [], currentId = null, active = true }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);
  const [anime, setAnime] = useState(null); // { slug, title, cover, seasons }
  const [seasonId, setSeasonId] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [seasonName, setSeasonName] = useState("");
  const [loadingEps, setLoadingEps] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (active && !anime) inputRef.current?.focus();
  }, [active, anime]);

  // Debounce, avec cache de 5 min.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!term.trim()) {
      setResults([]);
      return undefined;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const q = term.trim().toLowerCase();
        const data = await getOrFetch(`search:${q}`, () => searchAnimes(term, 18), 5 * 60 * 1000);
        setResults(data);
      } catch (_) {
        setResults([]);
      }
      setSearching(false);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [term]);

  const openAnime = async (r) => {
    setOpening(true);
    try {
      const page = await getAnimePage(r.slug);
      const seasons = page?.seasons || [];
      setAnime({
        slug: r.slug,
        title: page?.anime?.title?.trim() || page?.anilist?.title || r.title,
        cover: page?.images?.poster || page?.anime?.image || r.image || "",
        seasons,
      });
      if (seasons[0]) await selectSeason(r.slug, seasons[0].id);
    } catch (_) {
      // reste sur la recherche
    }
    setOpening(false);
  };

  const selectSeason = async (slug, sid) => {
    setSeasonId(sid);
    setLoadingEps(true);
    try {
      const d = await getOrFetch(`episodes:${slug}:${sid}`, () => getSeasonEpisodes(slug, sid), 5 * 60 * 1000);
      setEpisodes((d?.episodes || []).filter(isPlayable));
      setSeasonName(d?.seasonName || "");
    } catch (_) {
      setEpisodes([]);
      setSeasonName("");
    }
    setLoadingEps(false);
  };

  const buildDescriptor = (ep) => {
    const num = ep.episode ?? ep.number;
    const langs = episodeLanguages(ep);
    const lang = langs.includes("vostfr") ? "vostfr" : langs[0] || "vostfr";
    return {
      id: `${anime.slug}:${seasonId}:${num}:${lang}`,
      slug: anime.slug,
      season: seasonId,
      ep: num,
      lang,
      title: anime.title,
      cover: anime.cover,
      epThumb: ep.thumbnail || ep.image || ep.thumb || null,
      seasonName: seasonName || "",
      epTitle: ep.title || `Épisode ${num}`,
    };
  };

  if (anime) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={() => setAnime(null)}
            aria-label="Retour aux résultats"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft size={18} />
          </button>
          {anime.cover && <img src={anime.cover} alt="" className="h-16 w-11 shrink-0 rounded-md object-cover shadow-md" />}
          <div className="min-w-0 flex-1 basis-48">
            <p className="truncate font-display text-lg font-bold text-white">{anime.title}</p>
            <p className="text-xs text-muted">
              {loadingEps
                ? "Chargement…"
                : `${episodes.length} épisode${episodes.length > 1 ? "s" : ""} disponible${episodes.length > 1 ? "s" : ""}`}
            </p>
          </div>
          {anime.seasons.length > 1 && (
            <Select
              value={String(seasonId ?? "")}
              onValueChange={(v) => selectSeason(anime.slug, v)}
              title="Saison"
              options={sortSeasonsForDisplay(anime.seasons).map((s) => ({ value: String(s.id), label: s.name, group: s.group }))}
              align="end"
              className="w-full sm:w-64"
            />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {loadingEps ? (
            <div className="flex justify-center py-16 text-white/50">
              <Loader2 className="animate-spin" size={26} />
            </div>
          ) : episodes.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">Aucun épisode jouable.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {episodes.map((ep) => {
                const num = ep.episode ?? ep.number;
                const desc = buildDescriptor(ep);
                const thumb = ep.image || ep.thumbnail || ep.thumb || anime.cover;
                const queued = queue.some((x) => x.id === desc.id);
                const playing = currentId === desc.id;
                return (
                  <li
                    key={`${seasonId}-${num}`}
                    className={`group flex items-center gap-3 rounded-md border-2 p-2 transition-colors ${
                      playing ? "border-primary/50 bg-primary/10" : "border-transparent hover:border-border hover:bg-bg/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onPlay?.(desc)}
                      className="flex min-w-0 flex-1 gap-3 text-left"
                    >
                      <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-surface-2 ring-2 ring-border sm:w-44">
                        {thumb ? (
                          <img src={thumb} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted">
                            <ImageOff size={20} />
                          </div>
                        )}
                        <span className="absolute left-0 top-0 z-10 bg-primary py-0.5 pl-2 pr-3.5 font-impact text-sm leading-tight tracking-wide text-primary-fg [clip-path:polygon(0_0,100%_0,calc(100%_-_8px)_100%,0_100%)]">
                          {num}
                        </span>
                        <span className="absolute bottom-1.5 right-1.5 rounded-[3px] shadow-sm">
                          <Flag lang={desc.lang} size={15} title={getLanguageLabel(desc.lang)} />
                        </span>
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-fg">
                            <Play size={16} className="ml-0.5 fill-current" />
                          </span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 py-0.5">
                        <h3 className="line-clamp-1 text-sm font-semibold text-text transition-colors group-hover:text-primary sm:text-base">
                          {ep.title || `Épisode ${num}`}
                        </h3>
                        {playing && (
                          <p className="mt-0.5 text-[0.68rem] font-bold uppercase tracking-wider text-primary">En cours</p>
                        )}
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted sm:text-sm">
                          {ep.description || "Aucune description disponible."}
                        </p>
                      </div>
                    </button>
                    {queued ? (
                      <button
                        type="button"
                        onClick={() => onDequeue?.(desc)}
                        title="Retirer de la file"
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        <Check size={15} /> <span className="hidden sm:inline">Dans la file</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onEnqueue?.(desc)}
                        title="Ajouter à la file"
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
                      >
                        <ListPlus size={16} /> <span className="hidden sm:inline">À la suite</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="border-b border-white/10 p-4">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Rechercher un anime…"
            className="w-full rounded-md border border-white/10 bg-bg/60 py-3 pl-11 pr-10 text-base text-white placeholder:text-white/40 focus:border-primary/60 focus:outline-none"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label="Effacer"
              className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-white/50 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {searching ? (
          <div className="flex justify-center py-16 text-white/50">
            <Loader2 className="animate-spin" size={26} />
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-white/40">
            <Search size={28} className="text-white/20" />
            <p className="text-sm">{term.trim() ? "Aucun résultat." : "Tape le nom d'un anime pour commencer."}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {results.map((r) => (
              <li key={r.slug}>
                <button type="button" onClick={() => openAnime(r)} className="group block w-full text-left">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-2 ring-0 ring-primary transition-all group-hover:ring-2">
                    {r.image ? (
                      <img src={r.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full skeleton" />
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug text-white/85 transition-colors group-hover:text-primary">
                    {r.title}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {opening && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Loader2 className="animate-spin text-primary" size={30} />
        </div>
      )}
    </div>
  );
}
