import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Search, X } from "lucide-react";

const ROW_HEIGHT = 50;
const OVERSCAN = 6;

/** Les chapitres restants sont cochés par défaut. `statusOf(chapter)` renvoie le statut existant. */
export function ChapterDownloadSheet({ open, chapters = [], statusOf, onClose, onConfirm }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);
  const listRef = useRef(null);

  const selectable = useMemo(
    () => chapters.filter((c) => !statusOf?.(c.chapter)),
    [chapters, statusOf]
  );

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected(new Set(selectable.map((c) => c.chapter)));
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = 0;
        setViewportHeight(listRef.current.clientHeight || 420);
      }
      setScrollTop(0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const filtered = search.trim()
    ? chapters.filter((item) => String(item.chapter).includes(search.trim()))
    : chapters;

  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.chapter));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectable.map((c) => c.chapter)));
  };
  const toggleOne = (chapter) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(chapter)) next.delete(chapter);
      else next.add(chapter);
      return next;
    });
  };

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    filtered.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
  );
  const visible = filtered.slice(start, end);

  const confirm = () => {
    const targets = chapters.filter((c) => selected.has(c.chapter));
    if (!targets.length) return;
    onConfirm(targets);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/65 md:items-center md:justify-center" onClick={onClose}>
      <div
        className="flex max-h-[82vh] min-h-[55vh] w-full flex-col rounded-t-2xl border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-card md:max-w-md md:rounded-2xl md:border"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 pt-2.5">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20 md:hidden" />
          <div className="flex items-center justify-between px-4 pb-2">
            <h3 className="font-display text-base font-semibold text-text">Télécharger des chapitres</h3>
            <button onClick={onClose} className="text-sm font-medium text-primary">
              Fermer
            </button>
          </div>
          <div className="flex items-center gap-3 px-4 pb-3">
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-white/[0.05] px-3.5 ring-1 ring-border/60 focus-within:ring-primary/50">
              <Search size={18} className="shrink-0 text-muted" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setScrollTop(0);
                  if (listRef.current) listRef.current.scrollTop = 0;
                }}
                inputMode="decimal"
                placeholder="Rechercher un chapitre…"
                className="w-full bg-transparent text-[0.95rem] outline-none placeholder:text-muted"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted active:text-text" title="Effacer">
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleAll}
            disabled={!selectable.length}
            className="flex w-full items-center gap-2.5 border-y border-border/60 px-4 py-2.5 text-left text-sm font-medium text-text transition-colors active:bg-white/[0.05] disabled:opacity-40"
          >
            <Checkbox checked={allSelected} />
            Tout sélectionner
            <span className="ml-auto text-xs font-normal text-muted">
              {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
            </span>
          </button>
        </div>

        <div
          ref={listRef}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2"
        >
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">Aucun chapitre trouvé.</p>
          ) : (
            <div className="relative" style={{ height: filtered.length * ROW_HEIGHT }}>
              <div className="absolute inset-x-0 top-0" style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
                {visible.map((item) => {
                  const status = statusOf?.(item.chapter);
                  const acquired = status === "done";
                  const inProgress = status === "queued" || status === "downloading" || status === "resolving";
                  const disabled = acquired || inProgress;
                  return (
                    <button
                      key={item.chapter}
                      type="button"
                      onClick={() => !disabled && toggleOne(item.chapter)}
                      disabled={disabled}
                      style={{ height: ROW_HEIGHT }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3.5 text-left text-text transition-colors active:bg-white/[0.07] disabled:cursor-default"
                    >
                      {inProgress ? (
                        <Loader2 size={16} className="shrink-0 animate-spin text-muted" />
                      ) : (
                        <Checkbox checked={acquired || selected.has(item.chapter)} muted={acquired} />
                      )}
                      <span className={`min-w-0 flex-1 truncate ${disabled ? "text-muted" : ""}`}>
                        Chapitre {item.chapter}
                      </span>
                      {acquired && <span className="shrink-0 text-xs text-muted">Téléchargé</span>}
                      {inProgress && <span className="shrink-0 text-xs text-muted">En cours…</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pt-3">
          <button
            onClick={confirm}
            disabled={selected.size === 0}
            className="btn-shu w-full disabled:cursor-not-allowed disabled:opacity-40"
          >
            Télécharger {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Checkbox({ checked, muted }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 transition-colors ${
        checked ? (muted ? "bg-muted/30 ring-muted/40" : "bg-primary ring-primary") : "ring-border"
      }`}
    >
      {checked && <Check size={13} className={muted ? "text-muted" : "text-primary-fg"} />}
    </span>
  );
}
