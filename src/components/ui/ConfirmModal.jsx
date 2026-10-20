import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Confirmation simple avant une action destructive. Échap ou clic à côté = Annuler. */
export default function ConfirmModal({
  eyebrow,
  title,
  children,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  onConfirm,
  onClose,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onConfirm]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="animate-fade-in-fast relative flex w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]"
      >
        <div className="h-[3px] w-full rounded-t-lg bg-gradient-to-r from-primary via-primary/70 to-transparent" />

        <div className="relative bg-gradient-to-b from-primary/[0.05] to-transparent px-6 pb-5 pt-4">
          <button
            onClick={onClose}
            title="Fermer"
            className="absolute right-4 top-4 text-muted transition-colors hover:text-primary"
          >
            <X size={18} />
          </button>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">{title}</h2>
        </div>

        {children && <div className="px-6 pb-2 text-sm leading-relaxed text-text/90">{children}</div>}

        <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-4">
          <button
            onClick={onClose}
            className="rounded-md px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
