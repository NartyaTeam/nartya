import { supabase } from "@/lib/supabase";
import { dataOwnerId } from "@/lib/profileSession";
import { isGuestSession } from "@/lib/guest";
import { expireCache } from "@/hooks/useCachedResource";

function expireProfileProgress(userId = "") {
  expireCache(userId ? `profile:stats:${userId}` : "profile:stats:");
  expireCache(userId ? `profile:activity:${userId}` : "profile:activity:");
}

// Une seule lecture alimente « Reprendre » et « Pour toi ».
const RESUME_CACHE_MS = 15_000;
const RESUME_QUERY_LIMIT = 120;
let resumeCache = { userId: null, rows: null, ts: 0, promise: null };

function invalidateResumeCache() {
  resumeCache = { userId: null, rows: null, ts: 0, promise: null };
  animeRowsCache.clear();
}

// Une fiche lisait la progression du même anime trois fois (dernier épisode vu, épisodes vus,
// mentions des commentaires), et le lecteur une quatrième pour la position de reprise : une
// seule lecture les sert toutes. Vidé à chaque écriture de cet appareil.
const ANIME_ROWS_CACHE_MS = 2 * 60_000;
const animeRowsCache = new Map();

function getAnimeProgressRows(slug) {
  const hit = animeRowsCache.get(slug);
  if (hit && Date.now() - hit.ts < ANIME_ROWS_CACHE_MS) return hit.promise;
  const promise = supabase
    .from("episode_progress")
    .select(
      "user_id, season_id, episode_number, episode_key, language, position_seconds, duration, progress_percent, completed, updated_at"
    )
    .eq("anime_slug", slug)
    .order("updated_at", { ascending: false })
    .then(({ data, error }) => {
      if (error || !data) {
        animeRowsCache.delete(slug);
        return null;
      }
      return data;
    });
  animeRowsCache.set(slug, { ts: Date.now(), promise });
  if (animeRowsCache.size > 20) animeRowsCache.delete(animeRowsCache.keys().next().value);
  return promise;
}

async function getResumeRows() {
  const { data: authData } = await supabase.auth.getSession();
  const userId = authData?.session?.user?.id || null;
  const now = Date.now();
  if (resumeCache.userId === userId && resumeCache.rows && now - resumeCache.ts < RESUME_CACHE_MS) {
    return resumeCache.rows;
  }
  if (resumeCache.userId === userId && resumeCache.promise) return resumeCache.promise;

  const request = supabase
    .from("episode_progress")
    .select(
      "episode_key, anime_slug, anime_title, anime_cover, season_id, episode_number, language, position_seconds, duration, progress_percent, completed, updated_at"
    )
    .eq("hidden_from_resume", false)
    .order("updated_at", { ascending: false })
    .limit(RESUME_QUERY_LIMIT)
    .then(({ data, error }) => {
      const rows = error || !data ? [] : data;
      resumeCache = { userId, rows, ts: Date.now(), promise: null };
      return rows;
    });
  resumeCache = { userId, rows: null, ts: 0, promise: request };
  return request;
}

export function episodeKey(slug, seasonId, episodeNumber, language) {
  return `${slug}:${seasonId}:${episodeNumber}:${language}`;
}

/** « Sans titre » est affiché tant que la fiche n'est pas chargée : on ne l'enregistre pas. */
function cleanTitle(title) {
  const t = (title || "").trim();
  return t && t !== "Sans titre" ? t : null;
}

/**
 * Toutes les 30 s environ. Le serveur ne crédite que le temps réel écoulé, plafonné.
 * Sans `duration`, dénominateur du « réellement vu », l'épisode n'est jamais compté comme vu.
 */
export async function heartbeatWatch(key, duration = null) {
  if (!key || isGuestSession()) return;
  try {
    await supabase.rpc("heartbeat_watch", {
      p_episode_key: key,
      p_duration: duration > 0 ? duration : null,
      p_tz_offset: tzOffsetMinutes(),
    });
  } catch (_) {}
}

