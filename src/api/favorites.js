import { supabase } from "@/lib/supabase";
import { isGuestSession } from "@/lib/guest";
import { invalidateCache } from "@/hooks/useCachedResource";
import { getAnimePage } from "@/api/animeApi";

function invalidateFavoriteProfileData() {
  invalidateCache("profile:favorites:");
  invalidateCache("profile:activity:");
}

/** `sort_order` (tri manuel) quand il est posé, sinon par ajout récent. */
export async function listFavorites() {
  const { data, error } = await supabase
    .from("favorites")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("added_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Du plus prioritaire au moins prioritaire. */
export async function reorderFavorites(slugs) {
  if (isGuestSession() || !slugs?.length) return;
  const { error } = await supabase.rpc("reorder_favorites", { p_slugs: slugs });
  if (error) throw error;
  invalidateFavoriteProfileData();
}

export async function isFavorite(slug) {
  const { data, error } = await supabase
    .from("favorites")
    .select("anime_slug")
    .eq("anime_slug", slug)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Sans genre fourni, il est résolu en arrière-plan. */
export async function addFavorite({ slug, title, cover, genre }) {
  if (isGuestSession()) return;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("Non connecté");
  const { error } = await supabase.from("favorites").upsert(
    {
      user_id: userId,
      anime_slug: slug,
      anime_title: title || null,
      anime_cover: cover || null,
      genre: genre || null,
    },
    { onConflict: "user_id,anime_slug" }
  );
  if (error) throw error;
  invalidateFavoriteProfileData();
  if (!genre) backfillFavoriteGenre(slug);
}

async function backfillFavoriteGenre(slug) {
  try {
    const { anilist } = await getAnimePage(slug);
    const genre = anilist?.genres?.[0];
    if (!genre) return;
    const { error } = await supabase.from("favorites").update({ genre }).eq("anime_slug", slug);
    if (!error) invalidateFavoriteProfileData();
  } catch {
    // L'anime restera « Non classé ».
  }
}

export async function removeFavorite(slug) {
  if (isGuestSession()) return;
  const { error } = await supabase.from("favorites").delete().eq("anime_slug", slug);
  if (error) throw error;
  invalidateFavoriteProfileData();
}

/** Idempotent (rafraîchit la date). */
export async function pinFavorite(slug) {
  if (isGuestSession()) return;
  const { error } = await supabase
    .from("favorites")
    .update({ pinned_at: new Date().toISOString() })
    .eq("anime_slug", slug);
  if (error) throw error;
  invalidateFavoriteProfileData();
}

export async function unpinFavorite(slug) {
  if (isGuestSession()) return;
  const { error } = await supabase
    .from("favorites")
    .update({ pinned_at: null })
    .eq("anime_slug", slug);
  if (error) throw error;
  invalidateFavoriteProfileData();
}
