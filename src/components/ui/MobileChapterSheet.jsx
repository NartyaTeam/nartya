import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";

const ROW_HEIGHT = 50;
const OVERSCAN = 6;

export function MobileChapterSheet({ open, chapters = [], value, onChange, onClose }) {
  const [search, setSearch] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const query = search.trim();
    if (!query) return chapters;
    return chapters.filter((item) => String(item.chapter).includes(query));
  }, [chapters, search]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    const index = chapters.findIndex((item) => item.chapter === value);
    const top = Math.max(0, index * ROW_HEIGHT - 180);
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = top;
        setViewportHeight(listRef.current.clientHeight || 420);
      }
      setScrollTop(top);
    });
  }, [chapters, open, value]);

  if (!open || typeof document === "undefined") return null;

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    filtered.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
  );
  const visible = filtered.slice(start, end);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/65" onClick={onClose}>
      <div
        className="flex max-h-[82vh] min-h-[55vh] flex-col rounded-t-2xl border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 pt-2.5">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" />
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
            <button onClick={onClose} className="text-sm font-medium text-primary">
              Fermer
            </button>
          </div>
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
                  const active = item.chapter === value;
                  return (
                    <button
                      key={item.chapter}
                      type="button"
                      onClick={() => {
                        onChange(item.chapter);
                        onClose();
                      }}
                      style={{ height: ROW_HEIGHT }}
                      className={`flex w-full items-center rounded-lg px-3.5 text-left transition-colors active:bg-white/[0.07] ${
                        active ? "font-semibold text-primary" : "text-text"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">Chapitre {item.chapter}</span>
                      {active && <Check size={18} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
