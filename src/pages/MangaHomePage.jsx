import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { getMangaHomeSections } from "@/api/animeApi";
import { platform } from "@/platform";
import { Fox } from "@/components/brand/NartyaMark";
import { useCachedResource } from "@/hooks/useCachedResource";
import MangaSpotlight from "@/components/manga/MangaSpotlight";
import LatestChapters from "@/components/manga/LatestChapters";
import TopTenRow from "@/components/home/TopTenRow";
import AnimeRow, { AnimeRowSkeleton } from "@/components/home/AnimeRow";
import ContinueWatching from "@/components/home/ContinueWatching";
import CommunityBanner from "@/components/home/CommunityBanner";
import FavoriteGenresRows from "@/components/home/FavoriteGenresRows";

/** Mobile : pas de barre du haut, la recherche manga n'était accessible que par l'onglet Recherche. */
function MobileMangaSearchBar() {
  if (!platform.isMobile) return null;
  return (
    <div className="px-4 pt-4">
      <Link
        to="/search?media=manga"
        className="flex h-11 items-center gap-2.5 rounded-md bg-surface px-3.5 text-sm text-muted ring-2 ring-border"
      >
        <Search size={17} className="shrink-0" />
        Rechercher un manga…
      </Link>
    </div>
  );
}

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
          <Fox className="mb-5 h-20 w-20 text-primary opacity-90" />
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
        <div className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-8 md:pt-6">
          <div className="h-[26rem] w-full rounded-lg skeleton md:h-[30rem]" />
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
  const latest = rows.find((r) => r.key === "manga-latest");
  const trending = rows.find((r) => r.key === "manga-trending");
  const others = rows.filter((r) => r !== latest && r !== trending);
  return (
    <div className="animate-fade-in pb-24">
      <MangaSpotlight items={data?.hero || []} />
      <MobileMangaSearchBar />
      <div className="relative z-10 mt-8 space-y-10 md:space-y-12">
        <ContinueWatching defaultTab="scans" onlyScans />
        {latest && <LatestChapters title={latest.title} items={latest.items} />}
        {trending && <TopTenRow title={trending.title} items={trending.items} openScans />}
        <FavoriteGenresRows media="manga" />
        {others.map((row, index) => (
          <div key={row.key}>
            <AnimeRow title={row.title} items={row.items} variant="manga" />
            {index === 2 && <div className="mt-12"><CommunityBanner /></div>}
          </div>
        ))}
        {others.length < 3 && <CommunityBanner />}
      </div>
    </div>
  );
}
