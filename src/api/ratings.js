import { supabase } from "@/lib/supabase";

const normalize = (row = {}) => ({
  average: row.average_rating == null ? null : Number(row.average_rating),
  count: Number(row.ratings_count || 0),
  mine: row.my_rating == null ? null : Number(row.my_rating),
});

export async function getAnimeRatingSummary(slug) {
  const { data, error } = await supabase.rpc("get_anime_rating_summary", { p_slug: slug });
  if (error) throw error;
  return normalize(data?.[0]);
}

export async function saveAnimeRating(slug, rating) {
  const { data, error } = await supabase.rpc("upsert_anime_rating", {
    p_slug: slug,
    p_rating: rating,
  });
  if (error) throw error;
  return Number(data);
}

export async function removeAnimeRating(slug) {
  const { data, error } = await supabase.rpc("delete_anime_rating", { p_slug: slug });
  if (error) throw error;
  return !!data;
}

export function ratingErrorMessage(error) {
  const messages = {
    note_invalide: "Choisis une note entre 1 et 5 étoiles.",
    cible_invalide: "Cette fiche ne peut pas encore être notée.",
    guest_not_allowed: "Crée un compte pour noter cet anime.",
    account_banned: "Ton compte ne peut pas publier de note.",
    account_too_recent: "Ton compte est trop récent — réessaie dans quelques minutes.",
    forbidden: "Connecte-toi pour noter cet anime.",
  };
  return messages[(error?.message || "").trim()] || "La note n’a pas pu être enregistrée.";
}
