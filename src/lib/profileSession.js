/**
 * Profil (façon Netflix) ouvert dans cette fenêtre. Le jeton remis par `enter_account_profile`
 * part dans l'en-tête `x-nartya-profile` de chaque requête PostgREST : la base range alors les
 * sauvegardes (favoris, listes, progression, notes) dans ce profil.
 *
 * `sessionStorage` : le jeton survit à un rechargement mais pas à la fermeture de l'app. Au
 * lancement suivant, le dernier profil utilisé (`localStorage`) est rouvert s'il a servi il y a
 * moins de `REMEMBER_MS` ; sinon « Qui est là ? ».
 */

const KEY = "nartya-profile-session";
const LAST_KEY = "nartya-last-profile";
const PICK_KEY = "nartya-profile-pick";
/** Au-delà de 12 h sans utiliser l'app, on redemande quel profil ouvrir. */
export const REMEMBER_MS = 12 * 60 * 60 * 1000;
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

// ---------- dernier profil utilisé ----------

/** Note le profil ouvert et l'heure : rappelé régulièrement tant que l'app est ouverte. */
export function rememberProfile(accountId = current?.accountId, profileId = current?.profile?.id) {
  if (!accountId || !profileId) return;
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ accountId, profileId, at: Date.now() }));
  } catch {
    /* stockage indisponible : « Qui est là ? » au prochain lancement */
  }
}

/** Id du profil à rouvrir sans demander, ou null si trop ancien / autre compte. */
export function recentProfileId(accountId, now = Date.now()) {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
    if (last?.accountId !== accountId || !last.profileId) return null;
    const age = now - Number(last.at);
    return age >= 0 && age < REMEMBER_MS ? last.profileId : null;
  } catch {
    return null;
  }
}

/** Profil à ouvrir sans passer par « Qui est là ? » : le seul du compte, ou le dernier utilisé.
 * Jamais un profil protégé par un code ni un profil verrouillé. */
export function profileToAutoOpen(profiles, accountId, now = Date.now()) {
  const usable = (p) => p && !p.has_pin && !p.locked;
  if (profiles.length === 1) return usable(profiles[0]) ? profiles[0] : null;
  const id = recentProfileId(accountId, now);
  const p = id ? profiles.find((x) => x.id === id) : null;
  return usable(p) ? p : null;
}

export function forgetRememberedProfile() {
  try {
    localStorage.removeItem(LAST_KEY);
  } catch {
    /* rien à effacer */
  }
}

/** « Changer de profil » : le prochain chargement montre l'écran de choix, sans ouverture auto. */
export function requestProfilePick() {
  try {
    sessionStorage.setItem(PICK_KEY, "1");
  } catch {
    /* sans stockage, l'écran s'affiche de toute façon : la session est vidée */
  }
}

/** Lit et consomme la demande. */
export function takeProfilePickRequest() {
  try {
    const asked = sessionStorage.getItem(PICK_KEY) === "1";
    sessionStorage.removeItem(PICK_KEY);
    return asked;
  } catch {
    return false;
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