/**
 * Minutes à l'est de UTC (`getTimezoneOffset()` compte à l'envers), pour les succès liés
 * à l'heure locale.
 */
function tzOffsetMinutes() {
  const offset = -new Date().getTimezoneOffset();
  return Number.isFinite(offset) ? offset : null;
}

/**
 * Temps de visionnage et progression en une requête ; les sauvegardes ponctuelles passent
 * par `saveEpisodeProgress`. `seasonTotal` sert au succès « saison terminée ».
 * @returns {Promise<string[]>} paliers nouvellement débloqués
 */
export async function watchTick({
  slug,
  seasonId,
  episodeNumber,
  language,
  positionSeconds,
  duration,
  title = null,
  cover = null,
  seasonTotal = null,
  userId = null,
  rate = 1,
}) {
  if (!slug || isGuestSession()) return [];
  try {
    const { data } = await supabase.rpc("watch_tick", {
      p_episode_key: episodeKey(slug, seasonId, episodeNumber, language),
      p_slug: slug,
      p_season_id: String(seasonId),
      p_episode_number: episodeNumber,
      p_language: language,
      p_position: positionSeconds,
      p_duration: duration,
      p_title: cleanTitle(title),
      p_cover: cover,
      p_tz_offset: tzOffsetMinutes(),
      p_season_total: seasonTotal > 0 ? seasonTotal : null,
      p_rate: Math.min(2, Math.max(1, Number(rate) || 1)),
    });
    expireProfileProgress(userId);
    invalidateResumeCache();
    const unlocked = data?.unlocked || [];
    // Un déblocage périme la vitrine du profil.
    if (unlocked.length) expireCache("achievements:");
    return unlocked;
  } catch (_) {
    return [];
  }
}

/**
 * Les spéciaux portent un numéro fractionnaire (24.001) ; la colonne est entière,
 * l'identité reste dans `episode_key`.
 */
function storedEpisodeNumber(n) {
  return Number.isFinite(Number(n)) ? Math.round(Number(n)) : null;
}

/** Au-delà, l'épisode est considéré comme vu. */
export const COMPLETION_THRESHOLD = 90;

/** @returns {{ positionSeconds, duration, progressPercent, completed }|null} */
export async function getEpisodeProgress(slug, seasonId, episodeNumber, language, userId) {
  if (!userId) return null;

  const key = episodeKey(slug, seasonId, episodeNumber, language);
  const owner = dataOwnerId(userId);
  // Déjà lue par la fiche dans la plupart des cas : le lecteur démarre sans attendre la base.
  const data = (await getAnimeProgressRows(slug))?.find((row) => row.user_id === owner && row.episode_key === key);
  if (!data) return null;
  return {
    positionSeconds: data.position_seconds || 0,
    duration: data.duration || 0,
    progressPercent: data.progress_percent || 0,
    completed: data.completed || false,
    updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : 0,
  };
}

/** Ligne `episode_progress` d'une sauvegarde de lecture. */
function progressRow({ slug, seasonId, episodeNumber, language, positionSeconds, duration, title = null, cover = null, userId }) {
  const pct = duration > 0 ? Math.min((positionSeconds / duration) * 100, 100) : 0;
  return {
    user_id: dataOwnerId(userId),
    episode_key: episodeKey(slug, seasonId, episodeNumber, language),
    anime_slug: slug,
    anime_title: cleanTitle(title),
    anime_cover: cover,
    season_id: String(seasonId),
    episode_number: storedEpisodeNumber(episodeNumber),
    language,
    position_seconds: positionSeconds,
    duration,
    progress_percent: pct,
    completed: pct >= COMPLETION_THRESHOLD,
    hidden_from_resume: false, // re-regarder réaffiche l'anime dans « Reprendre »
    updated_at: new Date().toISOString(),
  };
}

/**
 * Plusieurs positions en une requête. Une même clé n'y figure qu'une fois (la dernière) : Postgres
 * refuse qu'un upsert touche deux fois la même ligne.
 * `true` = rien à renvoyer plus tard (enregistré, ou volontairement ignoré).
 */
