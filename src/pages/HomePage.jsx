import { useEffect, useRef, useState } from "react";
import { getHomeSections } from "@/api/animeApi";
import { useCachedResource } from "@/hooks/useCachedResource";
import HeroCarousel from "@/components/home/HeroCarousel";
import AnimeRow, { AnimeRowSkeleton } from "@/components/home/AnimeRow";
import TopTenRow from "@/components/home/TopTenRow";
import ContinueWatching from "@/components/home/ContinueWatching";
import ForYouRow from "@/components/home/ForYouRow";
import GenresRow from "@/components/home/GenresRow";
import CommunityBanner from "@/components/home/CommunityBanner";
import { asset } from "@/lib/asset";
import { platform } from "@/platform";

/**
 * Montée à l'approche de l'écran, jamais démontée : un montage au fil du scroll ferait
 * scintiller les rangées.
 */
function DeferredHomeSection({ children, height = 320 }) {
  const anchorRef = useRef(null);
  const [mounted, setMounted] = useState(!platform.isMobile);

  useEffect(() => {
    if (!platform.isMobile || mounted) return;
    const node = anchorRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setMounted(true);
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted]);

  return (
    <div
      ref={anchorRef}
      style={mounted ? undefined : { height }}
      aria-hidden={mounted ? undefined : "true"}
    >
      {mounted ? children : null}
    </div>
  );
}

export default function HomePage() {
  const { data, loading, error } = useCachedResource(
    "home:sections:v2",
    getHomeSections,
    10 * 60 * 1000,
    { persist: true, persistentMaxAgeMs: 7 * 24 * 60 * 60 * 1000 }
  );

  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="flex flex-col items-center">
          <img src={asset("icon.png")} alt="" className="mb-5 h-20 w-20 object-contain opacity-90" />
          <p className="font-display text-2xl">Impossible de charger le catalogue</p>
          <p className="mt-2 text-sm text-muted">Vérifie que le service API est lancé puis réessaie.</p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div>
        <div className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:h-[70vh] md:min-h-[500px] md:px-0 md:pt-0">
          <div className="h-[53svh] min-h-[29rem] max-h-[33rem] w-full rounded-2xl skeleton md:h-full md:min-h-0 md:max-h-none md:rounded-none" />
        </div>
        <div className="space-y-12 py-12">
          <ContinueWatching />
          <AnimeRowSkeleton />
          <AnimeRowSkeleton />
        </div>
      </div>
    );
  }

  // La variété vient des blocs intercalés.
  const isPlain = (row) =>
    !row.numbered && row.variant !== "episode" && row.variant !== "manga";

  const sections = [];
  let plainSeen = 0;
  for (const row of data.rows || []) {
    const isPlainGenre = isPlain(row);
    if (isPlainGenre) {
      plainSeen += 1;
      sections.push(
        <AnimeRow key={row.key} title={row.title} kana={row.kana} items={row.items} />
      );
      // Entre deux rangées de genre, jamais en fin de page.
      if (plainSeen === 6) sections.push(<CommunityBanner key="community" />);
    } else if (row.numbered) {
      // Tendances → Top 10.
      sections.push(
        <TopTenRow key={row.key} title={row.title} kana={row.kana} items={row.items} />
      );
    } else {
      sections.push(
        <AnimeRow
          key={row.key}
          title={row.title}
          kana={row.kana}
          items={row.items}
          variant={row.variant}
        />
      );
    }
  }
  // Trop peu de rangées pour intercaler : le bandeau ferme la liste.
  if (plainSeen < 6) sections.push(<CommunityBanner key="community" />);

  return (
    <div className="animate-fade-in pb-24">
      <HeroCarousel items={data.hero} />
      <div className="relative z-10 mt-1 space-y-8 md:mt-0 md:pt-6 md:space-y-12">
        <GenresRow />
        <ContinueWatching />
        <DeferredHomeSection height={300}>
          <ForYouRow />
        </DeferredHomeSection>
        {sections.map((section) => {
          const height = section.key === "premium" || section.key === "community" ? 220 : 320;
          return (
            <DeferredHomeSection key={section.key} height={height}>
              {section}
            </DeferredHomeSection>
          );
        })}
      </div>
    </div>
  );
}
