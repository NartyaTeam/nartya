import { supabase } from "@/lib/supabase";

/** Export et import JSON des favoris, listes et progression. */

const VALID_STATUS = new Set(["watching", "planned", "completed", "dropped"]);
const nowIso = () => new Date().toISOString();

export async function exportBackup() {
  const [fav, lists, prog] = await Promise.all([
    supabase.from("favorites").select("anime_slug, anime_title, anime_cover, added_at"),
    supabase
      .from("anime_lists")
      .select("anime_slug, status, anime_title, anime_cover, started_at, completed_at, updated_at"),
    supabase
      .from("episode_progress")
      .select(
        "episode_key, anime_slug, anime_title, anime_cover, season_id, episode_number, language, position_seconds, duration, progress_percent, completed, hidden_from_resume, updated_at"
      ),
  ]);
  return {
    app: "nartya",
    version: 1,
    exportedAt: nowIso(),
    favorites: fav.data || [],
    lists: lists.data || [],
    progress: prog.data || [],
  };
}

/** Par lots, pour les grosses bibliothèques. */
async function upsertChunked(table, rows, onConflict, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + size), { onConflict });
    if (error) throw error;
  }
}

/** Fusion : upsert, n'efface rien. */
export async function importBackup(data) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("Non connecté");
  if (!data || data.app !== "nartya" || typeof data !== "object") {
    throw new Error("Fichier de sauvegarde invalide");
  }

  const favorites = Array.isArray(data.favorites) ? data.favorites : [];
  const lists = Array.isArray(data.lists) ? data.lists : [];
  const progress = Array.isArray(data.progress) ? data.progress : [];

  if (favorites.length) {
    await upsertChunked(
      "favorites",
      favorites
        .filter((f) => f?.anime_slug)
        .map((f) => ({
          user_id: userId,
          anime_slug: f.anime_slug,
          anime_title: f.anime_title ?? null,
          anime_cover: f.anime_cover ?? null,
        })),
      "user_id,anime_slug"
    );
  }

  if (lists.length) {
    await upsertChunked(
      "anime_lists",
      lists
        .filter((l) => l?.anime_slug && VALID_STATUS.has(l.status))
        .map((l) => ({
          user_id: userId,
          anime_slug: l.anime_slug,
          status: l.status,
          anime_title: l.anime_title ?? null,
          anime_cover: l.anime_cover ?? null,
          started_at: l.started_at ?? null,
          completed_at: l.completed_at ?? null,
          updated_at: l.updated_at ?? nowIso(),
        })),
      "user_id,anime_slug"
    );
  }

  if (progress.length) {
    await upsertChunked(
      "episode_progress",
      progress
        .filter((p) => p?.episode_key && p?.anime_slug)
        .map((p) => ({
          user_id: userId,
          episode_key: p.episode_key,
          anime_slug: p.anime_slug,
          anime_title: p.anime_title ?? null,
          anime_cover: p.anime_cover ?? null,
          season_id: p.season_id != null ? String(p.season_id) : null,
          episode_number: p.episode_number ?? null,
          language: p.language ?? null,
          position_seconds: p.position_seconds ?? 0,
          duration: p.duration ?? 0,
          progress_percent: p.progress_percent ?? 0,
          completed: !!p.completed,
          hidden_from_resume: !!p.hidden_from_resume,
          updated_at: p.updated_at ?? nowIso(),
        })),
      "user_id,episode_key"
    );
  }

  return { favorites: favorites.length, lists: lists.length, progress: progress.length };
}
