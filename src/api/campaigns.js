import { supabase } from "@/lib/supabase";

/** Éligibilité, unicité et cumul du premium sont décidés côté serveur. */

export const CURRENT_CAMPAIGN = "milestone_3k";

/**
 * @returns {Promise<null|{campaign,title,message,tier,durationDays,closesAt,claimed,claimedAt,available,reason}>}
 * `null` si indisponible.
 */
export async function getCampaignStatus(campaign = CURRENT_CAMPAIGN) {
  try {
    const { data, error } = await supabase.rpc("get_campaign_status", { p_campaign: campaign });
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Les refus attendus remontent en `error`, pour que l'UI les explique.
 * @returns {Promise<{ok:true,tier,until,lifetime}|{ok:false,error:string}>}
 */
export async function claimCampaign(campaign = CURRENT_CAMPAIGN) {
  try {
    const { data, error } = await supabase.rpc("claim_campaign", { p_campaign: campaign });
    if (error) {
      // Postgres renvoie le code dans le message (« raise exception 'already_claimed' »).
      const brut = error.message || "";
      const connu = [
        "already_claimed",
        "campaign_closed",
        "guest_not_eligible",
        "account_too_recent",
        "unknown_campaign",
        "unauthenticated",
      ].find((c) => brut.includes(c));
      return { ok: false, error: connu || "unknown" };
    }
    return data?.ok ? data : { ok: false, error: "unknown" };
  } catch (e) {
    return { ok: false, error: e?.message || "unknown" };
  }
}

export function messageRefus(code) {
  switch (code) {
    case "already_claimed":
      return "Ce cadeau a déjà été réclamé sur ce compte.";
    case "campaign_closed":
      return "L'offre est terminée. Merci d'avoir été là !";
    case "guest_not_eligible":
      return "Le mode visiteur ne permet pas de réclamer — crée un compte pour en profiter.";
    case "account_too_recent":
      return "Ce cadeau est réservé aux comptes créés avant l'annonce. Merci de nous avoir rejoints !";
    default:
      return "Impossible de réclamer pour le moment. Réessaie dans un instant.";
  }
}
