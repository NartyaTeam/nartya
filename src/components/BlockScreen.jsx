
/**
 * Coquille des écrans bloquants (ban, mise à jour requise). `actions` doit toujours mener
 * quelque part.
 */
export default function BlockScreen({
  eyebrow,
  title,
  description,
  children,
  actions,
  footnote,
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-bg px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 0%, rgb(var(--primary) / 0.08), transparent 65%)",
        }}
      />

      <div className="relative flex w-full max-w-md flex-col items-center gap-8 text-center">
        <Fox className="h-16 w-16 text-primary" />

        <div className="space-y-3">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="t-impact text-4xl text-text">
            {title}
          </h1>
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        </div>

        {children}

        {actions && (
          <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>
        )}

        {footnote && <p className="text-xs leading-relaxed text-muted/70">{footnote}</p>}
      </div>
    </div>
  );
}
