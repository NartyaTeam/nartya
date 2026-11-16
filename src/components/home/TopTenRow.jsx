import { useRowCarousel, RowArrows } from "./useRowCarousel";
import AnimeCard from "./AnimeCard";

export default function TopTenRow({ title, items, openScans = false }) {
  const top = (items || []).slice(0, 10);
  const { emblaRef, embla, canPrev, canNext } = useRowCarousel();

  if (top.length === 0) return null;

  return (
    <section className="carousel-section relative">
      <div className="mb-3 flex items-center justify-between px-4 sm:px-8">
        <h2 className="section-title">
          {title}
        </h2>
        <RowArrows embla={embla} canPrev={canPrev} canNext={canNext} />
      </div>

      <div className="select-none overflow-hidden px-4 sm:px-8" ref={emblaRef} data-carousel-viewport>
        <div className="flex gap-3" data-carousel-track>
          {top.map((anime, i) => (
            <div key={anime.id} className="flex shrink-0 grow-0 items-end" data-carousel-card>
              <span
                aria-hidden="true"
                className="pointer-events-none inline-block -skew-x-[8deg] select-none font-impact leading-[0.8] text-transparent text-[7rem] lg:text-[8.5rem]"
                style={{ WebkitTextStroke: "2px rgb(var(--primary) / 0.55)" }}
              >
                {i + 1}
              </span>
              <div className="-ml-3 w-[8.75rem] lg:w-[9.5rem] 2xl:w-[10.5rem]">
                <AnimeCard anime={anime} openScans={openScans} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
