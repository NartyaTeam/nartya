import { Play, ImageOff } from "lucide-react";

export function NextEpisodePreview({ episode, animeCover, onPlay }) {
  if (!episode) return null;
  const num = episode.episode ?? episode.number;
  const img = episode.image || episode.thumbnail || animeCover || null;
  const title = episode.title || (num != null ? `Épisode ${num}` : "Épisode suivant");

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[60] flex items-end justify-end p-3"
      style={{
        paddingBottom:
          "calc(var(--art-control-height, 46px) + var(--art-progress-height, 6px) + var(--art-bottom-gap, 5px) + 8px)",
      }}
    >
      {/* Pas de onMouseEnter/onMouseLeave : l'aperçu suit le survol du bouton. */}
      <button
        type="button"
        onClick={onPlay}
        className="pointer-events-auto flex w-[min(420px,94%)] flex-col overflow-hidden rounded-md border border-white/10 bg-[#0e0e0e]/95 text-left shadow-2xl backdrop-blur-md"
        style={{ animation: "epSelSlide 0.2s ease" }}
      >
        <div className="border-b border-white/10 px-5 py-3.5">
          <span className="text-lg font-bold text-white">Ép. suivant</span>
        </div>

        <div className="flex items-start gap-3.5 p-3.5">
          <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded bg-white/5">
            {img ? (
              <img src={img} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-white/30">
                <ImageOff size={20} />
              </div>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-white backdrop-blur-sm">
                <Play size={14} className="ml-0.5 fill-current" />
              </span>
            </span>
          </div>

          <div className="min-w-0 pt-0.5">
            <p className="flex items-baseline gap-2 font-bold text-white">
              {num != null && <span className="shrink-0">{num}</span>}
              <span className="truncate">{title}</span>
            </p>
            {episode.description && (
              <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-white/65">
                {episode.description}
              </p>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
