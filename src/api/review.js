import { supabase } from "@/lib/supabase";
import { platform } from "@/platform";

/**
 * Avis sur Nartya (migration 20261028180000) : un seul par compte, toutes apps confondues.
 * Répondre ici fait disparaître la demande dans Movies, FM, le Hub et les apps mobiles.
 */

/** `true` si le compte n'a encore donné d'avis dans aucune app. */
export async function isReviewPending() {
  const { data, error } = await supabase.rpc("app_review_pending");
  if (error) throw error;
  return data === true;
}

/** « Plus tard » : plus de demande pendant 7 jours, dans aucune app. */
export async function snoozeReview() {
  const { error } = await supabase.rpc("snooze_app_review");
  if (error) throw error;
}

/** @param {{ rating: number, comment?: string }} p */
export async function submitReview({ rating, comment }) {
  let version = null;
  try {
    version = (await platform.getVersion()) || null;
  } catch {
    /* version inconnue : l'avis part sans */
  }
  const { error } = await supabase.rpc("submit_app_review", {
    p_rating: rating,
    p_comment: comment || null,
    p_app: "nartya-anime",
    p_platform: platform.os || platform.name || null,
    p_version: version,
  });
  if (error) throw error;
}
