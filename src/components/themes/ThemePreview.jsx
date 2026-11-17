/** Maquette miniature d'un thème : aucune variable globale touchée, tout passe par les couleurs du thème. */
export default function ThemePreview({ colors, className = "" }) {
  const c = colors;
  return (
    <div
      className={`flex aspect-[16/10] w-full overflow-hidden rounded-md ${className}`}
      style={{ backgroundColor: c.bg, color: c.text, boxShadow: `inset 0 0 0 1px ${c.border}` }}
      aria-hidden="true"
    >
      <div className="flex w-[18%] flex-col gap-1.5 p-2" style={{ backgroundColor: c.bg2, borderRight: `1px solid ${c.border}` }}>
        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: c.primary }} />
        <span className="mt-1 h-1 w-full rounded-full" style={{ backgroundColor: c.surface2 }} />
        <span className="h-1 w-3/4 rounded-full" style={{ backgroundColor: c.surface2 }} />
        <span className="h-1 w-4/5 rounded-full" style={{ backgroundColor: c.surface2 }} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5">
        <span className="h-1.5 w-1/2 rounded-full" style={{ backgroundColor: c.text }} />
        <span className="h-1 w-1/3 rounded-full" style={{ backgroundColor: c.muted }} />
        <div className="mt-1 grid flex-1 grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-sm"
              style={{ backgroundColor: i === 1 ? c.surface2 : c.surface, boxShadow: `inset 0 0 0 1px ${c.border}` }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-10 rounded-sm" style={{ backgroundColor: c.primary }} />
          <span className="h-3 w-6 rounded-sm" style={{ backgroundColor: c.accent }} />
          <span className="h-3 w-4 rounded-sm" style={{ backgroundColor: c.sakura }} />
        </div>
      </div>
    </div>
  );
}
