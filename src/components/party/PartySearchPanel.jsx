import { useEffect, useRef, useState } from "react";
import { Search, Play, ListPlus, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { searchAnimes, getAnimePage, getSeasonEpisodes } from "@/api/animeApi";
import { getOrFetch } from "@/hooks/useCachedResource";
import { Select } from "@/components/ui/Select";
import { hasPlayableSources } from "@/utils/videoSourceUtils";

function isPlayable(ep) {
  if (!ep?.lecteurs) return false;
  return Object.values(ep.lecteurs).some(hasPlayableSources);
}

function episodeLanguages(ep) {
  if (!ep?.lecteurs) return [];
  return Object.keys(ep.lecteurs).filter((l) =>
    hasPlayableSources(ep.lecteurs[l])
  );
}

/**
 * Anime → saison → lire un épisode ou l'ajouter à la file. Reste monté entre les onglets,
 * son état est préservé.
 */
export default function PartySearchPanel({ onPlay, onEnqueue, onDequeue, queue = [] }) {
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

  // Debounce, avec cache de 5 min.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!term.trim()) {
      setResults([]);
      return;
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
      const next = {
        slug: r.slug,
        title: page?.anime?.title?.trim() || page?.anilist?.title || r.title,
        cover: page?.images?.poster || page?.anime?.image || r.image || "",
        seasons,
      };
      setAnime(next);
      if (seasons[0]) await selectSeason(r.slug, seasons[0].id);
    } catch (_) {
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

  // Vue épisodes
  if (anime) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 px-3 py-3">
          <button
            type="button"
            onClick={() => setAnime(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft size={18} />
          </button>
          {anime.cover && (
            <img src={anime.cover} alt="" className="h-14 w-10 shrink-0 object-cover shadow-md" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{anime.title}</p>
            {anime.seasons.length > 1 ? (
              <Select
                value={String(seasonId ?? "")}
                onValueChange={(v) => selectSeason(anime.slug, v)}
                options={anime.seasons.map((s) => ({ value: String(s.id), label: s.name }))}
                className="mt-1 w-full !h-8 !text-xs !pl-2.5 !pr-2"
              />
            ) : (
              !loadingEps && episodes.length > 0 && (
                <p className="mt-0.5 text-xs text-white/40">
                  {episodes.length} épisode{episodes.length > 1 ? "s" : ""}
                </p>
              )
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {loadingEps ? (
            <div className="flex justify-center py-12 text-white/50">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : episodes.length === 0 ? (
            <p className="py-12 text-center text-sm text-white/40">Aucun épisode jouable.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {episodes.map((ep) => {
                const num = ep.episode ?? ep.number;
                const queued = queue.some(
                  (x) => x.slug === anime.slug && String(x.season) === String(seasonId) && x.ep === num
                );
                return (
                  <li
                    key={`${seasonId}-${num}`}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="w-8 shrink-0 text-right text-sm font-bold text-white/30">{num}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-white/90">
                      {ep.title || `Épisode ${num}`}
                    </span>
                    {queued ? (
                      <button
                        type="button"
                        onClick={() => onDequeue?.(buildDescriptor(ep))}
                        title="Retirer de la file"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/20 text-primary transition-colors hover:bg-red-500/20 hover:text-red-400"
                      >
                        <X size={15} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onEnqueue?.(buildDescriptor(ep))}
                        title="Ajouter à la file"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                      >
                        <ListPlus size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onPlay?.(buildDescriptor(ep))}
                      title="Lire maintenant"
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-bold text-primary-fg transition-colors hover:bg-primary/90"
                    >
                      <Play size={13} className="fill-current" /> Lire
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Vue recherche
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="relative border-b border-white/10 p-3">
        <Search size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Chercher un anime à regarder ensemble…"
          className="w-full rounded-md border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-primary/60 focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {searching ? (
          <div className="flex justify-center py-12 text-white/50">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : results.length === 0 ? (
          <p className="py-12 text-center text-sm text-white/40">
            {term.trim() ? "Aucun résultat." : "Tapez pour chercher un anime."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/[0.04]">
            {results.map((r) => (
              <li key={r.slug}>
                <button
                  type="button"
                  onClick={() => openAnime(r)}
                  className="group flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-white/[0.05] rounded-lg"
                >
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-surface-2">
                    {r.image ? (
                      <img src={r.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full skeleton" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-white/90 line-clamp-2">
                    {r.title}
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-white/30 transition-colors group-hover:text-white/60" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {opening && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#121212]/70 backdrop-blur-sm">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      )}
    </div>
  );
}
