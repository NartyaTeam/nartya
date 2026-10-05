import { getMangaHomeSections } from "@/api/animeApi";
import { useCachedResource } from "@/hooks/useCachedResource";
import HeroCarousel from "@/components/home/HeroCarousel";
import AnimeRow, { AnimeRowSkeleton } from "@/components/home/AnimeRow";
import ContinueWatching from "@/components/home/ContinueWatching";
import CommunityBanner from "@/components/home/CommunityBanner";
import { asset } from "@/lib/asset";

export default function MangaHomePage() {
  const { data, loading, error } = useCachedResource(
    "home:manga-sections:v1",
    getMangaHomeSections,
    10 * 60 * 1000
  );

  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="flex flex-col items-center">
          <img src={asset("icon.png")} alt="" className="mb-5 h-20 w-20 object-contain opacity-90" />
          <p className="font-display text-2xl">Impossible de charger les mangas</p>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Le catalogue de scans est momentanément indisponible. Réessaie dans quelques instants.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div>
        <div className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-0 md:pt-0">
          <div className="h-[48svh] min-h-[26rem] max-h-[30rem] w-full rounded-2xl skeleton md:h-[70vh] md:min-h-[500px] md:max-h-none md:rounded-none" />
        </div>
        <div className="space-y-10 py-10 md:space-y-12 md:py-12">
          <ContinueWatching defaultTab="scans" onlyScans />
          <AnimeRowSkeleton />
          <AnimeRowSkeleton />
        </div>
      </div>
    );
  }

  const rows = data?.rows || [];
  return (
    <div className="animate-fade-in pb-24">
      <HeroCarousel items={data?.hero || []} contentType="manga" />
      <div className="relative z-10 mt-4 space-y-10 md:mt-0 md:pt-6 md:space-y-12">
        <ContinueWatching defaultTab="scans" onlyScans />
        {rows.map((row, index) => (
          <div key={row.key}>
            <AnimeRow
              title={row.title}
              kana={row.kana}
              items={row.items}
              numbered={row.numbered}
              variant="manga"
            />
            {index === 5 && <div className="mt-12"><CommunityBanner /></div>}
          </div>
        ))}
        {rows.length < 6 && <CommunityBanner />}
      </div>
    </div>
  );
}
