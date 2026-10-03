import { supabase } from "@/lib/supabase";
import { isGuestSession } from "@/lib/guest";

/** `sort_order` (tri manuel) quand il est posé, sinon par récence. */
export async function listMyAnimeLists() {
  const { data, error } = await supabase
    .from("anime_lists")
    .select(
      "anime_slug, status, anime_title, anime_cover, started_at, completed_at, updated_at, sort_order"
    )
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function reorderAnimeList(status, slugs) {
  if (isGuestSession() || !slugs?.length) return;
  const { error } = await supabase.rpc("reorder_anime_list", {
    p_status: status,
    p_slugs: slugs,
  });
  if (error) throw error;
}

/** Null s'il n'est dans aucune liste. */
export async function getAnimeStatus(slug) {
  const { data, error } = await supabase
    .from("anime_lists")
    .select("status")
    .eq("anime_slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data?.status || null;
}

/** La RPC gère `started_at` et `completed_at` atomiquement. */
export async function setAnimeStatus({ slug, status, title, cover }) {
  if (isGuestSession()) return;
  const { error } = await supabase.rpc("set_anime_status", {
    p_slug: slug,
    p_status: status,
    p_title: title || null,
    p_cover: cover || null,
  });
  if (error) throw error;
}

/** "YYYY-MM-DD", ou null pour effacer. */
export async function setAnimeListDates({ slug, startedAt, completedAt }) {
  if (isGuestSession()) return;
  const { error } = await supabase.rpc("set_anime_list_dates", {
    p_slug: slug,
    p_started_at: startedAt || null,
    p_completed_at: completedAt || null,
  });
  if (error) throw error;
}

export async function removeAnimeStatus(slug) {
  if (isGuestSession()) return;
  const { error } = await supabase.from("anime_lists").delete().eq("anime_slug", slug);
  if (error) throw error;
}
