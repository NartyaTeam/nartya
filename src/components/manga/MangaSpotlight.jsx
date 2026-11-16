import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Info, Star } from "lucide-react";
import { clipTitle } from "@/utils/displayTitle";

const AUTOPLAY_MS = 7000;

const ORIGIN_LABEL = { JP: "Manga", KR: "Manhwa", CN: "Manhua", TW: "Manhua" };
const STATUS_LABEL = {
  RELEASING: "En cours",
  FINISHED: "Terminé",
  HIATUS: "En pause",
  CANCELLED: "Arrêté",
  NOT_YET_RELEASED: "À venir",
};

/** À la une : une œuvre en grand, les autres en vignettes sous la fiche. */
export default function MangaSpotlight({ items }) {
  const navigate = useNavigate();
  const slides = useMemo(() => {
    const seen = new Set();
    return (items || []).filter((a) => {
      if (!a.slug || seen.has(a.slug)) return false;
      seen.add(a.slug);
      return true;
    });
  }, [items]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length < 2) return undefined;
    const t = setTimeout(() => setIndex((i) => (i + 1) % slides.length), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [index, paused, slides.length]);

  if (!slides.length) return null;
  const manga = slides[index % slides.length];
  const bg = manga.banner || manga.cover;
  const kind = ORIGIN_LABEL[manga.countryOfOrigin] || "Manga";
  const open = () => navigate(`/anime/${manga.slug}?tab=scans`);

  return (
    <section
      className="px-4 pt-4 sm:px-8 md:pt-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded-lg border-2 border-border bg-surface">
        {bg && (
          <img
            key={`bg-${manga.slug}`}
            src={bg}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full animate-fade-in object-cover opacity-40 blur-sm md:blur-0"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg/80 to-transparent" />

        <div
          key={manga.slug}
          className="relative flex animate-fade-in items-center gap-8 px-5 py-7 md:min-h-[24rem] md:px-12 md:py-10"
        >
          <div className="min-w-0 flex-1">
            <p className="mb-3 flex items-center gap-2.5 text-[0.7rem] font-bold uppercase tracking-[0.25em] text-muted">
              <span className="h-3.5 w-[6px] -skew-x-[14deg] bg-primary" />
              À la une · {kind}
            </p>
            <h1 className="mb-4 max-w-2xl break-words text-4xl leading-[1.05] t-impact md:text-6xl">
              {clipTitle(manga.title)}
            </h1>

            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              {manga.score != null && (
                <span className="flex items-center gap-1 font-semibold text-accent">
                  <Star size={14} className="fill-accent" />
                  {Number(manga.score).toFixed(1)}
                </span>
              )}
              {STATUS_LABEL[manga.status] && <span>{STATUS_LABEL[manga.status]}</span>}
              {manga.chapters && <span>{manga.chapters} chap.</span>}
              {manga.genres?.slice(0, 3).map((g) => (
                <span key={g} className="rounded bg-white/[0.08] px-2.5 py-0.5 text-xs text-text">
                  {g}
                </span>
              ))}
            </div>

            <p className="mb-6 line-clamp-3 max-w-xl text-sm leading-relaxed text-muted">{manga.description}</p>

            <div className="flex items-center gap-3">
              <button onClick={open} className="btn-shu">
                <BookOpen size={18} /> Lire
              </button>
              <button onClick={open} className="btn-ghost">
                <Info size={18} /> Détails
              </button>
            </div>
          </div>

          {manga.cover && (
            <img
              src={manga.cover}
              alt=""
              className="hidden aspect-[2/3] w-52 shrink-0 rounded-md object-cover shadow-card ring-2 ring-border md:block lg:w-60"
            />
          )}
        </div>

        {slides.length > 1 && (
          <div className="relative flex gap-2 overflow-x-auto border-t border-border/70 bg-bg/60 px-5 py-3 no-scrollbar md:px-12">
            {slides.map((s, i) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={s.title}
                aria-current={i === index}
                className={`relative h-16 w-11 shrink-0 overflow-hidden rounded ring-2 transition-all ${
                  i === index ? "ring-primary" : "opacity-55 ring-transparent hover:opacity-100"
                }`}
              >
                {s.cover && <img src={s.cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
