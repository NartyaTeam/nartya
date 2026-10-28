import { Link } from "react-router-dom";
import { FORMAT_LABEL } from "@/utils/anilistLabels";

/**
 * Affiche d'une œuvre AniList. Un anime ouvre sa fiche (résolue vers le catalogue quand il y
 * est) ; un manga lance la recherche de ses scans, faute de fiche AniList côté manga.
 */
export default function WorkCard({ work, caption = null, current = false }) {
  const to =
    work.type === "MANGA"
      ? `/recherche?media=manga&q=${encodeURIComponent(work.title)}`
      : `/anime/${work.id}`;
  const meta = [FORMAT_LABEL[work.format] || work.format, work.year].filter(Boolean).join(" · ");
  return (
    <Link to={to} className="group block" aria-current={current ? "page" : undefined}>
      <div
        className={`relative aspect-[2/3] overflow-hidden rounded-md bg-surface-2 ring-2 transition-colors ${
          current ? "ring-primary" : "ring-border group-hover:ring-primary"
        }`}
      >
        {work.cover ? (
          <img
            src={work.cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full skeleton" />
        )}
        {(caption || current) && (
          <span className="absolute left-1.5 top-1.5 rounded bg-bg/90 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-text ring-1 ring-border">
            {current ? "Tu es ici" : caption}
          </span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-text transition-colors group-hover:text-primary">
        {work.title}
      </h3>
      {meta && <p className="mt-0.5 text-xs text-muted">{meta}</p>}
    </Link>
  );
}
