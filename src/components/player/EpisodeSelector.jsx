import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Play, ImageOff } from "lucide-react";
import { getSeasonEpisodes } from "@/api/animeApi";
import { getOrFetch } from "@/hooks/useCachedResource";
import { hasPlayableSources } from "@/utils/videoSourceUtils";

function isPlayable(ep) {
  if (!ep?.lecteurs) return false;
  return Object.values(ep.lecteurs).some(hasPlayableSources);
}

/**
 * Rendu dans l'élément ArtPlayer pour rester visible en plein écran. Les épisodes d'une autre
 * saison sont chargés à la demande.
 */
export function EpisodeSelector({
  slug,
  animeTitle,
  seasons = [],
  currentSeasonId,
  currentEpisodeNumber,
  animeCover,
  progressMap = {},
  onSelect,
  onHoverEnter,
  onHoverLeave,
}) {
  const [viewSeasonId, setViewSeasonId] = useState(currentSeasonId);
  const [showSeasonList, setShowSeasonList] = useState(false);
  const [expanded, setExpanded] = useState(currentEpisodeNumber);
  // Stockés avec leur saison : l'état de chargement est juste dès le rendu du clic, sans
  // réafficher la saison précédente.
  const [loaded, setLoaded] = useState({ seasonId: null, episodes: [] });
  const loading = String(loaded.seasonId) !== String(viewSeasonId);

  const viewSeason = seasons.find((s) => String(s.id) === String(viewSeasonId));
  const isCurrentSeason = String(viewSeasonId) === String(currentSeasonId);

  useEffect(() => {
    let alive = true;
    const seasonId = viewSeasonId;
    getOrFetch(
      `episodes:${slug}:${seasonId}`,
      () => getSeasonEpisodes(slug, seasonId),
      5 * 60 * 1000
    )
      .then((d) => {
        if (alive) setLoaded({ seasonId, episodes: d?.episodes || [] });
      })
      .catch(() => {
        if (alive) setLoaded({ seasonId, episodes: [] });
      });
    return () => {
      alive = false;
    };
  }, [slug, viewSeasonId]);

  const list = useMemo(() => loaded.episodes.filter(isPlayable), [loaded]);

  const selectEpisode = (num) => {
    onSelect?.(viewSeasonId, num);
  };

  return (
    // Transparent aux clics. La marge basse suit la barre ArtPlayer, plus haute en plein écran.
    <div
      className="pointer-events-none absolute inset-0 z-[60] flex items-end justify-end p-3"
      style={{
        paddingBottom:
          "calc(var(--art-control-height, 46px) + var(--art-progress-height, 6px) + var(--art-bottom-gap, 5px) + 8px)",
      }}
    >
      <div
        className="pointer-events-auto flex h-[min(620px,100%)] w-[min(720px,96%)] flex-col overflow-hidden rounded-md border border-white/10 bg-[#0e0e0e]/95 shadow-2xl backdrop-blur-md"
        style={{ animation: "epSelSlide 0.2s ease" }}
        onMouseEnter={onHoverEnter}
        onMouseLeave={onHoverLeave}
      >
        {showSeasonList ? (
          <div className="flex items-center border-b border-white/10 px-6 py-4">
            <span className="truncate text-xl font-bold text-white">
              {animeTitle || "Saisons"}
            </span>
          </div>
        ) : (
          <button
            type="button"
            disabled={seasons.length <= 1}
            onClick={() => {
              setShowSeasonList(true);
              setExpanded(null);
            }}
            className={`flex items-center gap-2.5 border-b border-white/10 px-6 py-4 text-left ${
              seasons.length > 1 ? "transition-colors hover:bg-white/5" : "cursor-default"
            }`}
          >
            {seasons.length > 1 && <ChevronLeft size={20} className="shrink-0 text-white/60" />}
            <span className="truncate text-xl font-bold text-white">
              {viewSeason?.name || "Épisodes"}
            </span>
          </button>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {showSeasonList ? (
            seasons.map((season) => {
              const active = String(season.id) === String(viewSeasonId);
              const current = String(season.id) === String(currentSeasonId);
              return (
                <button
                  key={season.id}
                  type="button"
                  onClick={() => {
                    setViewSeasonId(season.id);
                    setShowSeasonList(false);
                    setExpanded(null);
                  }}
                  className={`relative flex w-full items-center border-b border-white/5 px-6 py-5 text-left text-lg font-semibold text-white transition-colors hover:bg-white/10 ${
                    active ? "bg-white/5" : ""
                  }`}
                >
                  {current && <span className="absolute inset-y-0 left-0 w-1 bg-primary" />}
                  {season.name}
                </button>
              );
            })
          ) : loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
              <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
              <span className="text-sm">Chargement des épisodes…</span>
            </div>
          ) : list.length === 0 ? (
            <p className="px-5 py-16 text-center text-sm text-white/50">
              Aucun épisode disponible.
            </p>
          ) : (
            list.map((ep) => {
              const num = ep.episode || ep.number;
              const prog = progressMap[`${viewSeasonId}:${num}`];
              const pct = Math.max(0, Math.min(100, prog?.progressPercent || 0));
              const isCurrent = isCurrentSeason && Number(num) === Number(currentEpisodeNumber);
              const isExpanded = Number(expanded) === Number(num);
              const img = ep.image || ep.thumbnail || animeCover || null;

              return (
                <div
                  key={ep.id || `${viewSeasonId}-${num}`}
                  className={`relative ${isExpanded ? "bg-white/[0.07] ring-1 ring-inset ring-white/70" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => (isExpanded ? selectEpisode(num) : setExpanded(num))}
                    className={`flex w-full items-center gap-6 px-7 py-6 text-left transition-colors ${
                      isExpanded ? "pb-4" : "hover:bg-white/5"
                    }`}
                  >
                    {/* `min-w` et `tabular-nums` : un numéro à deux chiffres débordait d'une largeur fixe. */}
                    <span className="min-w-[1.25em] shrink-0 text-center text-xl font-bold tabular-nums text-white/80">
                      {num}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-lg font-semibold text-white">
                      {ep.title || `Épisode ${num}`}
                    </span>
                    {isCurrent && !isExpanded && (
                      <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-primary">
                        En cours
                      </span>
                    )}
                    <span className="h-[3px] w-28 shrink-0 overflow-hidden bg-white/25">
                      <span
                        className={`block h-full ${prog?.completed ? "bg-accent" : "bg-primary"}`}
                        style={{ width: `${prog ? pct : 0}%` }}
                      />
                    </span>
                  </button>

                  <div
                    className="grid transition-[grid-template-rows] duration-300 ease-out"
                    style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => selectEpisode(num)}
                        className="flex w-full gap-6 px-7 pb-7 pt-0 text-left"
                      >
                        {/* Décalée à la verticale du titre. */}
                        <div className="group relative ml-[calc(1.25em+1.5rem)] aspect-video w-52 shrink-0 overflow-hidden rounded-[2px] bg-surface-2">
                          {img ? (
                            <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-white/40">
                              <ImageOff size={20} />
                            </div>
                          )}
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/15">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/80 bg-white/25 text-white transition-transform group-hover:scale-110">
                              <Play size={22} className="ml-0.5 fill-current" />
                            </span>
                          </span>
                          {isCurrent && (
                            <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-white">
                              Lecture en cours
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-5 flex-1 text-[0.95rem] leading-relaxed text-white/80">
                          {ep.description || "Aucune description disponible."}
                        </p>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
