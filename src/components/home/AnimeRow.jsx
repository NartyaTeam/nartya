import { useMemo } from "react";
import { useRowCarousel, RowArrows } from "./useRowCarousel";
import AnimeCard from "./AnimeCard";
import NewEpisodeCard from "./NewEpisodeCard";

/** `variant="episode"` : cartes « nouvel épisode ». */
const itemKey = (a, variant) => (variant === "episode" ? `${a.slug}-${a.season}` : a.slug ?? a.id);

export default function AnimeRow({ title, items, numbered = false, variant }) {
  const { emblaRef, embla, canPrev, canNext } = useRowCarousel();

  // Par slug, pas par id : deux saisons AniList peuvent partager le même slug.
  const uniqueItems = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const a of items || []) {
      const key = itemKey(a, variant);
      if (key == null || seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    return out;
  }, [items, variant]);

  return (
    <section className="carousel-section relative">
      <div className="mb-3 flex items-center justify-between px-4 sm:px-8">
        <h2 className="section-title">
          {title}
        </h2>
        <RowArrows embla={embla} canPrev={canPrev} canNext={canNext} />
      </div>

      <div className="select-none overflow-hidden px-4 sm:px-8" ref={emblaRef} data-carousel-viewport>
        <div className="flex gap-4" data-carousel-track>
          {uniqueItems.map((anime, i) => (
            <div
              key={itemKey(anime, variant)}
              className="min-w-0 shrink-0 grow-0 basis-[9.25rem] sm:basis-[10rem] lg:basis-[10.75rem] 2xl:basis-[11.5rem]"
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
          <div key={i} className="aspect-[2/3] w-[9.25rem] shrink-0 skeleton sm:w-[10rem] lg:w-[10.75rem] 2xl:w-[11.5rem]" />
        ))}
      </div>
    </section>
  );
}
