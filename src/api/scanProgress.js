import { supabase } from "@/lib/supabase";
import { isGuestSession } from "@/lib/guest";
import { expireCache } from "@/hooks/useCachedResource";

/** Une position par œuvre (dernier chapitre et page lus). */
function scanKey(slug, oeuvre) {
  return `${slug}:${oeuvre}`;
}

/** @returns {{ chapter, page, totalPages, completed }|null} `page` part de 0. */
export async function getScanProgress(slug, oeuvre, userId) {
  if (!userId || !oeuvre) return null;
  const { data, error } = await supabase
    .from("scan_progress")
    .select("chapter, page, total_pages, completed")
    .eq("user_id", userId)
    .eq("scan_key", scanKey(slug, oeuvre))
    .maybeSingle();
  if (error || !data) return null;
  return {
    chapter: data.chapter || 1,
    page: data.page || 0,
    totalPages: data.total_pages || 0,
    completed: data.completed || false,
  };
}

/** `oeuvre → { chapter, page, completed }` */
export async function getAnimeScansProgress(slug, userId) {
  if (!userId) return {};
  const { data, error } = await supabase
    .from("scan_progress")
    .select("oeuvre, chapter, page, completed")
    .eq("user_id", userId)
    .eq("anime_slug", slug);
  if (error || !data) return {};
  const map = {};
  for (const row of data) {
    map[row.oeuvre] = {
      chapter: row.chapter || 1,
      page: row.page || 0,
      completed: !!row.completed,
    };
  }
  return map;
}

/** La Home n'affiche une lecture qu'après trois pages vues. */
export async function getContinueReadingScans(limit = 12) {
  const { data, error } = await supabase
    .from("scan_progress")
    .select(
      "scan_key, anime_slug, anime_title, anime_cover, oeuvre, oeuvre_label, chapter, page, total_pages, completed, updated_at"
    )
    .eq("hidden_from_resume", false)
    .gte("page", 2)
    .order("updated_at", { ascending: false })
    .limit(Math.max(40, limit * 3));
  if (error || !data) return [];

  const seen = new Set();
  const result = [];
  for (const row of data) {
    if (seen.has(row.anime_slug)) continue;
    seen.add(row.anime_slug);
    const totalPages = Math.max(0, row.total_pages || 0);
    result.push({
      scanKey: row.scan_key,
      slug: row.anime_slug,
      title: row.anime_title,
      cover: row.anime_cover,
      oeuvre: row.oeuvre,
      oeuvreLabel: row.oeuvre_label,
      chapter: row.chapter || 1,
      page: row.page || 0,
      totalPages,
      completed: !!row.completed,
      progressPercent: totalPages
        ? Math.min(100, Math.round(((row.page + 1) / totalPages) * 100))
        : 0,
      updatedAt: row.updated_at,
    });
    if (result.length >= limit) break;
  }
  return result;
}

export async function hideScanFromResume(scanKeyToHide) {
  if (!scanKeyToHide || isGuestSession()) return;
  const { error } = await supabase
    .from("scan_progress")
    .update({ hidden_from_resume: true })
    .eq("scan_key", scanKeyToHide);
  if (error) console.warn("[scan-progress] masquage échoué:", error.message);
}

/**
 * @param {number} p.page dernière page vue, à partir de 0
 * @param {string} [p.oeuvreLabel] libellé affiché (« Scans (couleur) »)
 */
export async function saveScanProgress({
  slug,
  oeuvre,
  chapter,
  page,
  totalPages = 0,
  completed = false,
  oeuvreLabel = null,
  title = null,
  cover = null,
  userId,
}) {
  if (!userId || !oeuvre || isGuestSession()) return;
  const { error } = await supabase.from("scan_progress").upsert(
    {
      user_id: userId,
      scan_key: scanKey(slug, oeuvre),
      anime_slug: slug,
      anime_title: title,
      anime_cover: cover,
      oeuvre,
      oeuvre_label: oeuvreLabel,
      chapter,
      page,
      total_pages: totalPages,
      completed,
      hidden_from_resume: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,scan_key" }
  );
  if (error) console.warn("[scan-progress] save échouée:", error.message);
  else expireCache(`profile:activity:${userId}`);
}
