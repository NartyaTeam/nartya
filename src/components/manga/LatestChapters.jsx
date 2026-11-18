import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";

/** Sorties récentes en liste : le numéro de chapitre compte plus que l'affiche. */
export default function LatestChapters({ title, items }) {
  const list = (items || []).slice(0, 12);
  if (!list.length) return null;

  return (
    <section className="px-4 sm:px-8">
      <h2 className="section-title mb-3">{title}</h2>
      {/* Mobile : carrousel de colonnes de trois, plutôt qu'une longue pile. */}
      <div className="-mx-4 grid snap-x snap-mandatory scroll-px-4 auto-cols-[86%] grid-flow-col grid-rows-3 gap-x-3 gap-y-1 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:grid-rows-none sm:gap-x-6 sm:overflow-visible sm:px-0 xl:grid-cols-3">
        {list.map((m) => (
          <Link
            key={m.slug}
            to={`/anime/${m.slug}?tab=scans`}
            className="group flex snap-start items-center gap-3 rounded-md border-2 border-transparent p-2 transition-colors hover:border-border hover:bg-surface/70"
          >
            <div className="h-20 w-14 shrink-0 overflow-hidden rounded bg-surface-2 ring-2 ring-border">
              {m.cover && <img src={m.cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-semibold text-text transition-colors group-hover:text-primary">
                {m.title}
              </p>
              {m.chapter && (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <BookOpen size={12} /> {m.chapter}
                </p>
              )}
              {m.genres?.length > 0 && (
                <p className="mt-1 line-clamp-1 text-xs text-muted">{m.genres.slice(0, 2).join(" · ")}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
