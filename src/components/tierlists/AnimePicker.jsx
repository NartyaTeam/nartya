import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { searchAnimes, searchCharacters, searchMusic } from "@/api/animeApi";
import { useDisplayTitle } from "@/stores/useTitlesStore";
import { KINDS, toItem } from "@/lib/tierLists";

const LIMIT = 30;
const SEARCH = { anime: searchAnimes, character: searchCharacters, music: searchMusic };

/**
 * Recherche à ajouter, en menu déroulant : une recherche vague remonte plusieurs titres proches,
 * on choisit le bon. `kind` : animes, personnages ou musiques. `has(slug)` : déjà dans la tier
 * list. `onAdd(items)` reçoit des éléments au format de la tier list.
 */
export default function AnimePicker({ kind = "anime", has, onAdd, className = "" }) {
  const displayTitle = useDisplayTitle();
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const term = query.trim();

  useEffect(() => {
    if (!term) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(
      () =>
        SEARCH[kind](term, LIMIT)
          .then((rows) => {
            if (!alive) return;
            setResults((rows || []).filter((r) => r?.slug).map((r) => ({ ...toItem(r), sub: r.subtitle || "" })));
            setCursor(0);
          })
          .catch(() => alive && setResults([]))
          .finally(() => alive && setLoading(false)),
      300
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term, kind]);

  useEffect(() => {
    setQuery("");
    setResults([]);
  }, [kind]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const rows = useMemo(
    () => results.map((item) => ({ ...item, title: displayTitle(item.slug, item.title) })),
    [results, displayTitle]
  );

  const pick = ({ sub: _sub, ...item }) => {
    if (!has(item.slug)) onAdd([item]);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!rows.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => (c + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(rows[cursor]);
    }
  };

  const showMenu = open && term && (rows.length > 0 || !loading);

  return (
    <section aria-label="Ajouter des animes" ref={rootRef} className={`relative z-20 w-full max-w-xl ${className}`}>
      <div className="flex h-12 items-center gap-3 rounded-md bg-surface px-4 ring-2 ring-border transition-colors focus-within:ring-primary/70">
        {loading ? (
          <Loader2 size={18} className="shrink-0 animate-spin text-muted" />
        ) : (
          <Search size={18} className="shrink-0 text-muted" />
        )}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={KINDS[kind].placeholder}
          aria-label={KINDS[kind].placeholder}
          role="combobox"
          aria-expanded={Boolean(showMenu)}
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label="Effacer la recherche"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:text-text"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showMenu && (
        <div className="absolute inset-x-0 top-full mt-1.5 overflow-hidden rounded-md bg-surface shadow-2xl ring-2 ring-border">
          {rows.length ? (
            <ul ref={listRef} role="listbox" className="max-h-[30rem] overflow-y-auto overscroll-contain py-1">
              {rows.map((item, index) => {
                const added = has(item.slug);
                return (
                  <li key={item.slug} role="option" aria-selected={index === cursor} data-active={index === cursor}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => pick(item)}
                      onMouseEnter={() => setCursor(index)}
                      className={`flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors disabled:cursor-default ${
                        index === cursor ? "bg-white/[0.06]" : ""
                      }`}
                    >
                      {item.cover ? (
                        <img
                          src={item.cover}
                          alt=""
                          loading="lazy"
                          className={`h-12 shrink-0 rounded-sm object-cover ${kind === "music" ? "w-12" : "w-9"}`}
                        />
                      ) : (
                        <span className="h-12 w-9 shrink-0 rounded-sm bg-surface-2" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-bold ${added ? "text-muted" : "text-text"}`}>{item.title}</span>
                        {item.sub && <span className="block truncate text-xs text-muted">{item.sub}</span>}
                      </span>
                      {added ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-muted">
                          <Check size={14} /> Ajouté
                        </span>
                      ) : (
                        <Plus size={16} className="shrink-0 text-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            !loading && <p className="px-4 py-5 text-center text-xs text-muted">Aucun résultat pour « {term} ».</p>
          )}
        </div>
      )}
    </section>
  );
}
