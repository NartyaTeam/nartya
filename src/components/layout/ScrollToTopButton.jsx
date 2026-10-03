import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

const VISIBILITY_THRESHOLD = 600;

export default function ScrollToTopButton({ scrollContainerRef }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateVisibility = () => {
      setVisible(container.scrollTop >= VISIBILITY_THRESHOLD);
    };

    updateVisibility();
    container.addEventListener("scroll", updateVisibility, { passive: true });
    return () => container.removeEventListener("scroll", updateVisibility);
  }, [scrollContainerRef]);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollContainerRef.current?.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Revenir en haut de la page"
      title="Revenir en haut"
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-primary/35 bg-surface/90 text-primary shadow-[0_12px_30px_-10px_rgba(0,0,0,0.85)] backdrop-blur-md transition-[color,background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary hover:text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:translate-y-0 motion-reduce:animate-none motion-reduce:transition-none md:bottom-6 md:right-6 animate-fade-in-fast"
    >
      <ArrowUp size={20} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