export async function saveEpisodeProgressBatch(entries) {
  if (isGuestSession()) return true;
  const byKey = new Map();
  for (const entry of entries) {
    if (!entry?.userId) continue;
    const row = progressRow(entry);
    byKey.set(`${row.user_id}|${row.episode_key}`, row);
  }
  if (byKey.size === 0) return true;

  const { error } = await supabase
    .from("episode_progress")
    .upsert([...byKey.values()], { onConflict: "user_id,episode_key" });
  if (error) {
    console.warn("[progress] save échouée:", error.message);
    return false;
  }
  expireProfileProgress(entries.find((e) => e?.userId)?.userId);
  invalidateResumeCache();
  return true;
}

/** @param {string} [p.title] titre de l'anime, pour « Reprendre » */
export function saveEpisodeProgress(entry) {
  return saveEpisodeProgressBatch([entry]);
}

/** Sans toucher à l'historique. */
export async function hideAnimeFromResume(slug) {
  if (!slug || isGuestSession()) return;
  const { error } = await supabase
    .from("episode_progress")
    .update({ hidden_from_resume: true })
    .eq("anime_slug", slug);
  if (error) console.warn("[progress] hide resume échouée:", error.message);
  else invalidateResumeCache();
}

export async function markEpisodeWatched({ slug, seasonId, episodeNumber, language, title, cover, userId }) {
  if (!userId || isGuestSession()) return;
  const { error } = await supabase.from("episode_progress").upsert(
    {
      user_id: dataOwnerId(userId),
      episode_key: episodeKey(slug, seasonId, episodeNumber, language),
      anime_slug: slug,
      anime_title: cleanTitle(title),
      anime_cover: cover || null,
      season_id: String(seasonId),
      episode_number: storedEpisodeNumber(episodeNumber),
      language,
      position_seconds: 0,
      duration: 0,
      progress_percent: 100,
      completed: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,episode_key" }
  );
  if (error) console.warn("[progress] mark vu échoué:", error.message);
  else {
    expireProfileProgress(userId);
    invalidateResumeCache();
  }
}

/** Une même saison et langue, en une requête. */
export async function markEpisodesWatched({ slug, seasonId, episodeNumbers, language, title, cover, userId }) {
  if (!userId || isGuestSession() || !episodeNumbers?.length) return;
  const now = new Date().toISOString();
  const rows = episodeNumbers.map((num) => ({
    user_id: dataOwnerId(userId),
    episode_key: episodeKey(slug, seasonId, num, language),
    anime_slug: slug,
    anime_title: cleanTitle(title),
    anime_cover: cover || null,
    season_id: String(seasonId),
    episode_number: storedEpisodeNumber(num),
    language,
    position_seconds: 0,
    duration: 0,
    progress_percent: 100,
    completed: true,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("episode_progress")
    .upsert(rows, { onConflict: "user_id,episode_key" });
  if (error) console.warn("[progress] mark bulk vu échoué:", error.message);
  else {
    expireProfileProgress(userId);
    invalidateResumeCache();
  }
}

/** Toutes langues ; la progression partielle est conservée. */
export async function unmarkSeasonWatched({ slug, seasonId }) {
  if (isGuestSession()) return;
  const { error } = await supabase
    .from("episode_progress")
    .delete()
    .eq("anime_slug", slug)
    .eq("season_id", String(seasonId))
    .eq("completed", true);
  if (error) console.warn("[progress] démarquage saison échoué:", error.message);
  else {
    expireProfileProgress();
    invalidateResumeCache();
  }
}

/** Toutes langues confondues. */
export async function unmarkEpisodeWatched({ slug, seasonId, episodeNumber }) {
  if (isGuestSession()) return;
  const { error } = await supabase
    .from("episode_progress")
    .delete()
    .eq("anime_slug", slug)
    .eq("season_id", String(seasonId))
    .eq("episode_number", episodeNumber);
  if (error) console.warn("[progress] mark non-vu échoué:", error.message);
  else {
    expireProfileProgress();
    invalidateResumeCache();
  }
}

/** `achievements` = plus haut palier atteint par famille. */
export async function getUserStats() {
  const { data, error } = await supabase.rpc("get_user_stats");
  if (error) {
    console.warn("[progress] get_user_stats:", error.message);
    return { totalWatchSeconds: 0, totalEpisodes: 0, totalAnimes: 0, achievements: {} };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    totalWatchSeconds: Math.round(row?.total_watch_seconds || 0),
    totalEpisodes: Number(row?.total_episodes || 0),
    totalAnimes: Number(row?.total_animes || 0),
    achievements: row?.achievements || {},
  };
}

/** Du plus récent au plus ancien. */
export async function getContinueWatching(limit = 12) {
  const data = await getResumeRows();

  const seen = new Set();
  const result = [];
  for (const row of data) {
    if (seen.has(row.anime_slug)) continue;
    seen.add(row.anime_slug);
    result.push({
      episodeKey: row.episode_key,
      slug: row.anime_slug,
      title: row.anime_title,
      cover: row.anime_cover,
      seasonId: row.season_id,
      episodeNumber: row.episode_number,
      language: row.language,
      positionSeconds: row.position_seconds || 0,
      duration: row.duration || 0,
      progressPercent: Math.round(row.progress_percent || 0),
      completed: row.completed,
      updatedAt: row.updated_at,
    });
    if (result.length >= limit) break;
  }
  return result;
}

export async function getLastWatched(slug, userId) {
  if (!userId || !slug) return null;
  const owner = dataOwnerId(userId);
  // Lignes triées de la plus récente à la plus ancienne.
  const data = (await getAnimeProgressRows(slug))?.find((row) => row.user_id === owner);
  if (!data) return null;
  return {
    seasonId: data.season_id,
    episodeNumber: data.episode_number,
    language: data.language,
    progressPercent: Math.round(data.progress_percent || 0),
    completed: data.completed,
  };
}

/** `slug → { lastEpisode, lastSeasonId, lastUpdatedAt, lastPercent, lastCompleted, watchedCount }` */
export async function getFavoritesProgress() {
  const { data, error } = await supabase
    .from("episode_progress")
    .select("anime_slug, season_id, episode_number, progress_percent, completed, updated_at")
    .order("updated_at", { ascending: false });
  if (error || !data) return {};

  const map = {};
  const seenByAnime = {};
  for (const row of data) {
    const slug = row.anime_slug;
    let s = map[slug];
    if (!s) {
      // Trié par updated_at DESC : la première ligne d'un anime est la plus récente.
      s = map[slug] = {
        lastEpisode: row.episode_number,
        lastSeasonId: row.season_id,
        lastUpdatedAt: row.updated_at,
        lastPercent: Math.round(row.progress_percent || 0),
        lastCompleted: !!row.completed,
        watchedCount: 0,
      };
      seenByAnime[slug] = new Set();
    }
    if (row.completed) {
      const k = `${row.season_id}:${row.episode_number}`;
      if (!seenByAnime[slug].has(k)) {
        seenByAnime[slug].add(k);
        s.watchedCount += 1;
      }
    }
  }
  return map;
}

/** Indexée par `${seasonId}:${episodeNumber}`, toutes langues confondues. */
export async function getAnimeProgressMap(slug) {
  const data = await getAnimeProgressRows(slug);
  if (!data) return {};
  const map = {};
  for (const row of data) {
    // La colonne est entière (11.001 → 11) : le vrai numéro est dans `episode_key`.
    const keyed = Number(String(row.episode_key || "").split(":").at(-2));
    const k = `${row.season_id}:${Number.isFinite(keyed) ? keyed : row.episode_number}`;
    const prev = map[k];
    const cur = { progressPercent: Math.round(row.progress_percent || 0), completed: row.completed };
    if (!prev || cur.progressPercent > prev.progressPercent) map[k] = cur;
  }
  return map;
}
