import { Compass } from "lucide-react";
import { useCachedResource } from "@/hooks/useCachedResource";
import { getAnimeRecommendations } from "@/api/animeApi";
import AnimeCard from "@/components/home/AnimeCard";

const GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-x-5 sm:gap-y-8";

/** D'après AniList, disponibles sur Nartya. Chargé à l'ouverture de l'onglet. */
export function RecommendationsSection({ slug }) {
  const { data, loading } = useCachedResource(
    slug ? `anime-recs:${slug}` : null,
    () => getAnimeRecommendations(slug),
    30 * 60 * 1000
  );
  const items = data || [];

  if (loading && !data) {
    return (
      <div className={`px-4 pb-10 pt-6 sm:px-8 ${GRID_CLASS}`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] skeleton rounded-lg" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex min-h-[30dvh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Compass size={22} strokeWidth={1.8} />
        </span>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Pas encore de recommandations trouvées pour cet anime.
        </p>
      </div>
    );
  }

  return (
    <div className={`px-4 pb-10 pt-6 sm:px-8 ${GRID_CLASS}`}>
      {items.map((item) => (
        <AnimeCard key={item.slug} anime={item} />
      ))}
    </div>
  );
}
