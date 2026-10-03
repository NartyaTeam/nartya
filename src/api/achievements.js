import { supabase } from "@/lib/supabase";
import { isGuestSession } from "@/lib/guest";

/**
 * Les paliers sont attribués côté serveur.
 * @returns {Promise<{trustedSeconds:number, nightEpisodes:number, bestDayEpisodes:number,
 * completedSeasons:number, unlocked:Record<string,string>}>}
 */
export async function getAchievements() {
  const empty = {
    trustedSeconds: 0,
    nightEpisodes: 0,
    bestDayEpisodes: 0,
    completedSeasons: 0,
    unlocked: {},
  };
  if (isGuestSession()) return empty;
  const { data, error } = await supabase.rpc("get_achievements");
  if (error) {
    console.warn("[achievements] get_achievements:", error.message);
    return empty;
  }
  return {
    trustedSeconds: Number(data?.trustedSeconds || 0),
    nightEpisodes: Number(data?.nightEpisodes || 0),
    bestDayEpisodes: Number(data?.bestDayEpisodes || 0),
    completedSeasons: Number(data?.completedSeasons || 0),
    unlocked: data?.unlocked || {},
  };
}
