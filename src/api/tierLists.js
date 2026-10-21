import { supabase } from "@/lib/supabase";

/** Cible des commentaires d'une tier list. */
export const tierListTarget = (id) => ({ kind: "tierlist", key: String(id || "") });

function author(r) {
  return {
    id: r.user_id,
    handle: r.handle,
    username: r.username,
    avatar: r.avatar,
    avatar_custom: r.avatar_custom,
    accent_color: r.accent_color,
    premium_tier: r.premium_tier,
    role: r.role,
  };
}

function normalizeSummary(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description || "",
    isPublic: !!r.is_public,
    itemCount: Number(r.item_count || 0),
    preview: Array.isArray(r.preview) ? r.preview : [],
    tierMeta: Array.isArray(r.tier_meta) ? r.tier_meta : [],
    likes: Number(r.likes_count || 0),
    dislikes: Number(r.dislikes_count || 0),
    comments: Number(r.comments_count || 0),
    myVote: Number(r.my_vote || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
    author: author(r),
  };
}

/** `sort` : "popular" | "recent" | "mine" | "user" (avec `userId`). */
export async function listTierLists({ sort = "popular", userId = null, query = "", offset = 0, limit = 24 } = {}) {
  const { data, error } = await supabase.rpc("list_tier_lists", {
    p_sort: sort,
    p_user: userId,
    p_query: query?.trim() || null,
    p_offset: offset,
    lim: limit,
  });
  if (error) throw error;
  return (data || []).map(normalizeSummary);
}

/** `null` si elle n'existe pas ou n'est pas visible. */
export async function getTierList(id) {
  const { data, error } = await supabase.rpc("get_tier_list", { p_id: id });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) return null;
  return {
    ...normalizeSummary(r),
    tiers: Array.isArray(r.tiers) ? r.tiers : [],
    pool: Array.isArray(r.pool) ? r.pool : [],
    forkedFrom: r.forked_from ? { id: r.forked_from, title: r.forked_from_title } : null,
    isMine: !!r.is_mine,
    canModerate: !!r.can_moderate,
  };
}

/** Renvoie l'id (nouveau ou existant). */
export async function saveTierList({ id = null, title, description, tiers, pool = [], isPublic, forkedFrom = null }) {
  const { data, error } = await supabase.rpc("save_tier_list", {
    p_id: id,
    p_title: title,
    p_description: description || null,
    p_tiers: tiers,
    p_pool: pool,
    p_public: !!isPublic,
    p_forked_from: forkedFrom,
  });
  if (error) throw error;
  return data;
}

export async function deleteTierList(id) {
  const { error } = await supabase.rpc("delete_tier_list", { p_id: id });
  if (error) throw error;
}

/** `value` : 1, -1, ou 0 pour retirer son vote. */
export async function voteTierList(id, value) {
  const { data, error } = await supabase.rpc("vote_tier_list", { p_id: id, p_value: value });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  return { likes: Number(r?.likes_count || 0), dislikes: Number(r?.dislikes_count || 0), myVote: Number(r?.my_vote || 0) };
}

export function tierListErrorMessage(err) {
  const map = {
    titre_vide: "Donne un titre à ta tier list.",
    titre_trop_long: "Le titre dépasse 80 caractères.",
    description_trop_longue: "La description dépasse 500 caractères.",
    rangees_invalides: "Il faut entre 1 et 10 rangées.",
    trop_d_oeuvres: "Une tier list peut contenir 400 animes au maximum.",
    doublon_oeuvre: "Un anime est présent deux fois.",
    liste_vide: "Classe au moins un anime avant de publier.",
    mot_interdit: "Le titre, la description ou une rangée contient un terme interdit.",
    trop_de_listes: "Tu as atteint 100 tier lists. Supprimes-en une pour en créer une autre.",
    quota_journalier: "Tu as créé beaucoup de tier lists aujourd'hui — réessaie demain.",
    quota_horaire: "Tu as créé 5 tier lists cette heure-ci — réessaie un peu plus tard.",
    quota_publication: "Tu as publié 10 tier lists aujourd'hui — réessaie demain, ou garde-la en brouillon.",
    titre_deja_publie: "Tu as déjà publié une tier list avec ce titre aujourd'hui.",
    lien_interdit: "Les liens ne sont pas autorisés dans une tier list.",
    trop_rapide: "Doucement — attends quelques secondes avant de recommencer.",
    propre_liste: "Tu ne peux pas voter pour ta propre tier list.",
    introuvable: "Cette tier list n'existe plus.",
    guest_not_allowed: "Crée un compte pour utiliser les tier lists.",
    account_banned: "Ton compte ne peut pas faire ça.",
    forbidden: "Action non autorisée.",
  };
  return map[(err?.message || "").trim()] || "Une erreur est survenue. Réessaie.";
}
