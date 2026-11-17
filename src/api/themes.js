import { supabase } from "@/lib/supabase";
import { validateTheme } from "@/lib/themeFormat";

const ERRORS = {
  guest_not_allowed: "Crée un compte pour publier un thème.",
  account_banned: "Ton compte ne peut pas publier.",
  theme_limite: "Tu as déjà 5 thèmes publiés : retire-en un pour en publier un autre.",
  theme_trop_rapide: "3 thèmes par jour au maximum, réessaie demain.",
  theme_introuvable: "Ce thème n'existe plus.",
  theme_invalide: "Thème invalide.",
  theme_couleur_invalide: "Une des couleurs est invalide.",
  theme_nom_invalide: "Donne un nom d'au moins 2 caractères.",
};

export function themeErrorMessage(e) {
  const code = String(e?.message || e || "");
  const known = Object.keys(ERRORS).find((k) => code.includes(k));
  return known ? ERRORS[known] : "Une erreur est survenue, réessaie.";
}

/** Un thème reçu du serveur est revalidé : une ligne corrompue ou ancienne est écartée. */
function normalize(r) {
  const checked = validateTheme({ ...r.data, name: r.name, description: r.description }, { requireReadable: false });
  if (!checked.ok) return null;
  return {
    ...checked.theme,
    id: r.id,
    installs: Number(r.installs || 0),
    createdAt: r.created_at,
    installed: !!r.installed,
    author: {
      id: r.author_id,
      handle: r.handle,
      username: r.username,
      avatar: r.avatar,
      avatarCustom: r.avatar_custom,
    },
  };
}

/** `sort` : "popular" | "recent" | "mine". */
export async function listThemes({ sort = "popular", query = "", offset = 0, limit = 24 } = {}) {
  const { data, error } = await supabase.rpc("list_themes", {
    p_sort: sort,
    p_query: query?.trim() || null,
    p_offset: offset,
    lim: limit,
  });
  if (error) throw error;
  return (data || []).map(normalize).filter(Boolean);
}

/** Retourne l'id du thème. `id` : mise à jour d'un thème à soi. */
export async function publishTheme(theme, id = null) {
  const { data, error } = await supabase.rpc("publish_theme", {
    p_name: theme.name,
    p_description: theme.description || "",
    p_data: { v: theme.v, colors: theme.colors, grain: theme.grain },
    p_id: id,
  });
  if (error) throw error;
  return data;
}

export async function recordThemeInstall(id) {
  const { error } = await supabase.rpc("record_theme_install", { p_id: id });
  if (error) throw error;
}

export async function removeTheme(id) {
  const { error } = await supabase.rpc("remove_theme", { p_id: id });
  if (error) throw error;
}
