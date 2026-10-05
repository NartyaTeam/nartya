import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Play, Info, Star } from "lucide-react";
import { clipTitle, titleSizeClass } from "@/utils/displayTitle";
import AnimeLogo, { isClearLogoUrl } from "@/components/anime/AnimeLogo";

const AUTOPLAY_MS = 8000;

/** Se remplit en AUTOPLAY_MS ; `key` la relance à chaque slide, `paused` la fige (survol, onglet masqué). */
function ProgressFill({ paused }) {
  return (
    <span
      aria-hidden
      className="hero-progress absolute inset-0 origin-left rounded-full bg-primary"
      style={{ animationDuration: `${AUTOPLAY_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
    />
  );
}

/** Les vignettes sont dans le slide, pour que tout glisse ensemble. */
function HeroSlide({ anime, contentType, isActive, shouldLoad, onOpen, onPrimary }) {
  const bg = anime.fanart || anime.banner || anime.cover;
  const clearLogo = isClearLogoUrl(anime.clearLogo) ? anime.clearLogo : null;
  const isManga = contentType === "manga";

  return (
    <div
      className={`relative -mx-px h-full min-w-0 flex-[0_0_calc(100%+2px)] overflow-hidden md:mx-0 md:flex-[0_0_100%] ${
        isActive ? "z-[1]" : "z-0"
      }`}
    >
      <div className="absolute inset-0 bg-surface">
        {bg && shouldLoad ? (
          <img
            src={bg}
            alt=""
            aria-hidden="true"
            loading={isActive ? "eager" : "lazy"}
            fetchpriority={isActive ? "high" : "low"}
            decoding="async"
            className="h-full w-full object-cover object-center"
          />
        ) : null}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent md:via-bg/35" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/30 to-transparent md:from-bg/95 md:via-bg/40" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 to-transparent md:from-bg/60" />

      <div className="slash-rule absolute inset-x-0 bottom-0 z-[2] hidden md:block" />
      <div className="absolute inset-0 flex items-end">
        <div
          className={`mx-auto w-full max-w-2xl px-5 pb-6 text-center md:mx-0 md:px-14 md:pb-20 md:text-left ${
            isActive ? "animate-slide-up" : "opacity-0"
          }`}
        >
          <p className="mb-3 flex items-center justify-center gap-2.5 text-[0.65rem] font-bold uppercase tracking-[0.25em] text-white/65 md:mb-4 md:justify-start md:text-[0.7rem] md:text-muted">
            <span className="h-3.5 w-[6px] -skew-x-[14deg] bg-primary" />
            {isManga ? "Manga à la une" : "À la une"}
          </p>

          {clearLogo && shouldLoad ? (
            <AnimeLogo
              src={clearLogo}
              alt={anime.title}
              loading={isActive ? "eager" : "lazy"}
              fetchpriority={isActive ? "high" : "low"}
              decoding="async"
              className="mx-auto mb-4 h-20 w-[75%] md:mx-0 md:mb-5 md:h-32 md:w-[70%]"
              imageClassName="origin-center object-center md:origin-left md:object-left"
            />
          ) : (
            <h1
              className={`mb-4 block max-w-full break-words leading-[1.05] t-impact [filter:drop-shadow(0_2px_14px_rgb(0_0_0/0.75))] md:mb-6 ${titleSizeClass(anime.title)}`}
            >
              {clipTitle(anime.title)}
            </h1>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-white/70 md:mb-4 md:justify-start md:gap-x-4 md:gap-y-2 md:text-sm md:text-muted">
            {anime.score != null && (
              <span className="flex items-center gap-1 font-semibold text-accent">
                <Star size={14} className="fill-accent" />
                {anime.score.toFixed(1)}
              </span>
            )}
            {anime.year && <span>{anime.year}</span>}
            {anime.format && <span className="uppercase">{anime.format}</span>}
            {anime.episodes && <span>{anime.episodes} ép.</span>}
            {isManga && anime.chapters && <span>{anime.chapters} chap.</span>}
            {isManga && anime.volumes && <span>{anime.volumes} vol.</span>}
            <span className="flex gap-2">
              {anime.genres?.slice(0, 3).map((g) => (
                <span key={g} className="rounded bg-white/[0.08] px-2.5 py-0.5 text-xs text-text">
                  {g}
                </span>
              ))}
            </span>
          </div>

          <p className={`mx-auto mb-4 line-clamp-2 max-w-xl text-xs leading-relaxed text-white/65 md:mx-0 md:mb-6 md:line-clamp-3 md:text-sm md:text-muted ${
            isManga ? "hidden md:block" : ""
          }`}>
            {anime.description}
          </p>

          <div className="flex items-center gap-2.5 md:gap-3">
            <button onClick={onPrimary} className="btn-shu h-11 min-w-0 flex-1 px-4 py-0 text-sm sm:flex-none md:h-auto md:px-6 md:py-3 md:text-base">
              {isManga ? <BookOpen size={18} /> : <Play size={18} className="fill-current" />}
              {isManga ? "Lire" : "Regarder"}
            </button>
            <button onClick={onOpen} className="btn-ghost h-11 min-w-0 flex-1 px-4 py-0 text-sm sm:flex-none md:h-auto md:px-6 md:py-3 md:text-base">
              <Info size={18} />
              Détails
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HeroCarousel({ items, contentType = "anime" }) {
  const navigate = useNavigate();
  const [emblaRef, embla] = useEmblaCarousel({ loop: true, duration: 30 });
  const [selected, setSelected] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const rootRef = useRef(null);
  const remainingRef = useRef(null);
  const lastSelectedRef = useRef(null);
  const paused = hovering || tabHidden || !isVisible;

  const slides = useMemo(() => {
    const seen = new Set();
    return (items || []).filter((a) => {
      const key = a.slug ?? a.id;
      if (key == null || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [items]);

  const onSelect = useCallback(() => {
    if (embla) setSelected(embla.selectedScrollSnap());
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    onSelect();
    embla.on("select", onSelect);
    return () => embla.off("select", onSelect);
  }, [embla, onSelect]);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.visibilityState !== "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // La barre de progression et la minuterie partagent `selected` et `paused` : elles restent calées.
  useEffect(() => {
    if (lastSelectedRef.current !== selected) {
      lastSelectedRef.current = selected;
      remainingRef.current = null;
    }
    if (!embla || paused) return;
    const remaining = remainingRef.current ?? AUTOPLAY_MS;
    const startedAt = Date.now();
    const id = setTimeout(() => {
      remainingRef.current = null;
      embla.scrollNext();
    }, remaining);
    return () => {
      clearTimeout(id);
      remainingRef.current = Math.max(0, remaining - (Date.now() - startedAt));
    };
  }, [embla, selected, paused]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "120px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!slides.length) return null;

  return (
    <div
      ref={rootRef}
      className="relative w-full px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:h-[70vh] md:min-h-[500px] md:px-0 md:pt-0"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className={`relative overflow-hidden rounded-lg border-2 border-border bg-surface shadow-card md:h-full md:min-h-0 md:max-h-none md:rounded-none md:border-0 md:shadow-none ${
        contentType === "manga"
          ? "h-[48svh] min-h-[26rem] max-h-[30rem]"
          : "h-[53svh] min-h-[29rem] max-h-[33rem]"
      }`}>
        <div className="isolate h-full select-none overflow-hidden" ref={emblaRef} data-carousel-viewport data-carousel-hero>
          <div className="flex h-full" data-carousel-track>
            {slides.map((anime, i) => (
              <HeroSlide
                key={anime.id}
                anime={anime}
                contentType={contentType}
                isActive={i === selected}
                shouldLoad={
                  i === selected ||
                  i === (selected + 1) % slides.length ||
                  i === (selected - 1 + slides.length) % slides.length
                }
                onOpen={() =>
                  navigate(`/anime/${anime.slug}${contentType === "manga" ? "?tab=scans" : ""}`)
                }
                onPrimary={() =>
                  navigate(
                    contentType === "manga"
                      ? `/anime/${anime.slug}?tab=scans`
                      : `/watch/${anime.slug}`
                  )
                }
              />
            ))}
          </div>
        </div>

        <div className="absolute right-4 top-4 z-10 flex gap-1.5 md:hidden">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => embla?.scrollTo(i)}
              aria-label={`Afficher le spotlight ${i + 1}`}
              className={`relative h-1 overflow-hidden rounded-full shadow-sm transition-all duration-300 ${
                i === selected ? "w-8 bg-white/35" : "w-2.5 bg-white/35"
              }`}
            >
              {i === selected && <ProgressFill key={selected} paused={paused} />}
            </button>
          ))}
        </div>

        <div className="absolute bottom-8 right-8 z-10 hidden items-center gap-4 md:flex">
          <span className="font-display text-sm font-bold text-text">
            {String(selected + 1).padStart(2, "0")}
          </span>
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => embla?.scrollTo(i)}
                aria-label={`Afficher le spotlight ${i + 1}`}
                className={`relative h-1 overflow-hidden rounded-full transition-all duration-300 ${
                  i === selected ? "w-10 bg-white/25" : "w-3 bg-white/25 hover:bg-white/50"
                }`}
              >
                {i === selected && <ProgressFill key={selected} paused={paused} />}
              </button>
            ))}
          </div>
          <span className="font-display text-sm font-bold text-muted">
            {String(slides.length).padStart(2, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}
