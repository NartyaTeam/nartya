import { supabase } from "@/lib/supabase";
import { invalidateCache } from "@/hooks/useCachedResource";

export const COMMUNITY_PICKS_CACHE_KEY = "home:community-picks";

/** Recommandations des 30 derniers jours, comptes bannis exclus. */
export async function getCommunityPicks(limit = 20) {
  const { data, error } = await supabase.rpc("get_community_picks", { lim: limit });
  if (error) throw error;
  return (data || []).map((r) => ({
    slug: r.anime_slug,
    title: r.title || r.anime_slug,
    cover: r.cover || null,
    bumps: r.bumps,
  }));
}

/** `{ bumped, bumps }` : ma recommandation est-elle active, et combien en tout. */
export async function getAnimeBump(slug) {
  const { data, error } = await supabase.rpc("get_anime_bump", { p_slug: slug });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { bumped: !!row?.bumped, bumps: Number(row?.bumps || 0) };
}

/** Renvoie le nouvel état. */
export async function toggleAnimeBump({ slug, title, cover }) {
  const { data, error } = await supabase.rpc("toggle_anime_bump", {
    p_slug: slug,
    p_title: title || null,
    p_cover: cover || null,
  });
  if (error) throw error;
  invalidateCache(COMMUNITY_PICKS_CACHE_KEY);
  return !!data;
}
