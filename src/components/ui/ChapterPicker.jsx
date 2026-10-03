import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search } from "lucide-react";

const ROW_H = 36; // hauteur fixe, pour la virtualisation
const VIEW_H = 288; // max-h-72
const OVERSCAN = 6;

/**
 * Seules les lignes visibles sont montées : un <Select> Radix rend tous les items, trop lent
 * au-delà de 1000 chapitres.
 */
export function ChapterPicker({ value, chapters = [], onChange, className = "", align = "start" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return chapters;
    return chapters.filter((c) => String(c.chapter).includes(q));
  }, [chapters, search]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Recherche vidée, liste centrée sur le chapitre courant.
  useLayoutEffect(() => {
    if (!open) return;
    setSearch("");
    const idx = chapters.findIndex((c) => c.chapter === value);
    const top = idx >= 0 ? Math.max(0, idx * ROW_H - VIEW_H / 2) : 0;
    if (listRef.current) {
      listRef.current.scrollTop = top;
      setScrollTop(top);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(filtered.length, Math.ceil((scrollTop + VIEW_H) / ROW_H) + OVERSCAN);
  const visible = filtered.slice(start, end);

  const select = (chap) => {
    onChange?.(chap);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Chapitre"
        className="flex h-10 w-full items-center gap-2 rounded-md bg-surface pl-3.5 pr-3 text-sm font-medium text-text ring-1 ring-border transition-colors hover:bg-surface-2 data-[open=true]:ring-primary/60"
        data-open={open}
      >
        <span className="truncate">{value != null ? `Chapitre ${value}` : "Chapitre"}</span>
        <ChevronDown size={15} className="ml-auto shrink-0 text-muted" />
      </button>

      {open && (
        <div
          className={`absolute top-[calc(100%+6px)] z-[300] w-64 overflow-hidden rounded-md border border-border bg-surface shadow-card ring-1 ring-black/40 ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (listRef.current) listRef.current.scrollTop = 0;
                setScrollTop(0);
              }}
              inputMode="numeric"
              placeholder="Aller au chapitre…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>

          <div
            ref={listRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            className="max-h-72 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <p className="px-2.5 py-4 text-center text-sm text-muted">Aucun chapitre.</p>
            ) : (
              <div style={{ height: filtered.length * ROW_H, position: "relative" }}>
                <div style={{ transform: `translateY(${start * ROW_H}px)` }}>
                  {visible.map((c) => {
                    const selected = c.chapter === value;
                    return (
                      <button
                        key={c.chapter}
                        type="button"
                        onClick={() => select(c.chapter)}
                        style={{ height: ROW_H }}
                        className={`flex w-full items-center gap-2 rounded px-2.5 text-left text-sm outline-none transition-colors ${
                          selected
                            ? "bg-primary/15 font-semibold text-primary"
                            : "text-text hover:bg-surface-2"
                        }`}
                      >
                        <span className="flex-1 truncate">Chapitre {c.chapter}</span>
                        {selected && <Check size={15} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
