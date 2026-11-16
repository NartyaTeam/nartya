import { supabase } from "@/lib/supabase";

const EMPTY_PLAYBACK = { currentTime: 0, isPlaying: false };

/**
 * Appels de base demandés par le moteur (effet `rpc`). Un échec ne casse jamais le salon : le
 * moteur reçoit `ok: false` et décide.
 */
export async function partyRpc(name, args = {}) {
  try {
    switch (name) {
      case "get_state": {
        const { data, error } = await supabase.rpc("party_room_get_state", { p_code: args.code });
        if (error) return { ok: false };
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return { ok: true, data: null };
        return {
          ok: true,
          data: {
            current: row.current ?? null,
            queue: Array.isArray(row.queue) ? row.queue : [],
            playback: row.playback || EMPTY_PLAYBACK,
            options: row.options || {},
          },
        };
      }
      case "save_state": {
        const { error } = await supabase.rpc("party_room_save_state", {
          p_code: args.code,
          p_host_client_id: args.hostClientId,
          p_current: args.current ?? null,
          p_queue: args.queue ?? [],
          p_playback: args.playback ?? EMPTY_PLAYBACK,
          p_options: args.options ?? {},
        });
        return { ok: !error };
      }
      case "close": {
        const { error } = await supabase.rpc("party_room_close", { p_code: args.code });
        return { ok: !error };
      }
      case "publish": {
        const { error } = await supabase.rpc("party_room_publish", {
          p_code: args.code,
          p_public: !!args.public,
          p_participants: args.participants,
        });
        return { ok: !error };
      }
      default:
        return { ok: false };
    }
  } catch (_) {
    return { ok: false };
  }
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
