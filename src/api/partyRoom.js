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

/** Hôte d'un salon public : rappelé régulièrement, sinon le salon sort de la liste. */
export async function publishPartyRoom(code, isPublic, participants) {
  try {
    await supabase.rpc("party_room_publish", {
      p_code: code,
      p_public: !!isPublic,
      p_participants: participants,
    });
  } catch (_) {}
}

export async function listPublicPartyRooms() {
  const { data, error } = await supabase.rpc("party_list_public_rooms");
  if (error) throw error;
  return (data || []).map((r) => ({
    code: r.code,
    current: r.current || null,
    participants: r.participants || 1,
    createdAt: r.created_at,
    host: {
      id: r.host_id,
      username: r.host_username,
      avatar: r.host_avatar,
      avatar_custom: r.host_avatar_custom,
      premium_tier: r.host_premium_tier,
      premium_until: r.host_premium_until,
    },
  }));
}
