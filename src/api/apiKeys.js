import { supabase } from "@/lib/supabase";

const ERRORS = {
  trop_de_cles: "Tu as déjà 5 clés actives : révoque-en une d'abord.",
  nom_requis: "Donne un nom à la clé.",
  guest_not_allowed: "Crée un compte pour générer une clé.",
  discord_requis: "Lie un compte Discord pour générer une clé.",
  account_banned: "Compte suspendu.",
};

function readableError(error) {
  const key = Object.keys(ERRORS).find((k) => error?.message?.includes(k));
  return new Error(key ? ERRORS[key] : "Opération impossible, réessaie plus tard.");
}

/** [{ id, name, prefix, created_at, last_used_at }] */
export async function listApiKeys() {
  const { data, error } = await supabase.rpc("list_my_api_keys");
  if (error) throw readableError(error);
  return data || [];
}

/** `key`, la clé en clair, n'est renvoyée qu'ici. */
export async function createApiKey(name) {
  const { data, error } = await supabase.rpc("create_api_key", { p_name: name });
  if (error) throw readableError(error);
  return data;
}

export async function revokeApiKey(id) {
  const { error } = await supabase.rpc("revoke_api_key", { p_id: id });
  if (error) throw readableError(error);
}
