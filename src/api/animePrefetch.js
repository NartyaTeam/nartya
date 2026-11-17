import { getAnimeScans, getScanChapters, getSeasonEpisodes } from "@/api/animeApi";
import { getOrFetch } from "@/hooks/useCachedResource";
import { EPISODES_CACHE_OPTIONS, EPISODES_TTL_MS, episodesCacheKey } from "@/utils/episodeVideoUtils";

const SCANS_TTL_MS = 10 * 60 * 1000;
const CHAPTERS_TTL_MS = 15 * 60 * 1000;

/**
 * Ouverture d'une fiche : la liste d'épisodes et les scans partaient seulement après la fiche,
 * soit un aller-retour de plus chacun (et deux pour les chapitres). On les lance avec elle,
 * sous les mêmes clés que les sections, qui reprennent la requête en cours.
 *
 * La saison n'est qu'une supposition : celle de l'URL, sinon la première. Une supposition
 * fausse coûte une requête perdue, pas une attente.
 */
export function prefetchAnimeOpening(slug, { lite = false, seasonId = null, withScans = true } = {}) {
  // Un identifiant AniList doit d'abord être traduit en slug.
  if (!slug || /^\d+$/.test(slug)) return;
  const season = seasonId || "saison1";
  getOrFetch(
    episodesCacheKey(slug, season, lite),
    () => getSeasonEpisodes(slug, season, { lite }),
    EPISODES_TTL_MS,
    EPISODES_CACHE_OPTIONS
  ).catch(() => {});

  if (!withScans) return;
  getOrFetch(`scans:${slug}`, () => getAnimeScans(slug), SCANS_TTL_MS)
    .then((scans) => {
      const first = scans?.[0]?.oeuvre;
      if (first) return getOrFetch(`scan-chapters:${first}`, () => getScanChapters(first), CHAPTERS_TTL_MS);
      return null;
    })
    .catch(() => {});
}
