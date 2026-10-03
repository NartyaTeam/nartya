import { supabase } from "@/lib/supabase";

/** Sécurité, quotas et cooldowns sont décidés côté serveur : ne jamais les dupliquer ici. */

export const animeTarget = (slug) => ({ kind: "anime", key: String(slug || "") });

function normalize(r) {
  return {
    id: r.id,
    body: r.body || "",
    isSpoiler: !!r.is_spoiler,
    likes: Number(r.likes_count || 0),
    replies: Number(r.replies_count || 0),
    likedByMe: !!r.liked_by_me,
    editedAt: r.edited_at || null,
    deletedAt: r.deleted_at || null,
    createdAt: r.created_at,
    canModerate: !!r.can_moderate,
    animeRating: r.anime_rating == null ? null : Number(r.anime_rating),
    author: {
      id: r.user_id,
      handle: r.handle,
      username: r.username,
      avatar: r.avatar,
      avatar_custom: r.avatar_custom,
      accent_color: r.accent_color,
      premium_tier: r.premium_tier,
      premium_until: r.premium_until,
      role: r.role,
      rankBadge: r.rank_badge == null ? null : Number(r.rank_badge),
      // Déjà filtré par palier côté serveur.
      cosmetic_ornament: r.cosmetic_ornament,
    },
  };
}

/** `cursor` = { createdAt, id } de la dernière ligne reçue, null pour la première page. */
export async function listComments(target, cursor = null, limit = 15) {
  const { data, error } = await supabase.rpc("list_comments", {
    p_kind: target.kind,
    p_key: target.key,
    p_before_at: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
    lim: limit,
  });
  if (error) throw error;
  return (data || []).map(normalize);
}

export async function listReplies(parentId, limit = 20, offset = 0) {
  const { data, error } = await supabase.rpc("list_comment_replies", {
    p_parent: parentId,
    lim: limit,
    off: offset,
  });
  if (error) throw error;
  return (data || []).map(normalize);
}

export async function countComments(target) {
  const { data, error } = await supabase.rpc("count_comments", {
    p_kind: target.kind,
    p_key: target.key,
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function postComment(target, body, { parentId = null, spoiler = false } = {}) {
  const { data, error } = await supabase.rpc("post_comment", {
    p_kind: target.kind,
    p_key: target.key,
    p_body: body,
    p_parent: parentId,
    p_spoiler: spoiler,
  });
  if (error) throw error;
  return data;
}

export async function editComment(id, body, spoiler = null) {
  const { error } = await supabase.rpc("edit_comment", {
    p_id: id,
    p_body: body,
    p_spoiler: spoiler,
  });
  if (error) throw error;
}

export async function deleteComment(id) {
  const { error } = await supabase.rpc("delete_comment", { p_id: id });
  if (error) throw error;
}

/** true = liké. */
export async function toggleCommentLike(id) {
  const { data, error } = await supabase.rpc("toggle_comment_like", { p_id: id });
  if (error) throw error;
  return !!data;
}

/** `false` si ce membre avait déjà signalé ce message. */
export async function reportComment(id, reason) {
  const { data, error } = await supabase.rpc("report_comment", { p_id: id, p_reason: reason });
  if (error) throw error;
  return data !== false;
}

export function commentErrorMessage(err) {
  const m = (err?.message || "").trim();
  const cd = m.match(/^cooldown:(\d+)$/);
  if (cd) return `Doucement — attends ${cd[1]} s avant de reposter.`;
  const map = {
    message_vide: "Ton message est trop court.",
    message_trop_long: "Ton message dépasse 1500 caractères.",
    mot_interdit: "Ton message contient un terme interdit.",
    doublon: "Tu viens déjà de poster ce message ici.",
    quota_horaire: "Tu as atteint la limite de messages pour cette heure.",
    quota_journalier: "Tu as atteint la limite de messages pour aujourd'hui.",
    quota_signalements: "Tu as signalé beaucoup de messages aujourd'hui — réessaie demain.",
    trop_de_fils: "Tu as déjà ouvert plusieurs discussions sur ce titre — réponds plutôt à l'une d'elles.",
    parent_invalide: "Ce message n'existe plus.",
    introuvable: "Ce message n'existe plus.",
    cible_invalide: "Cible de commentaire invalide.",
    guest_not_allowed: "Crée un compte pour participer aux commentaires.",
    account_banned: "Ton compte ne peut pas commenter.",
    account_too_recent: "Ton compte est trop récent pour commenter — réessaie dans quelques minutes.",
    forbidden: "Action non autorisée.",
  };
  return map[m] || "Une erreur est survenue. Réessaie.";
}
