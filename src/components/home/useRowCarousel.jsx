import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { platform } from "@/platform";

/** Carousel de rangée : défilement libre (desktop seulement) et état des flèches. */
export function useRowCarousel() {
  const [emblaRef, embla] = useEmblaCarousel({
    active: !platform.isMobile,
    dragFree: true,
    containScroll: "trimSnaps",
    align: "start",
  });
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

  return { emblaRef, embla, canPrev, canNext };
}

const ARROW_CLASS =
  "flex h-8 w-8 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.06] hover:text-text disabled:pointer-events-none disabled:opacity-25";

export function RowArrows({ embla, canPrev, canNext }) {
  return (
    <div className="hidden gap-1 md:flex">
      <button onClick={() => embla?.scrollPrev()} disabled={!canPrev} className={ARROW_CLASS}>
        <ChevronLeft size={18} />
      </button>
      <button onClick={() => embla?.scrollNext()} disabled={!canNext} className={ARROW_CLASS}>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
