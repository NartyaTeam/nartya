import { useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { GripVertical } from "lucide-react";
import AnimeCard from "@/components/home/AnimeCard";

// Avant de basculer l'infobulle à gauche.
const TOOLTIP_SPACE = 320;

const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24">
    <polygon points="5 3 19 12 5 21 5 3" style={{ fill: "currentColor" }} />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconFilm = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="7" x2="22" y2="7" />
    <line x1="17" y1="17" x2="22" y2="17" />
  </svg>
);

export default function FavoriteCard({ anime, summary, sortable = false }) {
  const wrapRef = useRef(null);
  const [side, setSide] = useState("right");
  const lastSeen = summary?.lastUpdatedAt
    ? formatDistanceToNow(new Date(summary.lastUpdatedAt), { addSuffix: true, locale: fr })
    : null;

  const onEnter = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setSide(window.innerWidth - rect.right < TOOLTIP_SPACE ? "left" : "right");
  };

  return (
    <div ref={wrapRef} onMouseEnter={onEnter} className="group/fav relative">
      <AnimeCard anime={anime} showFavorite={false} />

      {/* Le glisser-déposer fonctionne sur toute la carte. */}
      {sortable && (
        <span className="pointer-events-none absolute left-2 top-2 z-10 hidden h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white/70 opacity-0 backdrop-blur-md transition-opacity md:flex md:group-hover/fav:opacity-100">
          <GripVertical size={15} />
        </span>
      )}

      {summary && (
        <div className="mt-1.5 flex items-center gap-2 text-[0.68rem] text-muted md:hidden">
          <span className="shrink-0 font-medium text-text/80">Ép. {summary.lastEpisode}</span>
          {!summary.lastCompleted && summary.lastPercent > 0 ? (
            <>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, summary.lastPercent)}%` }}
                />
              </span>
              <span className="shrink-0 tabular-nums">{summary.lastPercent}%</span>
            </>
          ) : (
            <span className="text-primary/80">Vu</span>
          )}
        </div>
      )}

      {summary && (
        <div
          className={`pointer-events-none absolute top-1/2 z-30 hidden w-72 -translate-y-1/2 opacity-0 transition-[opacity,transform] duration-200 group-hover/fav:translate-x-0 group-hover/fav:opacity-100 md:block ${
            side === "left"
              ? "right-full mr-4 translate-x-[8px]"
              : "left-full ml-4 translate-x-[-8px]"
          }`}
        >
          {side === "left" ? (
            <span className="absolute left-full top-1/2 -translate-y-1/2 border-y-[8px] border-l-[10px] border-y-transparent border-l-surface-2" />
          ) : (
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-y-[8px] border-r-[10px] border-y-transparent border-r-surface-2" />
          )}

          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-surface-2 shadow-[0_16px_48px_rgba(0,0,0,0.75)] [transform:translateZ(0)]">
            {anime.cover && (
              <div className="relative h-32 overflow-hidden -mb-px pb-px">
                <img
                  src={anime.cover}
                  alt=""
                  className="block h-full w-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-2 via-surface-2/40 to-transparent" />
                <p className="absolute bottom-2.5 left-4 right-4 line-clamp-1 text-[0.95rem] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                  {anime.title}
                </p>
              </div>
            )}

            <div className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 ${summary.lastCompleted ? "text-primary" : "text-accent"}`}>
                  {summary.lastCompleted ? <IconCheck /> : <IconPlay />}
                </span>
                <div className="min-w-0 text-sm leading-snug">
                  <span className="text-muted">
                    {summary.lastCompleted ? "Terminé" : "En cours"}
                  </span>
                  <span className="mx-1.5 text-muted/40">·</span>
                  <span className="font-semibold text-text">Ép. {summary.lastEpisode}</span>
                  {!summary.lastCompleted && summary.lastPercent > 0 && (
                    <>
                      <span className="mx-1.5 text-muted/40">·</span>
                      <span className="text-muted">{summary.lastPercent}%</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="shrink-0 text-muted"><IconFilm /></span>
                <p className="text-sm text-muted">
                  <span className="font-semibold text-text">{summary.watchedCount}</span>{" "}
                  épisode{summary.watchedCount > 1 ? "s" : ""} vu{summary.watchedCount > 1 ? "s" : ""}
                </p>
              </div>

              {lastSeen && (
                <>
                  <div className="border-t border-white/[0.06]" />
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-muted/60"><IconClock /></span>
                    <p className="text-xs text-muted/70">{lastSeen}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
