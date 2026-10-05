import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Play,
  Clock3,
  Star,
  ImageOff,
  Download,
  Check,
  CheckCircle2,
  Circle,
  Loader2,
  X,
  AlertTriangle,
  MoreVertical,
  Trash2,
  CheckSquare,
  Square,
  EyeOff,
} from "lucide-react";
import { formatFrenchDate } from "@/api/anizip";
import { Flag, getLanguageLabel } from "@/components/ui/Flag";
import { platform } from "@/platform";

const LONG_PRESS_DELAY_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;
const HOVER_PREWARM_DELAY_MS = 250;

function isPastAirDate(dateValue) {
  if (!dateValue) return false;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return false;
  // Une date sans heure reste « prévue aujourd'hui » jusqu'à la fin de la journée locale.
  parsed.setHours(23, 59, 59, 999);
  return Date.now() > parsed.getTime();
}

/** Réutilisé pour les chapitres de scan. */
export function DownloadControl({ download, resolving, onDownload, onCancel, onRemove }) {
  const status = download?.status;

  if (resolving || status === "queued" || status === "downloading") {
    const pct = Math.round(download?.percent || 0);
    const label = resolving ? "…" : download?.processing ? "⋯" : `${pct}%`;
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCancel?.();
        }}
        title={download?.processing ? "Finalisation…" : "Annuler le téléchargement"}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-primary"
      >
        <Loader2 size={15} className="animate-spin" />
        <span className="tabular-nums">{label}</span>
        <X size={13} />
      </button>
    );
  }

  if (status === "done") {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove?.();
        }}
        title="Téléchargé — cliquer pour supprimer"
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-accent transition-colors hover:bg-white/[0.06] hover:text-primary"
      >
        <Check size={15} />
        <span className="hidden sm:inline">Hors ligne</span>
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onDownload?.();
      }}
      title={status === "error" ? download?.error || "Réessayer" : "Télécharger pour le hors ligne"}
      className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
    >
      {status === "error" ? (
        <AlertTriangle size={15} className="text-primary" />
      ) : (
        <Download size={15} />
      )}
    </button>
  );
}

