import { supabase } from "@/lib/supabase";

// Au-delà, l'historique s'arrête : deux pages PostgREST couvrent des mois de visionnage.
const MAX_ROWS = 2000;
const PAGE = 1000;

async function fetchRows(table, columns) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("updated_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Un élément par anime, au dernier épisode touché. Contrairement à « Reprendre », les
 * animes qu'on en a retirés y restent : c'est tout l'intérêt de l'historique.
 */
export async function getWatchHistory() {
  const rows = await fetchRows(
    "episode_progress",
    "anime_slug, anime_title, anime_cover, season_id, episode_number, language, progress_percent, completed, updated_at"
  );
  const bySlug = new Map();
  for (const row of rows) {
    const item = bySlug.get(row.anime_slug);
    if (item) {
      item.episodes++;
      continue;
    }
    bySlug.set(row.anime_slug, {
      slug: row.anime_slug,
      title: row.anime_title,
      cover: row.anime_cover,
      seasonId: row.season_id,
      episodeNumber: row.episode_number,
      language: row.language,
      progressPercent: Math.round(row.progress_percent || 0),
      completed: !!row.completed,
      updatedAt: row.updated_at,
      episodes: 1,
    });
  }
  return [...bySlug.values()];
}

/** Une ligne par œuvre lue : `scan_progress` n'en garde qu'une (dernier chapitre et page). */
export async function getReadingHistory() {
  const rows = await fetchRows(
    "scan_progress",
    "anime_slug, anime_title, anime_cover, oeuvre, oeuvre_label, chapter, page, total_pages, completed, updated_at"
  );
  return rows.map((row) => ({
    slug: row.anime_slug,
    title: row.anime_title,
    cover: row.anime_cover,
    oeuvre: row.oeuvre,
    oeuvreLabel: row.oeuvre_label,
    chapter: row.chapter || 1,
    page: row.page || 0,
    totalPages: Math.max(0, row.total_pages || 0),
    completed: !!row.completed,
    updatedAt: row.updated_at,
  }));
}
