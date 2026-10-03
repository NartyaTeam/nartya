import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X, Play, Loader2, CalendarDays, Trash2, Info } from "lucide-react";
import { getAllEpisodes, getAnimePage } from "@/api/animeApi";
import { getAnimeProgressMap } from "@/api/progress";
import { setAnimeListDates } from "@/api/lists";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useListsStore } from "@/stores/useListsStore";
import { Select } from "@/components/ui/Select";
import { LIST_STATUSES } from "@/utils/lists";

/** "YYYY-MM-DD" pour un <input type="date">, ou "". */
const toDateInputValue = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

/** Premier épisode non terminé ; si tout est vu, le dernier. */
function pickResume(episodes, progressMap) {
  if (!episodes.length) return null;
  for (const ep of episodes) {
    if (!progressMap[`${ep.seasonId}:${ep.number}`]?.completed) return ep;
  }
  return episodes[episodes.length - 1];
}

function Field({ label, children }) {
  return (
    <div>
      <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted">{label}</p>
      {children}
    </div>
  );
}

/** Passe en « Terminé » quand tous les épisodes sont vus. */
export default function ListDetailDrawer({ row, onClose, onStatusChange, onDatesChange, onRemove }) {
  const navigate = useNavigate();
  const defaultLanguage = useSettingsStore((s) => s.defaultLanguage);
  const setStatus = useListsStore((s) => s.setStatus);

  const [episodes, setEpisodes] = useState(null); // null = chargement
  const [progressMap, setProgressMap] = useState({});
  const [banner, setBanner] = useState(null);
  const [status, setLocalStatus] = useState(row.status);
  const [startedInput, setStartedInput] = useState(() => toDateInputValue(row.started_at));
  const [completedInput, setCompletedInput] = useState(() => toDateInputValue(row.completed_at));
  const [savingDates, setSavingDates] = useState(false);

  const slug = row.anime_slug;

  useEffect(() => {
    let alive = true;
    setEpisodes(null);
    setBanner(null);
    Promise.all([
      getAllEpisodes(slug).catch(() => []),
      getAnimeProgressMap(slug).catch(() => ({})),
      getAnimePage(slug).catch(() => null),
    ]).then(([eps, map, page]) => {
      if (!alive) return;
      setProgressMap(map);
      setEpisodes(eps);
      setBanner(page?.images?.fanart || page?.images?.banner || null);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  const total = episodes?.length || 0;
  const watched = useMemo(() => {
    if (!episodes) return 0;
    return episodes.filter((ep) => progressMap[`${ep.seasonId}:${ep.number}`]?.completed).length;
  }, [episodes, progressMap]);
  const remaining = Math.max(0, total - watched);
  const pct = total ? Math.round((watched / total) * 100) : 0;
  const allWatched = total > 0 && watched >= total;

  const resumeEp = useMemo(
    () => (episodes ? pickResume(episodes, progressMap) : null),
    [episodes, progressMap]
  );
  const resumeProg = resumeEp ? progressMap[`${resumeEp.seasonId}:${resumeEp.number}`] : null;
  const resumeStarted = (resumeProg?.progressPercent || 0) > 0 && !resumeProg?.completed;

  useEffect(() => {
    if (episodes && total > 0 && watched >= total && status !== "completed") {
      setLocalStatus("completed");
      setStatus(slug, "completed", { title: row.anime_title, cover: row.anime_cover });
      onStatusChange?.(slug, "completed");
    }
  }, [episodes, total, watched, status, slug, setStatus, onStatusChange, row.anime_title, row.anime_cover]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onStatusSelect = (value) => {
    setLocalStatus(value);
    setStatus(slug, value, { title: row.anime_title, cover: row.anime_cover });
    onStatusChange?.(slug, value);
  };

  const handleRemove = () => {
    onClose();
    onRemove?.(slug);
  };

  // Optimiste.
  const saveDates = async (nextStarted, nextCompleted) => {
    setSavingDates(true);
    try {
      await setAnimeListDates({ slug, startedAt: nextStarted || null, completedAt: nextCompleted || null });
      onDatesChange?.(slug, { started_at: nextStarted || null, completed_at: nextCompleted || null });
    } catch {
      // Les dates sont indicatives : un échec ne bloque pas l'utilisateur.
    } finally {
      setSavingDates(false);
    }
  };

  const onStartedChange = (e) => {
    const value = e.target.value;
    setStartedInput(value);
    saveDates(value, completedInput);
  };

  const onCompletedChange = (e) => {
    const value = e.target.value;
    setCompletedInput(value);
    saveDates(startedInput, value);
  };

  const resume = () => {
    if (!resumeEp) return;
    navigate(`/watch/${slug}?season=${resumeEp.seasonId}&ep=${resumeEp.number}&lang=${defaultLanguage}`);
  };

  const openPage = () => navigate(`/anime/${slug}`);

  const resumeLabel = allWatched ? "Revoir" : resumeStarted ? "Reprendre" : watched > 0 ? "Continuer" : "Commencer";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center md:justify-center md:p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative z-10 max-h-[92dvh] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-card ring-1 ring-border animate-slide-up md:max-h-[90vh] md:rounded-md md:pb-0">
        <div className="sticky top-0 z-20 mx-auto -mb-1 mt-3 h-1 w-10 rounded-full bg-white/25 md:hidden" />
        <div className="relative h-32 bg-surface-2 sm:h-40">
          {episodes === null ? (
            <div className="h-full w-full skeleton" />
          ) : banner ? (
            <img src={banner} alt="" className="h-full w-full object-cover" />
          ) : row.anime_cover ? (
            <img
              src={row.anime_cover}
              alt=""
              className="h-full w-full object-cover"
              style={{ filter: "blur(8px)", transform: "scale(1.1)" }}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-surface/10" />
          <div className="absolute right-3 top-3 flex items-center gap-2">
            <button
              onClick={handleRemove}
              aria-label="Retirer de ma liste"
              title="Retirer de ma liste"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-md transition-colors hover:bg-red-500/70"
            >
              <Trash2 size={15} />
            </button>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-md transition-colors hover:bg-black/65"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Chevauche la bannière. */}
        <div className="relative -mt-16 flex items-end gap-4 px-4 sm:px-6">
          <img
            src={row.anime_cover}
            alt=""
            className="h-36 w-24 shrink-0 rounded-md object-cover shadow-lg ring-1 ring-white/10 sm:h-40 sm:w-[7rem]"
          />
          <div className="min-w-0 flex-1 pb-1">
            <h2 className="truncate font-display text-xl font-bold leading-tight text-text sm:text-2xl">
              {row.anime_title || slug}
            </h2>
            <Select
              title="Statut"
              value={status || undefined}
              onValueChange={onStatusSelect}
              size="sm"
              className="mt-2 w-full max-w-[10rem]"
              options={LIST_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
            />
          </div>
        </div>

        <div className="space-y-5 p-4 pt-5 sm:p-6 sm:pt-5">
          {episodes === null ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted">
              <Loader2 className="animate-spin" size={16} />
              Chargement de la progression…
            </div>
          ) : (
            <>
              <Field label="Progression">
                <div className="rounded bg-surface-2 px-3 py-2 ring-1 ring-border">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-text">
                      {total ? `${watched} / ${total}` : `${watched}`}
                    </span>
                    <span className="text-[0.7rem] text-muted">
                      {allWatched ? "Terminé" : total ? `${remaining} restant${remaining > 1 ? "s" : ""}` : "épisode(s)"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/30">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Début">
                  <div className="flex items-center gap-2 rounded bg-surface-2 px-3 py-2.5 text-sm ring-1 ring-border focus-within:ring-primary/60">
                    <CalendarDays size={14} className="shrink-0 text-muted" />
                    <input
                      type="date"
                      value={startedInput}
                      onChange={onStartedChange}
                      disabled={savingDates}
                      className={`w-full min-w-0 bg-transparent outline-none [color-scheme:dark] ${startedInput ? "text-text" : "text-muted"}`}
                    />
                  </div>
                </Field>

                <Field label="Fin">
                  <div className="flex items-center gap-2 rounded bg-surface-2 px-3 py-2.5 text-sm ring-1 ring-border focus-within:ring-primary/60">
                    <CalendarDays size={14} className="shrink-0 text-muted" />
                    <input
                      type="date"
                      value={completedInput}
                      onChange={onCompletedChange}
                      disabled={savingDates}
                      className={`w-full min-w-0 bg-transparent outline-none [color-scheme:dark] ${completedInput ? "text-text" : "text-muted"}`}
                    />
                  </div>
                </Field>
              </div>

              {resumeStarted && resumeEp && (
                <Field label="Épisode en cours">
                  <div className="flex items-center gap-3 rounded bg-surface-2 px-3.5 py-2.5 ring-1 ring-border">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                      {resumeEp.seasonName ? `${resumeEp.seasonName} · ` : ""}Épisode {resumeEp.number}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
                      {Math.round(resumeProg.progressPercent)}%
                    </span>
                  </div>
                </Field>
              )}

              <div className="flex gap-3">
                <button
                  onClick={resume}
                  disabled={!resumeEp}
                  className="flex flex-1 items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-sm font-bold text-primary-fg transition-transform hover:scale-[1.01] disabled:opacity-50"
                >
                  <Play size={16} className="fill-current" />
                  {resumeEp ? `${resumeLabel} · Épisode ${resumeEp.number}` : resumeLabel}
                </button>
                <button
                  onClick={openPage}
                  className="flex items-center justify-center gap-2 rounded bg-surface-2 px-4 py-3 text-sm font-semibold text-text ring-1 ring-border transition-colors hover:bg-white/[0.06]"
                >
                  <Info size={16} />
                  <span className="hidden sm:inline">Voir la fiche</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
