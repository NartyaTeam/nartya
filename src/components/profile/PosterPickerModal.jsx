import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ImageOff, Loader2, RotateCcw, X } from "lucide-react";
import { getAnimeGallery, getAnimePage } from "@/api/animeApi";
import { isCustomCover, setFavoriteCover } from "@/api/favorites";
import { toast } from "@/lib/toast";

/** Choix de l'affiche d'un favori à la une, parmi les affiches de la galerie de l'anime. */
export default function PosterPickerModal({ favorite, onSaved, onClose }) {
  const [posters, setPosters] = useState(null);
  const [saving, setSaving] = useState(null);
  const slug = favorite.anime_slug;
  const current = favorite.anime_cover || "";

  useEffect(() => {
    let alive = true;
    getAnimeGallery(slug)
      .then((images) => alive && setPosters((images || []).filter((img) => img.type === "poster")))
      .catch(() => alive && setPosters([]));
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const choose = async (poster) => {
    setSaving(poster?.full || "reset");
    try {
      let fallback = null;
      if (!poster) {
        const page = await getAnimePage(slug).catch(() => null);
        fallback = page?.images?.poster || page?.anilist?.cover || page?.anime?.image || null;
      }
      const cover = await setFavoriteCover(slug, poster?.full || null, fallback);
      onSaved(slug, cover);
      onClose();
    } catch {
      toast.error("Impossible d'enregistrer l'affiche");
    } finally {
      setSaving(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end md:items-center md:justify-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Choisir l'affiche"
    >
      <button className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-label="Fermer" />
      <section className="relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-xl border-t-2 border-border bg-bg shadow-2xl animate-slide-up md:max-w-2xl md:rounded-md md:border-2">
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4 md:px-5">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-primary/80">Podium</p>
            <h2 className="mt-1 truncate font-display text-xl font-bold">{favorite.anime_title || slug}</h2>
            <p className="mt-0.5 text-xs text-muted">Choisis l'affiche qui apparaîtra sur ton profil.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-muted active:bg-white/10"
          >
            <X size={19} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-5">
          {isCustomCover(current) && (
            <button
              type="button"
              onClick={() => choose(null)}
              disabled={Boolean(saving)}
              className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-surface px-3 py-2 text-xs font-semibold text-text ring-2 ring-border transition-colors hover:ring-primary/60 disabled:opacity-50"
            >
              {saving === "reset" ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Revenir à l'affiche d'origine
            </button>
          )}
          {posters === null ? (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="aspect-[2/3] skeleton rounded" />
              ))}
            </div>
          ) : posters.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted">
              <ImageOff size={24} />
              Pas d'autre affiche disponible pour cet anime.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {posters.map((poster) => {
                const selected = current.startsWith(poster.full);
                return (
                  <button
                    key={poster.full}
                    type="button"
                    onClick={() => choose(poster)}
                    disabled={Boolean(saving)}
                    className={`relative aspect-[2/3] overflow-hidden rounded ring-2 transition ${
                      selected ? "ring-primary" : "ring-transparent hover:ring-white/30"
                    }`}
                  >
                    <img src={poster.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {(selected || saving === poster.full) && (
                      <span className="absolute inset-0 flex items-center justify-center bg-primary/25">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-fg">
                          {saving === poster.full ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
