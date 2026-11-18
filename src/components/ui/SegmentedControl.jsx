import { useLayoutEffect, useRef, useState } from "react";

const SIZES = {
  md: "h-11 text-[0.8rem] md:h-10",
  sm: "h-9 text-xs md:h-8",
};

/**
 * Choix exclusif : le curseur glisse sous l'option active et épouse sa largeur réelle.
 * Options : { value, label, Icon?, count? }. Par défaut le bloc épouse son contenu ; une largeur
 * posée par `className` (w-full, sm:w-72…) répartit l'espace restant à parts égales.
 */
export default function SegmentedControl({
  options,
  value,
  onChange,
  label,
  size = "md",
  className = "",
}) {
  const rootRef = useRef(null);
  const [thumb, setThumb] = useState(null);
  // Le premier placement ne s'anime pas : le curseur ne vient pas de la gauche au montage.
  const [ready, setReady] = useState(false);
  const optionsKey = options.map((option) => option.value).join("|");

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const measure = () => {
      const active = root.querySelector('[aria-checked="true"]');
      setThumb(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll("button").forEach((button) => observer.observe(button));
    document.fonts?.ready.then(measure);
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, optionsKey]);

  // Flèches : la sélection suit le focus, comme un groupe de boutons radio natif.
  function handleKeyDown(event) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = options.findIndex((option) => option.value === value);
    const next = options[(current + step + options.length) % options.length];
    onChange(next.value);
    rootRef.current?.querySelectorAll("button")[options.indexOf(next)]?.focus();
  }

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={`relative flex w-full max-w-full items-stretch sm:w-fit rounded-md bg-surface p-1 ring-2 ring-border ${SIZES[size] || SIZES.md} ${className}`}
    >
      {thumb && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-1 rounded-[0.3rem] bg-primary shadow-[0_2px_0_color-mix(in_srgb,rgb(var(--primary))_55%,black)] ${
            ready ? "transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" : ""
          }`}
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
      {options.map(({ value: optionValue, label: text, Icon, count }) => {
        const active = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(optionValue)}
            className={`relative z-10 flex min-w-0 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded px-3.5 font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface ${
              active ? "text-primary-fg" : "text-muted hover:text-text"
            }`}
          >
            {Icon && <Icon size={14} className="shrink-0" />}
            <span className="truncate">{text}</span>
            {count != null && <span className="tabular-nums opacity-70">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
