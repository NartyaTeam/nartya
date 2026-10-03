import { supabase } from "@/lib/supabase";

/**
 * `friendships` n'est accessible que par RPC. Les objets gardent les clés des profils
 * (`avatar_custom`, `premium_tier`…) pour `resolveAvatar` et les helpers premium.
 */

const FRIEND_ERRORS = {
  introuvable: "Ce membre est introuvable.",
  soi_meme: "Tu ne peux pas t'ajouter toi-même.",
  deja_amis: "Vous êtes déjà amis.",
  demande_existante: "Demande déjà envoyée.",
  forbidden: "Session expirée, reconnecte-toi.",
};

/** `.code` = clé courte. */
function friendError(error) {
  const key = (error?.message || "").trim();
  const e = new Error(FRIEND_ERRORS[key] || "Une erreur est survenue. Réessaie.");
  e.code = key;
  return e;
}

function mapProfile(r) {
  return {
    id: r.id,
    handle: r.handle,
    username: r.username,
    avatar: r.avatar,
    avatar_custom: r.avatar_custom,
    accent_color: r.accent_color,
    premium_tier: r.premium_tier || null,
    premium_until: r.premium_until || null,
    role: r.role,
    ambient_theme: r.ambient_theme || null,
  };
}

export async function searchUsers(query, lim = 12) {
  const { data, error } = await supabase.rpc("search_users", { p_query: query, lim });
  if (error) throw friendError(error);
  return (data || []).map((r) => ({ ...mapProfile(r), relation: r.relation }));
}

/** 'pending' | 'accepted' */
export async function sendFriendRequest(handle) {
  const { data, error } = await supabase.rpc("send_friend_request", { p_handle: handle });
  if (error) throw friendError(error);
  return data?.status || "pending";
}

/** `requesterId` = l'expéditeur. */
export async function respondFriendRequest(requesterId, accept) {
  const { data, error } = await supabase.rpc("respond_friend_request", {
    p_requester: requesterId,
    p_accept: accept,
  });
  if (error) throw friendError(error);
  return data?.status || null;
}

/** Retire un ami ou annule une demande envoyée. */
export async function removeFriend(otherId) {
  const { error } = await supabase.rpc("remove_friend", { p_other: otherId });
  if (error) throw friendError(error);
}

export async function listFriends() {
  const { data, error } = await supabase.rpc("list_friends");
  if (error) throw friendError(error);
  return (data || []).map((r) => ({ ...mapProfile(r), since: r.since, lastActive: r.last_active }));
}

export async function listFriendRequests() {
  const { data, error } = await supabase.rpc("list_friend_requests");
  if (error) throw friendError(error);
  const incoming = [];
  const outgoing = [];
  for (const r of data || []) {
    const item = { ...mapProfile(r), requestedAt: r.requested_at };
    (r.direction === "incoming" ? incoming : outgoing).push(item);
  }
  return { incoming, outgoing };
}

export async function countPendingRequests() {
  const { data, error } = await supabase.rpc("count_pending_friend_requests");
  if (error) throw friendError(error);
  return Number(data || 0);
}
