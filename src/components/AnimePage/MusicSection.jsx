import { useState } from "react";
import { Music2, Play, Pause } from "lucide-react";
import { useCachedResource } from "@/hooks/useCachedResource";
import { getAnimeThemes } from "@/api/animeApi";

function SectionHeader({ title, kana, count }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="shrink-0 font-display text-base font-bold text-text">{title}</h2>
      <span className="shrink-0 font-display text-sm text-muted/60">{kana}</span>
      <span className="text-xs font-medium tabular-nums text-muted">{count}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-border/80 to-transparent" />
    </div>
  );
}

function ThemeRow({ theme, isOpen, onToggle }) {
  return (
    <div
      className={`overflow-hidden rounded-xl ring-1 transition-colors ${
        isOpen ? "bg-surface-2 ring-primary/30" : "bg-surface-2/50 ring-white/[0.06] hover:bg-surface-2/80"
      }`}
    >
      <button type="button" onClick={onToggle} className="group flex w-full items-center gap-3.5 px-4 py-3 text-left">
        <span
          className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg leading-none ${
            theme.type === "OP" ? "bg-primary/12 text-primary" : "bg-white/[0.06] text-text/80"
          }`}
        >
          <span className="text-[0.6rem] font-semibold uppercase tracking-wider opacity-70">{theme.type}</span>
          <span className="mt-0.5 font-display text-sm font-bold">{theme.sequence}</span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{theme.title || "Sans titre"}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {theme.artists.length ? theme.artists.join(", ") : "Artiste inconnu"}
            {theme.episodes && <span className="text-muted/55"> · ép. {theme.episodes}</span>}
          </p>
        </div>

        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
            isOpen ? "bg-primary text-primary-fg" : "bg-white/[0.06] text-muted group-hover:text-text"
          }`}
        >
          {isOpen ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </span>
      </button>

      {isOpen && (
        <video
          key={theme.videoUrl}
          src={theme.videoUrl}
          controls
          autoPlay
          playsInline
          className="aspect-video w-full bg-black"
        />
      )}
    </div>
  );
}

/** AnimeThemes.moe. Un seul thème joué à la fois ; chargé à l'ouverture de l'onglet. */
export function MusicSection({ slug }) {
  const { data, loading } = useCachedResource(
    slug ? `anime-themes:${slug}` : null,
    () => getAnimeThemes(slug),
    30 * 60 * 1000
  );
  const themes = data || [];
  const [openId, setOpenId] = useState(null);

  if (loading && !data) {
    return (
      <div className="space-y-2 px-4 pb-10 pt-6 sm:px-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[4.25rem] skeleton rounded-xl" />
        ))}
      </div>
    );
  }

  if (!themes.length) {
    return (
      <div className="flex min-h-[30dvh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Music2 size={22} strokeWidth={1.8} />
        </span>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Aucun opening ou ending trouvé pour cet anime.
        </p>
      </div>
    );
  }

  const openings = themes.filter((t) => t.type === "OP");
  const endings = themes.filter((t) => t.type === "ED");

  return (
    <div className="space-y-8 px-4 pb-10 pt-6 sm:px-8">
      {openings.length > 0 && (
        <section>
          <SectionHeader title="Openings" kana="開" count={openings.length} />
          <div className="space-y-2">
            {openings.map((theme) => {
              const id = `${theme.type}${theme.sequence}`;
              return (
                <ThemeRow
                  key={id}
                  theme={theme}
                  isOpen={openId === id}
                  onToggle={() => setOpenId(openId === id ? null : id)}
                />
              );
            })}
          </div>
        </section>
      )}

      {endings.length > 0 && (
        <section>
          <SectionHeader title="Endings" kana="終" count={endings.length} />
          <div className="space-y-2">
            {endings.map((theme) => {
              const id = `${theme.type}${theme.sequence}`;
              return (
                <ThemeRow
                  key={id}
                  theme={theme}
                  isOpen={openId === id}
                  onToggle={() => setOpenId(openId === id ? null : id)}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
