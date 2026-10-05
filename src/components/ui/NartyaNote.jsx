import { useEffect } from "react";
import { Fox } from "@/components/brand/NartyaMark";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Bandeau vermillon, kanji en filigrane, un seul bouton d'action. */
export default function NartyaNote({
  eyebrow = "Note Nartya",
  title,
  actionLabel = "Compris",
  onClose,
  children,
}) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const portalTarget = document.fullscreenElement || document.webkitFullscreenElement || document.body;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 cursor-default bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      <section className="animate-slide-up relative w-full max-w-[26rem] overflow-hidden rounded-xl border border-border bg-surface shadow-[0_28px_90px_-24px_rgba(0,0,0,0.95)] ring-1 ring-white/10">
        <div className="h-[2px] shrink-0 bg-primary/80" />

        <Fox className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 -rotate-6 select-none text-white/[0.04]" />

        <header className="relative px-6 pb-1 pt-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-4 top-4 rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="h-px w-6 bg-primary" />
            <p className="eyebrow">{eyebrow}</p>
          </div>
          <h2 className="mt-3 pr-8 font-display text-xl font-bold tracking-tight">{title}</h2>
        </header>

        <div className="relative px-6 pb-6 pt-3 text-sm leading-relaxed text-text/85">{children}</div>

        <footer className="flex items-center justify-end border-t border-border bg-bg/20 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-shu px-5 py-2.5 text-sm">
            {actionLabel}
          </button>
        </footer>
      </section>
    </div>,
    portalTarget
  );
}
