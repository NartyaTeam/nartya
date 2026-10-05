import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, Eye, EyeOff, Flag, MoreHorizontal } from "lucide-react";

function Row({ icon: Icon, label, hint, active = false, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded px-2.5 py-2 text-left text-sm text-text transition-colors hover:bg-primary hover:text-primary-fg"
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {hint && <span className="block truncate text-xs opacity-70">{hint}</span>}
      </span>
      {active && <span className="h-2 w-2 shrink-0 rounded-full bg-primary ring-2 ring-surface" />}
    </button>
  );
}

/** Réglages de liste rarement touchés, regroupés derrière un seul bouton. */
export function SeasonActionsMenu({
  reversed,
  onToggleReversed,
  spoilerMode,
  onToggleSpoiler,
  onReport,
  controlH = "h-10",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn) => () => {
    fn();
    setOpen(false);
  };

  const modified = reversed || spoilerMode;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Actions"
        aria-label="Actions"
        aria-expanded={open}
        className={`relative flex ${controlH} items-center gap-2 rounded-md bg-surface px-3 text-sm font-bold text-text ring-2 ring-border transition-colors hover:bg-surface-2 ${
          open ? "ring-primary/60" : ""
        }`}
      >
        <MoreHorizontal size={18} />
        <span className="hidden lg:inline">Actions</span>
        {modified && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-bg" />}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-72 rounded-md border-2 border-border bg-surface p-1 shadow-card">
          <Row
            icon={ArrowDownUp}
            label="Inverser l'ordre"
            hint={reversed ? "Actuel : du plus récent au plus ancien" : "Actuel : du plus ancien au plus récent"}
            active={reversed}
            onClick={run(onToggleReversed)}
          />
          <Row
            icon={spoilerMode ? EyeOff : Eye}
            label={spoilerMode ? "Afficher les vignettes" : "Flouter les vignettes"}
            hint="Mode anti-spoil"
            active={spoilerMode}
            onClick={run(onToggleSpoiler)}
          />
          {onReport && (
            <>
              <div className="mx-2 my-1 h-px bg-border" />
              <Row icon={Flag} label="Signaler un problème" hint="Épisode décalé, manquant, mauvaise vidéo…" onClick={run(onReport)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
