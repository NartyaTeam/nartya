import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border-2 transition-colors active:scale-95 ${
        checked ? "border-primary bg-primary" : "border-border bg-surface-2"
      }`}
    >
      <span
        className={`absolute left-1 top-1 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

const TOOLTIP_WIDTH = 256;
const TOOLTIP_MARGIN = 12;

/**
 * Au survol, au focus clavier et au toucher. Dans un portail : les blocs de réglages coupent
 * ce qui déborde de leurs coins arrondis.
 */
function HelpHint({ label, children }) {
  const tooltipId = useId();
  const buttonRef = useRef(null);
  const tooltipRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);

  const place = useCallback(() => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = Math.min(TOOLTIP_WIDTH, window.innerWidth - TOOLTIP_MARGIN * 2);
    const left = Math.min(
      Math.max(anchor.left, TOOLTIP_MARGIN),
      window.innerWidth - width - TOOLTIP_MARGIN,
    );
    const height = tooltipRef.current?.offsetHeight || 0;
    const below = anchor.bottom + 8;
    const top =
      height && below + height > window.innerHeight - TOOLTIP_MARGIN
        ? Math.max(anchor.top - 8 - height, TOOLTIP_MARGIN)
        : below;
    setPosition({ top, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    // Une fois la hauteur connue, pour basculer au-dessus si besoin.
    const frame = requestAnimationFrame(place);
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, place]);

  return (
    <span className="inline-flex shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`En savoir plus sur ${label}`}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        className="grid h-5 w-5 place-items-center rounded-full text-muted/55 transition-colors hover:bg-white/[0.06] hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/70"
      >
        <CircleHelp size={13} />
      </button>
      {open &&
        createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            style={position ? { top: position.top, left: position.left, width: position.width } : { visibility: "hidden" }}
            className="pointer-events-none fixed z-[200] rounded-md border border-border bg-surface-2 px-3 py-2.5 text-left text-[0.7rem] font-normal leading-5 text-muted shadow-xl"
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}

export function SettingRow({ icon: Icon, label, description, details, inlineControl = false, children }) {
  return (
    <div
      className={`relative grid gap-3 border-t border-border/45 py-4 first:border-t-0 md:gap-5 md:py-6 md:grid-cols-[minmax(0,1fr)_minmax(220px,360px)] md:items-center ${
        inlineControl ? "pr-16 md:pr-0" : ""
      }`}
    >
      <div className="flex min-w-0 gap-3 md:gap-4">
        {Icon && (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-primary md:rounded-[5px] md:bg-white/[0.045]">
            <Icon size={16} />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-text">{label}</p>
            {details && <HelpHint label={label}>{details}</HelpHint>}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-[0.7rem] leading-[1.15rem] text-muted md:mt-1.5 md:text-xs md:leading-5">{description}</p>
          )}
        </div>
      </div>
      <div
        className={`shrink-0 md:static md:justify-self-end ${
          inlineControl
            ? "absolute right-0 top-4"
            : "justify-self-end pl-12 md:pl-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function Section({ id, number, eyebrow, title, description, children }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-40 md:scroll-mt-24 md:border-t md:border-border/70 md:pt-8">
      <header className="grid gap-2 px-1 pb-3 md:grid-cols-[64px_minmax(0,1fr)] md:gap-4 md:px-0 md:pb-7">
        <span className="hidden font-impact text-4xl tabular-nums text-primary/25 md:block">
          {number}
        </span>
        <div>
          <p className="hidden text-[0.6rem] font-bold uppercase tracking-[0.24em] text-primary md:block">
            {eyebrow}
          </p>
          <h2 className="t-impact text-2xl text-text md:mt-2 md:text-3xl">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-[0.7rem] leading-[1.15rem] text-muted md:mt-2 md:text-sm md:leading-6">{description}</p>
          )}
        </div>
      </header>
      <div className="overflow-hidden rounded-md border-2 border-border bg-surface/45 px-4 md:ml-16 md:bg-surface/35 md:px-6">
        {children}
      </div>
    </section>
  );
}
