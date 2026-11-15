/** Choix exclusif à segments égaux : le curseur glisse d'une option à l'autre. */
export default function SegmentedControl({ options, value, onChange, label, className = "" }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`relative grid rounded-lg bg-surface p-1 ring-1 ring-border ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 rounded-md bg-primary shadow-sm transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`relative z-10 flex min-h-9 items-center justify-center gap-1.5 truncate rounded-md px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wide transition-colors ${
              active ? "text-primary-fg" : "text-muted hover:text-text"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