function EpisodeActionsSheet({
  open,
  episode,
  watched,
  onToggleWatched,
  canDownload,
  download,
  resolving,
  onDownload,
  onCancel,
  onRemove,
  onClose,
}) {
  if (!open || typeof document === "undefined") return null;

  const num = episode.episode || episode.number;
  const status = download?.status;
  const downloading = resolving || status === "queued" || status === "downloading";
  const percent = Math.round(download?.percent || 0);

  const runAndClose = (action) => {
    onClose();
    action?.();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/60 md:hidden"
      style={{ animation: "fade-in 0.18s ease both" }}
      onClick={onClose}
    >
      <div
        className="animate-sheet-up rounded-t-2xl border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pt-2.5">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" />
          <div className="border-b border-border/70 px-5 pb-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-kana text-muted">
              Épisode {num}
            </p>
            <p className="mt-1 line-clamp-1 text-base font-semibold text-text">
              {episode.title || `Épisode ${num}`}
            </p>
          </div>
        </div>

        <div className="px-2 py-2">
          {onToggleWatched && (
            <button
              type="button"
              onClick={() => runAndClose(() => onToggleWatched(false))}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-[0.95rem] text-text transition-colors active:bg-white/[0.06]"
            >
              {watched ? <Circle size={20} /> : <CheckCircle2 size={20} />}
              <span>{watched ? "Marquer comme non vu" : "Marquer comme vu"}</span>
            </button>
          )}

          {canDownload && (
            <button
              type="button"
              onClick={() =>
                runAndClose(
                  downloading
                    ? onCancel
                    : status === "done"
                      ? onRemove
                      : onDownload
                )
              }
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-[0.95rem] text-text transition-colors active:bg-white/[0.06]"
            >
              {downloading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : status === "done" ? (
                <Trash2 size={20} />
              ) : status === "error" ? (
                <AlertTriangle size={20} className="text-primary" />
              ) : (
                <Download size={20} />
              )}
              <span>
                {downloading
                  ? `Annuler le téléchargement${resolving ? "" : ` (${percent} %)`}`
                  : status === "done"
                    ? "Supprimer le téléchargement"
                    : status === "error"
                      ? "Réessayer le téléchargement"
                      : "Télécharger l’épisode"}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function EpisodeCardInner({
  episode,
  animeImage,
  selectedLanguage,
  countryOfOrigin,
  spoilerMode,
  loading,
  onPlay,
  onPrewarm,
  focused = false,
  progress,
  download,
  downloadResolving,
  onDownload,
  onCancelDownload,
  onRemoveDownload,
  canDownload,
  watched,
  onToggleWatched,
  selectMode,
  selected,
  onToggleSelect,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const longPressTimerRef = useRef(null);
  const longPressStartRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const upcoming = Boolean(episode.__isUpcomingUnavailable);
  const delayed = upcoming && isPastAirDate(episode.airDate);
  const num = episode.episode || episode.number;
  const img = episode.image || episode.thumbnail || animeImage;
  const spoilered = spoilerMode && !upcoming && !watched;
  const pct = Math.max(progress?.progressPercent || 0, 0);
  const hasMobileActions = !upcoming && Boolean(onToggleWatched || canDownload);
  // Un épisode déjà téléchargé ou en file n'est pas sélectionnable.
  const selectDisabled = upcoming || ["done", "downloading", "queued"].includes(download?.status);

  const cancelLongPress = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressStartRef.current = null;
  };

  useEffect(() => cancelLongPress, []);

  // Mis en évidence à l'arrivée sur la fiche : amené au centre de l'écran.
  const rootRef = useRef(null);
  useEffect(() => {
    if (focused) rootRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  // Après un court arrêt sur la carte, la source est préchauffée.
  const hoverTimerRef = useRef(null);
  const cancelHover = () => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  };
  useEffect(() => cancelHover, []);
  const startHover = (event) => {
    if (!onPrewarm || upcoming || selectMode || event.pointerType !== "mouse") return;
    cancelHover();
    hoverTimerRef.current = window.setTimeout(onPrewarm, HOVER_PREWARM_DELAY_MS);
  };

  const startLongPress = (event) => {
    if (
      selectMode ||
      !platform.isMobile ||
      !hasMobileActions ||
      event.pointerType !== "touch" ||
      !event.isPrimary
    ) {
      return;
    }

    cancelLongPress();
    longPressTriggeredRef.current = false;
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressStartRef.current = null;
      longPressTriggeredRef.current = true;
      platform.haptic?.("medium");
      setActionsOpen(true);
    }, LONG_PRESS_DELAY_MS);
  };

  const trackLongPress = (event) => {
    const start = longPressStartRef.current;
    if (!start) return;
    if (
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >
      LONG_PRESS_MOVE_TOLERANCE_PX
    ) {
      cancelLongPress();
    }
  };

  const playOrIgnoreLongPress = (event) => {
    if (selectMode) {
      if (!selectDisabled) onToggleSelect?.();
      return;
    }
    // Android émet un `click` au relâchement d'un appui long.
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      longPressTriggeredRef.current = false;
      return;
    }
    if (!upcoming) onPlay();
  };

  return (
    <div
      ref={rootRef}
      className={`group relative flex w-full items-center gap-3 rounded-md border-2 border-transparent p-2 transition-[background-color,border-color,box-shadow] duration-300 ${
        focused ? "border-primary/60 bg-primary/10 " : ""
      }${
        upcoming
          ? "opacity-70"
          : watched
            ? "bg-white/[0.025] hover:border-border hover:bg-surface/70 active:bg-white/[0.06] md:bg-transparent"
            : "hover:border-border hover:bg-surface/70 active:bg-white/[0.06]"
      }`}
    >
      <button
        onClick={playOrIgnoreLongPress}
        onPointerDown={startLongPress}
        onPointerMove={trackLongPress}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerEnter={startHover}
        onPointerLeave={() => {
          cancelLongPress();
          cancelHover();
        }}
        onContextMenu={(event) => {
          if (!platform.isMobile || !hasMobileActions) return;
          event.preventDefault();
        }}
        disabled={upcoming}
        className="flex min-w-0 flex-1 select-none gap-3 text-left disabled:cursor-default"
      >
        <div
          className={`relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:w-48 ${
            progress && !progress.completed && pct > 0 ? "ring-2 ring-primary" : "ring-2 ring-border"
          }`}
        >
          {img ? (
            <img
              src={img}
              alt=""
              loading="lazy"
              draggable={false}
              className={`h-full w-full object-cover transition-[filter,opacity,transform] duration-200 ${
                watched ? "brightness-75 saturate-50 md:brightness-100 md:saturate-100" : ""
              } ${spoilered ? "scale-110 blur-md" : ""}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted">
              <ImageOff size={20} />
            </div>
          )}
          {spoilered && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <EyeOff size={18} className="text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
            </div>
          )}
          {!upcoming && watched && (
            <div className="pointer-events-none absolute inset-0 bg-black/10 md:hidden" />
          )}
          <span className="absolute left-0 top-0 z-10 bg-primary py-0.5 pl-2 pr-3.5 font-impact text-sm leading-tight tracking-wide text-primary-fg [clip-path:polygon(0_0,100%_0,calc(100%_-_8px)_100%,0_100%)]">
            {num}
          </span>
          {upcoming ? (
            <span
              className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 text-[0.62rem] font-bold backdrop-blur-sm ${
                delayed ? "bg-primary/95 text-primary-fg" : "bg-accent/90 text-bg"
              }`}
            >
              {delayed ? "Retard" : "Bientôt"}
            </span>
          ) : (
            <span className="absolute bottom-1.5 right-1.5 rounded-[3px] shadow-sm">
              <Flag
                lang={selectedLanguage}
                countryOfOrigin={countryOfOrigin}
                size={15}
                title={getLanguageLabel(selectedLanguage)}
              />
            </span>
          )}
          {!upcoming && (
            <div className="absolute inset-0 hidden items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/40 group-hover:opacity-100 md:flex">
              {loading ? (
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-fg shadow-[0_3px_0_color-mix(in_srgb,rgb(var(--primary))_58%,black)]">
                  <Play size={16} className="ml-0.5 fill-current" />
                </span>
              )}
            </div>
          )}
          {!upcoming && watched && (
            <span className="absolute right-1.5 top-1.5 flex h-5 items-center gap-1 rounded-full bg-black/75 px-1.5 text-[0.62rem] font-bold text-white/90 shadow-md ring-1 ring-white/15 backdrop-blur-sm md:hidden">
              <Check size={11} strokeWidth={3} />
              Vu
            </span>
          )}
          {selectMode && (
            <div
              className={`absolute inset-0 flex items-center justify-center ${
                selected ? "bg-primary/25" : selectDisabled ? "bg-black/50" : "bg-black/25"
              }`}
            >
              {selected ? (
                <CheckSquare size={28} className="text-primary drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
              ) : (
                <Square
                  size={28}
                  className={`drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${
                    selectDisabled ? "text-white/30" : "text-white/85"
                  }`}
                />
              )}
            </div>
          )}
          {!upcoming && progress && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
              <div
                className={progress.completed ? "h-full bg-accent" : "h-full bg-primary"}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <h3
            className={`line-clamp-1 pr-7 text-sm font-semibold group-hover:text-primary sm:text-base ${
              watched ? "text-text/80 md:text-text" : "text-text"
            }`}
          >
            {episode.title || `Épisode ${num}`}
          </h3>
          {upcoming ? (
            <p
              className={`mt-1 flex items-center gap-1.5 pr-7 text-xs sm:text-sm ${
                delayed ? "font-medium text-primary" : "text-accent"
              }`}
            >
              {delayed ? <AlertTriangle size={13} /> : <Clock3 size={13} />}
              {delayed
                ? `Retard — la sortie était prévue le ${formatFrenchDate(episode.airDate)}`
                : episode.airDate
                  ? `Sortie prévue le ${formatFrenchDate(episode.airDate)}`
                  : "Bientôt disponible"}
            </p>
          ) : (
            <>
              {/* Si la source les fournit. */}
              {(episode.length || episode.rating != null) && (
                <p className="mt-1 flex items-center gap-2.5 pr-7 text-[0.68rem] text-muted/80 sm:text-xs">
                  {episode.length ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 size={12} />
                      {episode.length} min
                    </span>
                  ) : null}
                  {episode.rating != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Star size={12} className="fill-current text-accent" />
                      {episode.rating.toFixed(1)}
                    </span>
                  ) : null}
                </p>
              )}
              <p className="mt-1 line-clamp-2 pr-1 text-xs leading-relaxed text-muted sm:pr-28 sm:text-sm">
                {episode.description || "Aucune description disponible."}
              </p>
            </>
          )}
        </div>
      </button>

      {/* Mobile : une seule action ouvre le menu. */}
      {hasMobileActions && !selectMode && (
        <button
          type="button"
          onClick={() => setActionsOpen(true)}
          title={`Actions pour l’épisode ${num}`}
          className="absolute right-0.5 top-0.5 flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors active:bg-white/[0.08] active:text-text md:hidden"
        >
          <MoreVertical size={20} />
        </button>
      )}

      <EpisodeActionsSheet
        open={actionsOpen}
        episode={episode}
        watched={watched}
        onToggleWatched={onToggleWatched}
        canDownload={canDownload}
        download={download}
        resolving={downloadResolving}
        onDownload={onDownload}
        onCancel={onCancelDownload}
        onRemove={onRemoveDownload}
        onClose={() => setActionsOpen(false)}
      />

      {!upcoming && onToggleWatched && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatched(e.shiftKey);
          }}
          title={
            watched
              ? "Marquer comme non vu (Maj+clic : plage)"
              : "Marquer comme vu (Maj+clic : plage)"
          }
          className={`hidden shrink-0 items-center justify-center rounded-md p-2 transition-colors hover:bg-white/[0.06] md:flex ${
            watched ? "text-accent" : "text-muted hover:text-text"
          }`}
        >
          {watched ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>
      )}

      {!upcoming && canDownload && (
        <div className="hidden md:block">
          <DownloadControl
            download={download}
            resolving={downloadResolving}
            onDownload={onDownload}
            onCancel={onCancelDownload}
            onRemove={onRemoveDownload}
          />
        </div>
      )}
    </div>
  );
}

export const EpisodeCard = memo(EpisodeCardInner);
