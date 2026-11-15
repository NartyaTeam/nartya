import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Bouton de filtre à panneau libre (choix multiples, listes longues). Même gabarit que `Select` :
 * un compteur et une teinte disent qu'il filtre. Le panneau se ferme au clic dehors et sur Échap.
 */
export default function FilterPopover({ label, count = 0, align = "start", panelClassName = "", children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filtering = count > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-11 items-center gap-2 rounded-md pl-3.5 pr-3 text-sm font-medium outline-none ring-2 transition-colors focus-visible:ring-primary/60 md:h-10 ${
          filtering
            ? "bg-primary/10 text-text ring-primary/45 hover:bg-primary/15"
            : "bg-surface text-muted ring-border hover:bg-surface-2"
        } ${open ? "ring-primary/60" : ""}`}
      >
        <span className={filtering ? "text-text/60" : ""}>{label}</span>
        {filtering && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.65rem] font-bold tabular-nums text-primary-fg">
            {count}
          </span>
        )}
        <ChevronDown size={15} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={`absolute top-full z-50 mt-1.5 max-h-[min(70vh,32rem)] overflow-y-auto rounded-md border border-border bg-surface p-4 shadow-card ring-1 ring-black/40 animate-fade-in-fast ${
            align === "end" ? "right-0" : "left-0"
          } ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
