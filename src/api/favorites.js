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

/**
 * Sans genre fourni, il est résolu en arrière-plan. `mediaType` "manga" range le favori dans
 * l'onglet Mangas ; omis, la colonne garde sa valeur (« anime » par défaut).
 */
export async function addFavorite({ slug, title, cover, genre, mediaType }) {
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
      ...(mediaType && { media_type: mediaType }),
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

/**
 * Ordre des favoris à la une (et donc du podium), porté par `pinned_at` : le premier de la
 * liste reçoit la date la plus ancienne. Toutes les dates restent dans le passé.
 */
export async function setPinnedOrder(slugs) {
  if (isGuestSession() || !slugs?.length) return;
  const base = Date.now() - (slugs.length + 1) * 1000;
  const results = await Promise.all(
    slugs.map((slug, i) =>
      supabase
        .from("favorites")
        .update({ pinned_at: new Date(base + i * 1000).toISOString() })
        .eq("anime_slug", slug)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
  invalidateFavoriteProfileData();
}

/**
 * Affiche choisie par le membre parmi les visuels de la galerie. Le marqueur, ignoré par le
 * navigateur, dit au podium de la garder au lieu de chercher l'affiche AniList.
 */
const CUSTOM_COVER_MARK = "#affiche-choisie";

export const isCustomCover = (url) => typeof url === "string" && url.endsWith(CUSTOM_COVER_MARK);

/** `url` null : retour à l'affiche d'origine (`fallbackCover`). Renvoie la valeur enregistrée. */
export async function setFavoriteCover(slug, url, fallbackCover = null) {
  if (isGuestSession()) return null;
  const cover = url ? `${url}${CUSTOM_COVER_MARK}` : fallbackCover;
  const { error } = await supabase.from("favorites").update({ anime_cover: cover }).eq("anime_slug", slug);
  if (error) throw error;
  invalidateFavoriteProfileData();
  return cover;
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
