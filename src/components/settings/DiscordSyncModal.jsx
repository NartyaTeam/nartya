import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Image, LoaderCircle, X } from "lucide-react";
import DiscordIcon from "@/components/icons/DiscordIcon";

export default function DiscordSyncModal({ offer, pending, onConfirm, onCancel }) {
  const [selection, setSelection] = useState({ avatar: false, banner: false });

  useEffect(() => {
    setSelection({ avatar: !!offer.avatar, banner: !!offer.banner });
  }, [offer]);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && !pending && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, pending]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fermer"
        disabled={pending}
        className="absolute inset-0 cursor-default bg-black/80 backdrop-blur-md"
        onClick={onCancel}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="discord-sync-title"
        className="animate-slide-up relative w-full max-w-[30rem] overflow-hidden rounded-[6px] border border-border bg-surface shadow-[0_28px_90px_-24px_rgba(0,0,0,0.95)] ring-1 ring-white/10"
      >
        <div className="h-[2px] bg-[#5865F2]" />
        <header className="relative px-6 pb-4 pt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Fermer"
            className="absolute right-4 top-4 rounded-[4px] p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-text disabled:opacity-40"
          >
            <X size={18} />
          </button>
          <span className="grid h-11 w-11 place-items-center rounded-[5px] bg-[#5865F2]/12 text-[#8f99ff]">
            <DiscordIcon className="h-5 w-5" />
          </span>
          <h2 id="discord-sync-title" className="mt-5 font-display text-2xl font-bold tracking-tight">
            Utiliser tes visuels Discord ?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Choisis ce que Nartya doit importer. Chaque élément sélectionné remplacera son équivalent actuel.
          </p>
        </header>

        <div className="mx-6 space-y-2 border-y border-border/60 py-4">
          {offer.avatar && (
            <button
              type="button"
              role="checkbox"
              aria-checked={selection.avatar}
              disabled={pending}
              onClick={() => setSelection((current) => ({ ...current, avatar: !current.avatar }))}
              className={`flex w-full items-center gap-3 rounded-[5px] border p-3 text-left transition-colors ${
                selection.avatar
                  ? "border-[#5865F2]/45 bg-[#5865F2]/[0.08]"
                  : "border-border/70 bg-bg/20 hover:border-border"
              }`}
            >
              {offer.avatarUrl ? (
                <img src={offer.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-[5px] object-cover" />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[5px] bg-white/[0.045]">
                  <Image size={16} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text">Photo de profil Discord</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {offer.avatarWillReplace ? "Remplacera ta photo Nartya actuelle" : "Sera ajoutée à ton profil"}
                </span>
              </span>
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-[3px] border ${
                  selection.avatar ? "border-[#5865F2] bg-[#5865F2] text-white" : "border-border"
                }`}
              >
                {selection.avatar && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          )}

          {offer.banner && (
            <button
              type="button"
              role="checkbox"
              aria-checked={selection.banner}
              disabled={pending}
              onClick={() => setSelection((current) => ({ ...current, banner: !current.banner }))}
              className={`relative flex min-h-[76px] w-full items-end overflow-hidden rounded-[5px] border p-3 text-left transition-colors ${
                selection.banner ? "border-[#5865F2]/55" : "border-border/70 hover:border-border"
              }`}
            >
              {offer.bannerUrl ? (
                <img src={offer.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="absolute inset-0 bg-surface-2" />
              )}
              <span className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/35" />
              <span className="relative min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">Bannière Discord</span>
                <span className="mt-0.5 block text-xs text-white/60">
                  {offer.bannerWillReplace ? "Remplacera ta bannière Nartya actuelle" : "Sera ajoutée à ton profil"}
                </span>
              </span>
              <span
                className={`relative grid h-5 w-5 shrink-0 place-items-center rounded-[3px] border ${
                  selection.banner ? "border-[#5865F2] bg-[#5865F2] text-white" : "border-white/35"
                }`}
              >
                {selection.banner && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          )}

          <p className="pt-2 text-[0.68rem] leading-relaxed text-muted/75">
            Le remplacement ne modifie rien sur Discord. Il change uniquement les visuels affichés sur Nartya.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-3 px-6 py-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-9 rounded-[5px] border border-border px-3 text-xs font-semibold text-muted transition-colors hover:text-text disabled:opacity-40"
          >
            Garder mon profil
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selection)}
            disabled={pending || (!selection.avatar && !selection.banner)}
            className="inline-flex h-9 items-center gap-2 rounded-[5px] bg-[#5865F2] px-4 text-xs font-bold text-white transition-colors hover:bg-[#6875f5] disabled:opacity-60"
          >
            {pending && <LoaderCircle size={13} className="animate-spin" />}
            Synchroniser
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
