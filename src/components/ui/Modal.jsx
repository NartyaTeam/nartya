import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const WIDTHS = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" };

/**
 * Fenêtre modale du design system : filet corail, sur-titre, titre, corps et pied d'actions.
 * Échap et le clic à côté ferment, sauf si `dismissible` est faux (action en cours).
 */
export function Modal({ eyebrow, title, children, footer, onClose, size = "md", dismissible = true, className = "" }) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && dismissible && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, dismissible]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => dismissible && onClose?.()} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`animate-fade-in-fast relative flex max-h-[calc(100dvh-2rem)] w-full ${WIDTHS[size] || WIDTHS.md} flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] ${className}`}
      >
        <div className="h-[3px] w-full shrink-0 bg-gradient-to-r from-primary via-primary/70 to-transparent" />

        {(eyebrow || title) && (
          <div className="relative shrink-0 bg-gradient-to-b from-primary/[0.05] to-transparent px-6 pb-5 pt-4 pr-12">
            {onClose && (
              <button
                onClick={onClose}
                disabled={!dismissible}
                title="Fermer"
                aria-label="Fermer"
                className="absolute right-4 top-4 rounded-md text-muted transition-colors hover:text-primary disabled:opacity-40"
              >
                <X size={18} />
              </button>
            )}
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && (
              <h2 id={titleId} className="mt-1 font-display text-2xl font-bold tracking-tight">
                {title}
              </h2>
            )}
          </div>
        )}

        {children && <div className="min-h-0 overflow-y-auto px-6 pb-2 text-sm leading-relaxed text-text/90">{children}</div>}

        {footer && <div className="flex shrink-0 items-center justify-end gap-2 px-6 pb-5 pt-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
