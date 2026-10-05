import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AnimeCard from "./AnimeCard";
import { platform } from "@/platform";

export default function TopTenRow({ title, kana, items }) {
  const top = (items || []).slice(0, 10);
  const [emblaRef, embla] = useEmblaCarousel({ active: !platform.isMobile, dragFree: true, containScroll: "trimSnaps", align: "start" });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

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

  if (top.length === 0) return null;

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
              <div className="-ml-3 w-[140px] lg:w-[150px]">
                <AnimeCard anime={anime} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
