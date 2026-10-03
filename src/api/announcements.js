import { supabase } from "@/lib/supabase";

/**
 * La visibilité est décidée côté serveur. `markRead` retire l'annonce du compteur mais la
 * garde dans la cloche ; `dismiss` la fait disparaître.
 */

export async function getMyAnnouncements({ limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc("get_my_announcements", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  const rows = data || [];
  return {
    total: rows.length ? Number(rows[0].total_count) : 0,
    items: rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      type: a.type,
      buttons: Array.isArray(a.buttons) ? a.buttons : [],
      createdAt: a.created_at,
      isGlobal: !!a.is_global,
      authorName: a.author_name,
      authorAvatar: a.author_avatar,
      isRead: !!a.is_read,
    })),
  };
}

export async function markRead(ids) {
  if (!ids?.length) return;
  const { error } = await supabase.rpc("mark_announcements_read", { p_ids: ids });
  if (error) throw error;
}

export async function dismiss(id) {
  const { error } = await supabase.rpc("dismiss_announcement", { p_id: id });
  if (error) throw error;
}
