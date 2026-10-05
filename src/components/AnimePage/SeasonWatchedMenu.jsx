import { useEffect, useRef, useState } from "react";
import { CheckCheck, ChevronDown, ChevronUp } from "lucide-react";

/** Toute la saison, jusqu'à l'épisode N, ou tout retirer. `lastEpisode` borne la saisie. */
export function SeasonWatchedMenu({
  episodeCount,
  watchedCount,
  lastEpisode,
  onMarkUpTo,
  onMarkAll,
  onUnmarkAll,
  controlH = "h-10",
}) {
  const [open, setOpen] = useState(false);
  const [upto, setUpto] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const applyUpto = () => {
    const n = parseInt(upto, 10);
    if (!Number.isFinite(n) || n < 1) return;
    onMarkUpTo(Math.min(n, lastEpisode));
    setUpto("");
    setOpen(false);
  };

  const stepUpto = (direction) => {
    const current = parseInt(upto, 10);
    const next = Number.isFinite(current)
      ? Math.min(lastEpisode, Math.max(1, current + direction))
      : direction > 0
        ? 1
        : lastEpisode;
    setUpto(String(next));
  };

  const allWatched = episodeCount > 0 && watchedCount >= episodeCount;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Marquer des épisodes comme vus"
        className={`flex ${controlH} items-center gap-2 rounded-md bg-surface px-3 text-sm font-bold text-text ring-2 ring-border transition-colors hover:bg-surface-2 hover:text-primary`}
      >
        <CheckCheck size={16} />
        <span className="hidden lg:inline">Marquer vus</span>
        <span className="tabular-nums opacity-70">
          ({watchedCount}/{episodeCount})
        </span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-64 rounded-lg border border-border bg-surface p-3 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)]">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
            Épisodes vus
          </p>

          <button
            onClick={() => {
              onMarkAll();
              setOpen(false);
            }}
            disabled={allWatched}
            className="flex w-full items-center justify-between rounded-md border border-border bg-bg/40 px-3 py-2 text-sm text-text transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Toute la saison
            <span className="tabular-nums text-xs text-muted">{episodeCount} ép.</span>
          </button>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 items-stretch overflow-hidden rounded-md border border-border bg-bg/40 pl-2.5 transition-colors focus-within:border-primary/60">
              <span className="self-center whitespace-nowrap text-xs text-muted">Jusqu'à l'ép.</span>
              <input
                type="number"
                min={1}
                max={lastEpisode}
                value={upto}
                onChange={(e) => setUpto(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyUpto()}
                placeholder={String(lastEpisode)}
                className="w-full min-w-0 bg-transparent px-1.5 py-2 text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <div className="flex w-7 shrink-0 flex-col border-l border-border/80 bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => stepUpto(1)}
                  disabled={parseInt(upto, 10) >= lastEpisode}
                  aria-label="Augmenter le numéro d'épisode"
                  title="Épisode suivant"
                  className="flex min-h-0 flex-1 items-center justify-center border-b border-border/80 text-muted transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronUp size={12} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  onClick={() => stepUpto(-1)}
                  disabled={upto !== "" && parseInt(upto, 10) <= 1}
                  aria-label="Diminuer le numéro d'épisode"
                  title="Épisode précédent"
                  className="flex min-h-0 flex-1 items-center justify-center text-muted transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronDown size={12} strokeWidth={2.25} />
                </button>
              </div>
            </div>
            <button
              onClick={applyUpto}
              className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary/90"
            >
              Valider
            </button>
          </div>

          {watchedCount > 0 && (
            <button
              onClick={() => {
                onUnmarkAll();
                setOpen(false);
              }}
              className="mt-2 w-full rounded-md px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-primary"
            >
              Tout retirer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
