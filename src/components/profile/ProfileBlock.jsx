/** Module niché dans le panneau unique (`.profile-shell`). */
export default function ProfileBlock({ title, right, className = "", bodyClassName = "", children }) {
  return (
    <section className={`profile-module relative overflow-hidden rounded-md bg-surface-2/50 ${className}`}>
      {title && (
        <div className="flex items-center gap-2 border-b border-border/40 px-3.5 py-2.5">
          <h2 className="section-title !text-lg">{title}</h2>
          {right && <div className="ml-auto">{right}</div>}
        </div>
      )}
      <div className={`p-3.5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
