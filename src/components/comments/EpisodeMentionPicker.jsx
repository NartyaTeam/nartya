import { useEffect, useMemo, useState } from "react";
import { ImageOff, Search, X } from "lucide-react";
import { Select } from "@/components/ui/Select";

/**
 * Une saison peut être un arc de plusieurs centaines d'épisodes : au-delà, on renvoie vers
 * la recherche.
 */
const MAX_ROWS = 400;

/** `resolver.list(season)` fournit titres et vignettes ; sans lui ou en cas d'échec, champ numérique. */
export default function EpisodeMentionPicker({ seasons = [], resolver, onPick, onClose }) {
  const list = seasons.filter((s) => s && s.number);
  const [season, setSeason] = useState(list[0]?.number ?? null);
  const [ep, setEp] = useState("");
  const [query, setQuery] = useState("");
  const [episodes, setEpisodes] = useState(null); // null = en cours, [] = indisponible
  const current = useMemo(() => list.find((s) => s.number === season) || null, [list, season]);

  useEffect(() => {
    let alive = true;
    setEpisodes(null);
    setQuery("");
    if (!resolver?.list || season == null) {
      setEpisodes([]);
      return;
    }
    resolver
      .list(season)
      .then((rows) => alive && setEpisodes(rows || []))
      .catch(() => alive && setEpisodes([]));
    return () => {
      alive = false;
    };
  }, [resolver, season]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Une œuvre sans saisons distinctes produit « @E12 ».
  const emit = (episode) => {
    const n = Number(episode);
    if (!Number.isFinite(n) || n < 1 || n > 9999) return;
    onPick?.(list.length > 1 ? season : null, n);
  };

  const filtered = useMemo(() => {
    if (!episodes) return [];
    const q = query.trim().toLowerCase();
    if (!q) return episodes;
    return episodes.filter(
      (e) => String(e.number).includes(q) || (e.title || "").toLowerCase().includes(q)
    );
  }, [episodes, query]);

  const hasRichList = episodes != null && episodes.length > 0;
  const fallbackCount = current?.episodeCount || 0;

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className="absolute bottom-full left-0 z-50 mb-2 flex max-h-96 w-80 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-kana text-muted">
            Mentionner un épisode
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-2 p-3">
          {list.length > 1 && (
            <Select
              title="Saison"
              value={String(season ?? "")}
              onValueChange={(v) => {
                setSeason(Number(v));
                setEp("");
              }}
              className="w-full"
              options={list.map((s) => ({ value: String(s.number), label: s.label }))}
            />
          )}

          {hasRichList && (
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/60" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher un épisode ou un numéro…"
                className="w-full rounded-md bg-surface-2 py-1.5 pl-8 pr-2 text-xs text-text outline-none ring-1 ring-border focus:ring-primary/50"
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {episodes == null ? (
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 skeleton rounded-md" />
              ))}
            </div>
          ) : hasRichList ? (
            filtered.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">Aucun épisode ne correspond.</p>
            ) : (
              <div className="space-y-1">
                {filtered.slice(0, MAX_ROWS).map((e) => (
                  <button
                    key={e.number}
                    type="button"
                    onClick={() => emit(e.number)}
                    className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-primary/10"
                  >
                    <div className="relative aspect-video w-16 shrink-0 overflow-hidden rounded bg-surface-2">
                      {e.image ? (
                        <img src={e.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted/50">
                          <ImageOff size={12} />
                        </div>
                      )}
                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[0.6rem] font-bold text-white">
                        {e.number}
                      </span>
                    </div>
                    <span className="line-clamp-2 flex-1 text-xs font-medium text-text">
                      {e.title || `Épisode ${e.number}`}
                    </span>
                  </button>
                ))}
                {filtered.length > MAX_ROWS && (
                  <p className="px-1 py-2 text-center text-[0.7rem] text-muted">
                    {filtered.length - MAX_ROWS} épisodes de plus — précise ta recherche.
                  </p>
                )}
              </div>
            )
          ) : fallbackCount > 0 ? (
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: Math.min(fallbackCount, 400) }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => emit(n)}
                  className="rounded bg-surface-2 py-1 text-xs font-semibold tabular-nums text-muted transition-colors hover:bg-primary/20 hover:text-primary"
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            // Pas de <form> : le popover est déjà dans celui du composeur.
            <div className="flex gap-2">
              <input
                autoFocus
                type="number"
                min="1"
                max="9999"
                value={ep}
                onChange={(e) => setEp(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  e.stopPropagation();
                  emit(ep);
                }}
                placeholder="N° d'épisode"
                className="min-w-0 flex-1 rounded bg-surface-2 px-2 py-1.5 text-sm text-text outline-none ring-1 ring-border focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={() => emit(ep)}
                disabled={!ep}
                className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                OK
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
