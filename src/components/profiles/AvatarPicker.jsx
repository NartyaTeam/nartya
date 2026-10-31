import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { listProfileAvatars } from "@/api/accountProfiles";

const CATEGORIES = [
  { id: "anime", label: "Anime & manga" },
  { id: "films", label: "Films & séries" },
  { id: "musique", label: "Musique" },
  { id: "nartya", label: "Nartya" },
];

let catalog = null; // une lecture par session

/** `accountAvatar` : proposé en tête pour le profil principal (valeur `null`). */
export default function AvatarPicker({ value, accountAvatar = null, onPick, onClose }) {
  const [items, setItems] = useState(catalog);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState(
    () => (value && catalog?.find((a) => a.id === value)?.category) || (accountAvatar && !value ? "nartya" : "anime")
  );

  useEffect(() => {
    if (catalog) return;
    listProfileAvatars()
      .then((rows) => {
        catalog = rows;
        setItems(rows);
        const current = rows.find((a) => a.id === value);
        if (current) setTab(current.category);
      })
      .catch(() => setError(true));
  }, [value]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = useMemo(() => (items ?? []).filter((a) => a.category === tab), [items, tab]);

  const tile = (key, src, label, selected, onClick) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      title={label}
      className="group relative aspect-square overflow-hidden rounded-lg bg-surface-2 outline-none ring-offset-2 ring-offset-surface transition focus-visible:ring-2 focus-visible:ring-primary"
    >
      <img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1 pt-4 text-[0.65rem] font-semibold opacity-0 transition group-hover:opacity-100">
        {label}
      </span>
      {selected && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 ring-4 ring-inset ring-primary">
          <Check size={28} className="text-primary" />
        </span>
      )}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-in-fast relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-surface shadow-card">
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-4">
          <div>
            <p className="eyebrow">Profil</p>
            <h2 className="mt-1 font-display text-xl font-bold">Choisir un avatar</h2>
          </div>
          <button onClick={onClose} title="Fermer" className="text-muted transition-colors hover:text-primary">
            <X size={20} />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto px-5 pb-3">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === c.id ? "bg-primary text-primary-fg" : "bg-white/[0.05] text-muted hover:text-text"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="min-h-[200px] overflow-y-auto px-5 pb-5">
          {error ? (
            <p className="py-10 text-center text-sm text-muted">Les avatars n'ont pas pu être chargés.</p>
          ) : !items ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-muted" />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {accountAvatar &&
                tab === "nartya" &&
                tile("account", accountAvatar, "Avatar du compte", value == null, () => onPick(null))}
              {visible.map((a) => tile(a.id, a.image_url, a.label, value === a.id, () => onPick(a.id, a)))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
