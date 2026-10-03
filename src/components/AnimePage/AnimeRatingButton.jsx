import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Star, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/useAuthStore";
import { GUEST_FEATURE_MSG } from "@/lib/guest";
import {
  getAnimeRatingSummary,
  ratingErrorMessage,
  removeAnimeRating,
  saveAnimeRating,
} from "@/api/ratings";

const LABELS = {
  1: "Décevant",
  2: "Moyen",
  3: "Bien",
  4: "Très bien",
  5: "Coup de cœur",
};

function StarPicker({ value, hover, onHover, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="Note sur 5"
      className="flex justify-center gap-2"
      onMouseLeave={() => onHover(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= (hover || value);
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} étoile${star > 1 ? "s" : ""}`}
            onMouseEnter={() => onHover(star)}
            onFocus={() => onHover(star)}
            onBlur={() => onHover(0)}
            onClick={() => onChange(star)}
            className="rounded-md p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <Star
              size={34}
              className={`transition-colors ${active ? "fill-primary text-primary" : "text-white/20"}`}
            />
          </button>
        );
      })}
    </div>
  );
}

export default function AnimeRatingButton({ slug, title, summary, onSummaryChange }) {
  const session = useAuthStore((state) => state.session);
  const isGuest = !!session?.user?.is_anonymous;
  const canRate = !!session && !isGuest;
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(summary?.mine || 0);
  const [hover, setHover] = useState(0);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => setRating(summary?.mine || 0), [summary?.mine]);

  const refresh = async () => {
    const next = await getAnimeRatingSummary(slug);
    onSummaryChange(next);
    return next;
  };

  const save = async () => {
    if (!rating || saving) return;
    setSaving(true);
    try {
      await saveAnimeRating(slug, rating);
      await refresh();
      toast.success("Ta note est enregistrée.");
      setOpen(false);
    } catch (error) {
      toast.error(ratingErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!summary?.mine || removing) return;
    setRemoving(true);
    try {
      await removeAnimeRating(slug);
      await refresh();
      toast.success("Ta note a été retirée.");
      setOpen(false);
    } catch (error) {
      toast.error(ratingErrorMessage(error));
    } finally {
      setRemoving(false);
    }
  };

  const openPicker = () => {
    if (!canRate) {
      toast.info(session ? GUEST_FEATURE_MSG : "Connecte-toi pour noter cet anime");
      return;
    }
    setRating(summary?.mine || 0);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="group inline-flex items-center gap-2 rounded-md bg-white/[0.06] px-3 py-2 text-sm font-medium text-text ring-1 ring-border transition-colors hover:bg-white/[0.1] hover:text-primary"
      >
        <Star size={15} className={summary?.mine ? "fill-primary text-primary" : "text-muted group-hover:text-primary"} />
        {summary?.mine ? `Ma note : ${summary.mine}/5` : "Noter l’anime"}
      </button>

      <Dialog.Root open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm animate-in fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[71] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-card ring-1 ring-white/10 animate-in fade-in-0 zoom-in-95">
            <div className="h-[3px] bg-gradient-to-r from-primary via-primary/70 to-transparent" />
            <div className="relative px-7 py-6 text-center">
              <Dialog.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-text">
                <X size={17} />
              </Dialog.Close>
              <p className="eyebrow">Note Nartya</p>
              <Dialog.Title className="mt-2 font-display text-2xl font-bold">Tu lui donnes combien ?</Dialog.Title>
              <Dialog.Description className="mx-auto mt-1 max-w-xs truncate text-sm text-muted">
                {title}
              </Dialog.Description>

              <div className="mt-7">
                <StarPicker value={rating} hover={hover} onHover={setHover} onChange={setRating} />
                <p className="mt-3 h-5 text-sm font-semibold text-text/85">
                  {LABELS[hover || rating] || "Choisis une note"}
                </p>
              </div>

              {summary?.average != null && (
                <p className="mt-3 text-xs text-muted">
                  Communauté : <span className="font-semibold text-text">{summary.average.toFixed(1)}/5</span>
                  {` · ${summary.count} notes`}
                </p>
              )}

              <div className="mt-7 flex items-center justify-center gap-3">
                {summary?.mine && (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={removing || saving}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                  >
                    {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Retirer
                  </button>
                )}
                <button
                  type="button"
                  onClick={save}
                  disabled={!rating || saving || removing}
                  className="btn-shu px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  Enregistrer
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
