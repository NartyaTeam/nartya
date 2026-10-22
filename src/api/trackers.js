import { supabase } from "@/lib/supabase";
import { getApi, postFn } from "@/api/animeApi";
import { platform } from "@/platform";

export const TRACKERS = [
  { id: "anilist", label: "AniList" },
  { id: "mal", label: "MyAnimeList" },
];

export const DEFAULT_TRACKER_PREFS = {
  auto_sync: true,
  threshold: 90,
  sync_lists: true,
  sync_ratings: true,
  sync_manga: true,
};

/** `{ anilist: bool, mal: bool }` : un service non configuré sur le serveur ne peut pas être lié. */
export async function getTrackerAvailability() {
  try {
    const json = await getApi("/v1/me/trackers", { retries: 0 });
    return json?.data || {};
  } catch {
    return {};
  }
}

/** Comptes liés, sans jamais les jetons (ils ne quittent pas le serveur). */
export async function listTrackerAccounts() {
  const { data, error } = await supabase.rpc("my_tracker_accounts");
  if (error) throw error;
  return data || [];
}

export async function getTrackerPrefs() {
  const { data, error } = await supabase.from("tracker_prefs").select("*").maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_TRACKER_PREFS, ...(data || {}) };
}

export async function saveTrackerPrefs(userId, patch) {
  const { error } = await supabase
    .from("tracker_prefs")
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

/** Ouvre la page d'autorisation dans le navigateur ; le compte apparaît au retour dans l'app. */
export async function startTrackerLink(provider) {
  const { data, error } = await postFn(`/v1/me/trackers/${provider}/link`);
  if (error || !data?.url) throw new Error(error?.message || "Liaison impossible pour le moment.");
  await Promise.resolve(platform.openExternal(data.url));
}

export async function unlinkTracker(provider) {
  const { error } = await supabase.rpc("unlink_tracker", { p_provider: provider });
  if (error) throw error;
}

/** Ajoute à Nartya ce qui n'y est pas encore : listes et notes. Rien n'est écrasé. */
export async function importTrackerList(provider) {
  const { error } = await postFn(`/v1/me/trackers/${provider}/import`);
  if (error) throw new Error(error.message);
}

/** Envoie tout l'historique Nartya vers les comptes liés. Renvoie le nombre d'envois en file. */
export async function exportToTrackers() {
  const { data, error } = await supabase.rpc("tracker_export_all");
  if (error) throw error;
  return data || 0;
}
