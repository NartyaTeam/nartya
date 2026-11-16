import { useNavigate } from "react-router-dom";
import { useRowCarousel, RowArrows } from "./useRowCarousel";
import { getGenreCards } from "@/api/animeApi";
import { useCachedResource } from "@/hooks/useCachedResource";

export default function GenresRow() {
  const { data } = useCachedResource("home:genre-cards", getGenreCards, 30 * 60 * 1000);
  const navigate = useNavigate();
  const { emblaRef, embla, canPrev, canNext } = useRowCarousel();

  const genres = data || [];
  if (!genres.length) return null;

  return (
    <section className="carousel-section relative pt-6">
      <div className="mb-3 flex items-center justify-between px-4 sm:px-8">
        <h2 className="section-title">

          Genres
        </h2>
        <RowArrows embla={embla} canPrev={canPrev} canNext={canNext} />
      </div>

      <div className="select-none overflow-hidden px-4 sm:px-8" ref={emblaRef} data-carousel-viewport>
        <div className="flex gap-4" data-carousel-track>
          {genres.map((g) => (
            <button
              key={g.genre}
              onClick={() => navigate(`/genre/${encodeURIComponent(g.genre)}`)}
              className="group min-w-0 shrink-0 grow-0 basis-[200px] transition-transform active:scale-[0.98] sm:basis-[230px] md:active:scale-100"
              data-carousel-card
            >
              <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-2">
                {g.image ? (
                  <img
                    src={g.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover opacity-70 transition-transform duration-300 ease-out group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full skeleton" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-3 text-left font-display text-lg font-bold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.85)] transition-colors group-hover:text-primary">
                  {g.genre}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
