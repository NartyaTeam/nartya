import { supabase } from "@/lib/supabase";
import { API_CONFIG } from "@/config/config";

/** Profils du compte : `{ limit, active, profiles: [{ id, name, avatar_id, avatar_url, is_main, has_pin, locked }] }`. */
export async function listAccountProfiles() {
  const { data, error } = await supabase.rpc("list_account_profiles");
  if (error) throw error;
  return data;
}

/** `{ ok: true, token, profile }` ou `{ ok: false, error, retry_after }` (code faux, bloqué…). */
export async function enterAccountProfile(id, pin = null) {
  const { data, error } = await supabase.rpc("enter_account_profile", { p_profile: id, p_pin: pin });
  if (error) throw error;
  return data;
}

/** Même réponse que l'entrée, sans ouvrir le profil (édition d'un profil protégé). */
export async function checkAccountProfilePin(id, pin) {
  const { data, error } = await supabase.rpc("check_account_profile_pin", { p_profile: id, p_pin: pin });
  if (error) throw error;
  return data;
}

export async function leaveAccountProfile() {
  await supabase.rpc("leave_account_profile");
}

export async function createAccountProfile({ name, avatarId = null, pin = null }) {
  const { data, error } = await supabase.rpc("create_account_profile", {
    p_name: name,
    p_avatar: avatarId,
    p_pin: pin,
  });
  if (error) throw error;
  return data;
}

/** `pin` : code actuel, exigé pour un profil protégé qui n'est pas celui ouvert ici. */
export async function updateAccountProfile(id, { name, avatarId }, pin = null) {
  const { data, error } = await supabase.rpc("update_account_profile", {
    p_profile: id,
    p_name: name,
    p_avatar: avatarId,
    p_pin: pin,
  });
  if (error) throw error;
  return data;
}

/** `newPin` null : retire le code. */
export async function setAccountProfilePin(id, newPin, currentPin = null) {
  const { data, error } = await supabase.rpc("set_account_profile_pin", {
    p_profile: id,
    p_new_pin: newPin,
    p_current_pin: currentPin,
  });
  if (error) throw error;
  return data;
}

export async function deleteAccountProfile(id, pin = null) {
  const { error } = await supabase.rpc("delete_account_profile", { p_profile: id, p_pin: pin });
  if (error) throw error;
}

export async function listProfileAvatars() {
  const { data, error } = await supabase
    .from("profile_avatars")
    .select("id, category, label, image_url")
    .order("category")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

/** Code de profil oublié : un code à 6 chiffres part à l'adresse e-mail du compte → `{ email }` (masquée). */
export async function requestProfilePinReset(id) {
  // Toujours l'API de prod, même en dev : l'envoi d'e-mail (SMTP) n'existe que là.
  const { data: auth } = await supabase.auth.getSession();
  const res = await fetch(`${API_CONFIG.PROD_BASE_URL}/v1/me/profiles/${id}/pin-reset`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth?.session?.access_token ?? ""}` },
    body: "{}",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `API ${res.status}`);
  return json.data;
}

/** Code reçu par e-mail, vérifié dès sa saisie → `{ ok }` ou `{ ok: false, error }`. */
export async function checkProfilePinResetCode(id, code) {
  const { data, error } = await supabase.rpc("check_profile_pin_reset_code", { p_profile: id, p_code: code });
  if (error) throw error;
  return data;
}

/** `{ ok: true, profile }` ou `{ ok: false, error: "code_invalid" | "code_expired" }`. */
export async function confirmProfilePinReset(id, code, newPin) {
  const { data, error } = await supabase.rpc("reset_account_profile_pin", {
    p_profile: id,
    p_code: code,
    p_new_pin: newPin,
  });
  if (error) throw error;
  return data;
}

export function profileErrorMessage(error) {
  const code = (typeof error === "string" ? error : error?.message || "").trim();
  const messages = {
    profile_limit: "Tu as atteint le nombre maximum de profils pour ton forfait.",
    name_invalid: "Choisis un nom de 1 à 20 caractères.",
    name_taken: "Un autre profil porte déjà ce nom.",
    pin_format: "Le code doit contenir 4 chiffres.",
    pin_required: "Ce profil est protégé par un code.",
    pin_invalid: "Code incorrect.",
    pin_locked: "Trop d'essais. Réessaie dans quelques minutes.",
    profile_locked: "Ce profil dépasse le nombre inclus dans ton forfait. Passe à Nartya + pour l'ouvrir.",
    profile_not_found: "Ce profil n'existe plus.",
    main_profile: "Le profil principal ne peut pas être supprimé.",
    avatar_invalid: "Cet avatar n'est plus disponible.",
    guest: "Crée un compte pour ajouter des profils.",
    banned: "Ton compte ne peut plus modifier ses profils.",
    code_invalid: "Code incorrect. Vérifie l'e-mail reçu.",
    code_expired: "Ce code a expiré ou a été trop essayé. Demande-en un nouveau.",
    rate_limited: "Un code vient d'être envoyé. Patiente une minute (5 envois par heure au maximum).",
    no_email: "Ton compte n'a pas d'adresse e-mail. Ajoute-en une dans Nartya Hub › Compte pour recevoir le code.",
    mail_failed: "L'e-mail n'a pas pu être envoyé. Réessaie dans un instant.",
  };
  return messages[code] || "Une erreur est survenue. Réessaie dans un instant.";
}
