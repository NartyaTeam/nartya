/**
 * Profil (façon Netflix) ouvert dans cette fenêtre. Le jeton remis par `enter_account_profile`
 * part dans l'en-tête `x-nartya-profile` de chaque requête PostgREST : la base range alors les
 * sauvegardes (favoris, listes, progression, notes) dans ce profil.
 *
 * `sessionStorage` : le choix survit à un rechargement (changement de profil) mais pas à la
 * fermeture de l'app, qui redemande « Qui est là ? » au lancement suivant.
 */

const KEY = "nartya-profile-session";
const expiredListeners = new Set();

function read() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return s?.accountId && s?.token && s?.profile?.id ? s : null;
  } catch {
    return null;
  }
}

let current = read();

/** `{ accountId, token, profile }` si un profil de ce compte est ouvert. */
export function profileSessionFor(accountId) {
  return accountId && current?.accountId === accountId ? current : null;
}

export function profileToken() {
  return current?.token ?? null;
}

/** Propriétaire des sauvegardes : le profil ouvert, sinon le compte (profil principal). */
export function dataOwnerId(accountId) {
  return profileSessionFor(accountId)?.profile.id ?? accountId;
}

export function setProfileSession(session) {
  current = session;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* stockage indisponible : le profil vaut pour cette page seulement */
  }
}

/** Met à jour le nom / l'avatar du profil ouvert après une modification. */
export function updateOpenProfile(profile) {
  if (current?.profile?.id !== profile?.id) return;
  setProfileSession({ ...current, profile });
}

export function clearProfileSession() {
  current = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* rien à effacer */
  }
}

export function onProfileSessionExpired(listener) {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

/** La base a refusé le jeton (expiré, code ajouté ailleurs, profil supprimé). */
export function notifyProfileSessionExpired() {
  for (const listener of expiredListeners) listener();
}

/** `fetch` du client Supabase : ajoute le jeton aux requêtes de données, repère son refus. */
export async function profileAwareFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url ?? "";
  const isData = url.includes("/rest/v1/");
  const token = isData ? profileToken() : null;
  if (token) {
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-nartya-profile", token);
    init = { ...init, headers };
  }
  const res = await fetch(input, init);
  if (isData && res.status === 403) {
    const body = await res
      .clone()
      .text()
      .catch(() => "");
    if (body.includes("profile_session_expired")) notifyProfileSessionExpired();
  }
  return res;
}
