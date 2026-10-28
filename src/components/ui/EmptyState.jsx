/**
 * Écran vide d'une liste : icône, titre, explication et une action pour en sortir.
 * `compact` pour un filtre sans résultat à l'intérieur d'une page déjà remplie.
 */
export function EmptyState({ icon: Icon, title, description, action, compact = false, className = "" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed border-border px-7 text-center ${
        compact ? "min-h-56 py-10" : "min-h-[45dvh] py-14"
      } ${className}`}
    >
      {Icon && (
        <span
          className={`flex items-center justify-center rounded-full bg-primary/10 text-primary ${
            compact ? "h-11 w-11" : "h-14 w-14"
          }`}
        >
          <Icon size={compact ? 20 : 24} strokeWidth={1.8} />
        </span>
      )}
      {title && <p className={`mt-4 font-display font-bold text-text ${compact ? "text-base" : "text-lg"}`}>{title}</p>}
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default EmptyState;
