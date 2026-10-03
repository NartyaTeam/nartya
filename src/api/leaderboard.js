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
