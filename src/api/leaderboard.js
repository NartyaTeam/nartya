import { supabase } from "@/lib/supabase";

/** `metric` : 'watch_time' | 'episodes' | 'animes'. `period` : 'all' | 'week'. Profils publics seulement. */
export async function getLeaderboard(metric = "watch_time", limit = 50, period = "all") {
  const { data, error } = await supabase.rpc("get_leaderboard", { p_metric: metric, lim: limit, p_period: period });
  if (error) throw error;
  return (data || []).map((r, i) => ({
    rank: i + 1,
    id: r.id,
    handle: r.handle,
    username: r.username,
    avatar: r.avatar,
    avatar_custom: r.avatar_custom,
    accent_color: r.accent_color,
    premium_tier: r.premium_tier || null,
    profile_emblem: r.profile_emblem || null,
    role: r.role,
    totalWatchSeconds: Math.round(r.total_watch_seconds || 0),
    totalEpisodes: Number(r.total_episodes || 0),
    totalAnimes: Number(r.total_animes || 0),
  }));
}

/**
 * Place de l'utilisateur sur la vue demandée, même hors du top. `null` si la fonction n'existe pas
 * encore côté base : l'appelant retombe sur la liste chargée.
 */
export async function getMyLeaderboardRank(metric = "watch_time", period = "all") {
  const { data, error } = await supabase.rpc("get_my_leaderboard_rank", { p_metric: metric, p_period: period });
  if (error) {
    console.warn("[leaderboard] get_my_leaderboard_rank:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    rank: row.rank == null ? null : Number(row.rank),
    totalMembers: Number(row.total_members || 0),
    totalWatchSeconds: Math.round(row.my_secs || 0),
    totalEpisodes: Number(row.my_eps || 0),
    totalAnimes: Number(row.my_animes || 0),
    aboveValue: row.above_value == null ? null : Number(row.above_value),
  };
}
