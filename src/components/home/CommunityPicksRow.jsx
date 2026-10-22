import AnimeRow from "./AnimeRow";
import { useCachedResource } from "@/hooks/useCachedResource";
import { COMMUNITY_PICKS_CACHE_KEY, getCommunityPicks } from "@/api/bumps";

// En dessous, la rangée ferait vide.
const MIN_PICKS = 3;

/** Les animes les plus recommandés par les membres (bouton « Recommander » des fiches). */
export default function CommunityPicksRow() {
  const { data } = useCachedResource(COMMUNITY_PICKS_CACHE_KEY, () => getCommunityPicks(20), 5 * 60 * 1000);
  if (!data || data.length < MIN_PICKS) return null;
  return <AnimeRow title="Recommandé par la communauté" items={data} />;
}
