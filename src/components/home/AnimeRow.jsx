import { useCallback, useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AnimeCard from "./AnimeCard";
import NewEpisodeCard from "./NewEpisodeCard";
import { platform } from "@/platform";

/** `variant="episode"` : cartes « nouvel épisode ». */
export default function AnimeRow({ title, kana, items, numbered = false, variant }) {
  const [emblaRef, embla] = useEmblaCarousel({
    active: !platform.isMobile,
    dragFree: true,
    containScroll: "trimSnaps",
    align: "start",
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  // Par slug, pas par id : deux saisons AniList peuvent partager le même slug.
  const uniqueItems = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const a of items || []) {
      const key = variant === "episode" ? `${a.slug}-${a.season}` : a.slug ?? a.id;
      if (key == null || seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    return out;
  }, [items, variant]);

  const onSelect = useCallback(() => {
    if (!embla) return;
    setCanPrev(embla.canScrollPrev());
    setCanNext(embla.canScrollNext());
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    onSelect();
    embla.on("select", onSelect);
    embla.on("reInit", onSelect);
    return () => {
      embla.off("select", onSelect);
      embla.off("reInit", onSelect);
    };
  }, [embla, onSelect]);

  return (
    <section className="carousel-section relative">
      <div className="mb-3 flex items-center justify-between px-4 sm:px-8">
        <h2 className="section-title">
          {title}
        </h2>
        <div className="hidden gap-1 md:flex">
          <button
            onClick={() => embla?.scrollPrev()}
            disabled={!canPrev}
            className="flex h-8 w-8 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.06] hover:text-text disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => embla?.scrollNext()}
            disabled={!canNext}
            className="flex h-8 w-8 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.06] hover:text-text disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="select-none overflow-hidden px-4 sm:px-8" ref={emblaRef} data-carousel-viewport>
        <div className="flex gap-4" data-carousel-track>
          {uniqueItems.map((anime, i) => (
            <div
              key={variant === "episode" ? `${anime.slug}-${anime.season}` : anime.id}
              className="min-w-0 shrink-0 grow-0 basis-[148px] sm:basis-[160px]"
              data-carousel-card
            >
              {variant === "episode" ? (
                <NewEpisodeCard anime={anime} />
              ) : (
                <AnimeCard
                  anime={anime}
                  index={numbered ? i : undefined}
                  openScans={variant === "manga"}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AnimeRowSkeleton() {
  return (
    <section>
      <div className="mb-3 px-4 sm:px-8">
        <div className="skeleton h-6 w-40 rounded" />
      </div>
      <div className="flex gap-4 px-4 sm:px-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] w-[148px] shrink-0 skeleton" />
        ))}
      </div>
    </section>
  );
}
