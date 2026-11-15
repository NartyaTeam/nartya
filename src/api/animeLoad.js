import { getAnimePage, resolveAnilistToSlug } from "@/api/animeApi";
import { fetchAniZipData } from "@/api/anizip";
import { getMediaById } from "@/api/anilist";

/** Fiche de l'anime : la page d'anime et le lecteur lisent la même entrée du cache. */
export function animeCacheKey(slug, lite = false) {
  return `anime:${slug}:${lite ? "lite" : "full"}`;
}

/** Une fiche vieillit lentement : le disque la garde une semaine, puis elle se revalide. */
export const ANIME_CACHE_OPTIONS = { persist: true, persistentMaxAgeMs: 7 * 24 * 60 * 60 * 1000 };

/** Anime absent du catalogue : fiche AniList seule, sans épisodes. */
export async function loadAnime(slug, { lite = false } = {}) {
  const isAnilistId = /^\d+$/.test(slug);
  const realSlug = isAnilistId ? await resolveAnilistToSlug(slug) : slug;

  if (realSlug) {
    const page = await getAnimePage(realSlug, { lite });
    return { streamingSlug: realSlug, ...page };
  }
  if (isAnilistId) {
    const [media, az] = await Promise.all([
      getMediaById(slug).catch(() => null),
      fetchAniZipData(slug).catch(() => null),
    ]);
    if (!media) throw new Error("not found");
    return {
      streamingSlug: null,
      anime: null,
      anilist: media,
      images: az
        ? { fanart: az.fanart, banner: az.banner, poster: az.poster, clearLogo: az.clearLogo }
        : null,
      seasons: [],
    };
  }
  throw new Error("not found");
}
