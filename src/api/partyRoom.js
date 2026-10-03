import { supabase } from "@/lib/supabase";

/** État persisté pour la relève d'hôte. Un échec ne casse jamais le salon. */

export async function savePartyRoomState(code, { hostClientId, current, queue, playback, options }) {
  try {
    await supabase.rpc("party_room_save_state", {
      p_code: code,
      p_host_client_id: hostClientId,
      p_current: current ?? null,
      p_queue: queue ?? [],
      p_playback: playback ?? { currentTime: 0, isPlaying: false },
      p_options: options ?? {},
    });
  } catch (_) {}
}

export async function getPartyRoomState(code) {
  try {
    const { data, error } = await supabase.rpc("party_room_get_state", { p_code: code });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      current: row.current ?? null,
      queue: Array.isArray(row.queue) ? row.queue : [],
      playback: row.playback || { currentTime: 0, isPlaying: false },
      options: row.options || {},
      updatedAt: row.updated_at,
    };
  } catch (_) {
    return null;
  }
}

export async function closePartyRoom(code) {
  try {
    await supabase.rpc("party_room_close", { p_code: code });
  } catch (_) {}
}
