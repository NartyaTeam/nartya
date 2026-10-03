import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ImageOff, Play, X } from "lucide-react";
import { getSeasonEpisodes } from "@/api/animeApi";
import { getOrFetch } from "@/hooks/useCachedResource";
import { Flag, getLanguageLabel } from "@/components/ui/Flag";
import { hasPlayableSources } from "@/utils/videoSourceUtils";

function isPlayable(ep) {
  if (!ep?.lecteurs) return false;
  return Object.values(ep.lecteurs).some(hasPlayableSources);
}

export function EpisodeSelectorMobile({
  slug,
  animeTitle,
  seasons = [],
  currentSeasonId,
  currentEpisodeNumber,
  animeCover,
  progressMap = {},
  languages = [],
  language,
  countryOfOrigin = null,
  onLanguageChange,
  onSelect,
  onClose,
}) {
  const [viewSeasonId, setViewSeasonId] = useState(currentSeasonId);
  const [showSeasonList, setShowSeasonList] = useState(false);
  const [showLanguageList, setShowLanguageList] = useState(false);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentCardRef = useRef(null);

  const viewSeason = seasons.find((season) => String(season.id) === String(viewSeasonId));
  const isCurrentSeason = String(viewSeasonId) === String(currentSeasonId);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getOrFetch(
      `episodes:${slug}:${viewSeasonId}`,
      () => getSeasonEpisodes(slug, viewSeasonId),
      5 * 60 * 1000
    )
      .then((data) => {
        if (!active) return;
        setEpisodes(data?.episodes || []);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setEpisodes([]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, viewSeasonId]);

  const playableEpisodes = useMemo(() => episodes.filter(isPlayable), [episodes]);

  useEffect(() => {
    if (!loading && isCurrentSeason) {
      currentCardRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [loading, isCurrentSeason]);

  return (
    <div
      className="nartya-touch-ui pointer-events-auto absolute inset-0 z-[60] flex flex-col justify-center bg-gradient-to-b from-black/95 via-black/85 to-black/95"
      style={{ animation: "fade-in 0.2s ease both" }}
      onClick={onClose}
      role="dialog"
      aria-label={`Épisodes de ${animeTitle}`}
    >
      <div
        className="flex min-w-0 flex-col gap-3"
        style={{ paddingLeft: "max(env(safe-area-inset-left), 20px)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex min-w-0 items-center gap-2.5"
          style={{ paddingRight: "max(env(safe-area-inset-right), 12px)" }}
        >
          <button
            type="button"
            disabled={seasons.length <= 1}
            onClick={() => setShowSeasonList(true)}
            className={`flex min-h-11 items-center gap-2 border border-white/15 bg-white/10 px-4 py-2 text-left backdrop-blur-md transition-colors active:bg-white/20 ${
              seasons.length > 1 ? "hover:bg-white/15" : "cursor-default opacity-90"
            }`}
          >
            <span className="max-w-[34vw] truncate font-sans text-sm font-semibold text-white">
              {viewSeason?.name || "Saison"}
            </span>
            {seasons.length > 1 && <ChevronDown size={16} className="shrink-0 text-white/70" />}
          </button>

          {languages.length > 1 && (
            <button
              type="button"
              onClick={() => setShowLanguageList(true)}
              className="flex min-h-11 items-center gap-2 border border-white/15 bg-white/10 px-3.5 py-2 backdrop-blur-md transition-colors hover:bg-white/15 active:bg-white/20"
            >
              <Flag lang={language} countryOfOrigin={countryOfOrigin} size={14} />
              <span className="font-sans text-sm font-semibold text-white">
                {getLanguageLabel(language)}
              </span>
              <ChevronDown size={16} className="shrink-0 text-white/70" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les épisodes"
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center text-white/90 transition-transform active:scale-90"
          >
            <X size={27} strokeWidth={2.4} />
          </button>
        </div>

        {loading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-white/60">
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
            <span className="font-sans text-sm">Chargement des épisodes…</span>
          </div>
        ) : playableEpisodes.length === 0 ? (
          <p className="flex h-48 items-center justify-center text-center font-sans text-sm text-white/50">
            Aucun épisode disponible.
          </p>
        ) : (
          <div
            className="flex items-start gap-4 overflow-x-auto overflow-y-hidden overscroll-contain pb-2 pr-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ scrollSnapType: "x proximity" }}
          >
            {playableEpisodes.map((episode) => {
              const number = episode.episode || episode.number;
              const progress = progressMap[`${viewSeasonId}:${number}`];
              const percent = Math.max(0, Math.min(100, progress?.progressPercent || 0));
              const isCurrent = isCurrentSeason && Number(number) === Number(currentEpisodeNumber);
              const image = episode.image || episode.thumbnail || animeCover || null;

              return (
                <button
                  key={episode.id || `${viewSeasonId}-${number}`}
                  ref={isCurrent ? currentCardRef : null}
                  type="button"
                  onClick={() => onSelect?.(viewSeasonId, number)}
                  className="group flex w-[min(38vw,15rem)] min-w-[12rem] shrink-0 flex-col text-left active:scale-[0.98]"
                  style={{ scrollSnapAlign: "center" }}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <div
                    className={`relative aspect-video w-full overflow-hidden bg-surface-2 ring-offset-2 ring-offset-black ${
                      isCurrent ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    {image ? (
                      <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/40">
                        <ImageOff size={22} />
                      </div>
                    )}
                    <span
                      className={`absolute inset-0 flex items-center justify-center transition-colors ${
                        isCurrent ? "bg-black/25" : "bg-black/40 group-hover:bg-black/20"
                      }`}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/85 bg-black/30 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
                        <Play size={19} className="ml-0.5 fill-current" />
                      </span>
                    </span>
                    {progress && (
                      <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                        <span
                          className={`block h-full ${progress.completed ? "bg-accent" : "bg-primary"}`}
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                    )}
                  </div>

                  <p className={`mt-2 line-clamp-1 font-sans text-sm font-semibold ${isCurrent ? "text-primary" : "text-white"}`}>
                    <span className="text-white/50">{number}.</span>{" "}
                    {episode.title || `Épisode ${number}`}
                  </p>
                  <p className="mt-1 line-clamp-2 font-sans text-xs leading-relaxed text-white/55">
                    {episode.description || "Aucune description disponible."}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showSeasonList && (
        <ChoiceOverlay title="Saisons" onClose={() => setShowSeasonList(false)}>
          {seasons.map((season) => {
            const active = String(season.id) === String(viewSeasonId);
            return (
              <button
                key={season.id}
                type="button"
                onClick={() => {
                  setViewSeasonId(season.id);
                  setShowSeasonList(false);
                }}
                className={`min-h-11 px-4 py-2 font-display text-2xl font-bold transition-colors ${
                  active ? "text-primary" : "text-white/80 hover:text-white"
                }`}
              >
                {season.name}
              </button>
            );
          })}
        </ChoiceOverlay>
      )}

      {showLanguageList && (
        <ChoiceOverlay title="Langue" onClose={() => setShowLanguageList(false)}>
          {languages.map((item) => {
            const active = item === language;
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  if (!active) onLanguageChange?.(item);
                  setShowLanguageList(false);
                  onClose?.();
                }}
                className={`flex min-h-11 items-center gap-3 px-4 py-2 font-display text-2xl font-bold transition-colors ${
                  active ? "text-primary" : "text-white/80 hover:text-white"
                }`}
              >
                <Flag lang={item} countryOfOrigin={countryOfOrigin} size={20} />
                {getLanguageLabel(item)}
              </button>
            );
          })}
        </ChoiceOverlay>
      )}
    </div>
  );
}

function ChoiceOverlay({ title, onClose, children }) {
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 backdrop-blur-2xl"
      style={{ animation: "fade-in 0.18s ease both" }}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={`Fermer ${title.toLowerCase()}`}
        className="absolute flex h-11 w-11 items-center justify-center text-white/80 active:scale-90"
        style={{ right: "max(env(safe-area-inset-right), 12px)", top: "max(env(safe-area-inset-top), 8px)" }}
      >
        <X size={27} strokeWidth={2.4} />
      </button>
      <p className="mb-4 font-display text-xs uppercase tracking-kana text-white/40">{title}</p>
      <div
        className="flex max-h-[70%] flex-col items-center gap-1 overflow-y-auto overscroll-contain px-6"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
