import { supabase } from "@/lib/supabase";
import { platform } from "@/platform";

/**
 * Consulté par le support. N'y mettre ni URL de flux, ni chemin local, ni e-mail, identifiant ou
 * jeton, ni réponse serveur : un code d'événement, un message d'une ligne et des champs
 * choisis un par un.
 */

const APP = "nartya-anime";

/** Une même panne en boucle n'est journalisée qu'une fois par minute. */
const DEDUPE_MS = 60_000;
const lastSent = new Map();

let cachedVersion;
async function getAppVersion() {
  if (cachedVersion !== undefined) return cachedVersion;
  try {
    cachedVersion = (await platform.getVersion()) || null;
  } catch {
    cachedVersion = null;
  }
  return cachedVersion;
}

/**
 * Ne rejette ni ne bloque jamais : à appeler sans `await`.
 * @param {string} event code court et stable ('extract_failed', 'player_failed', …)
 * @param {{ level?: 'error'|'warn'|'info', message?: string, detail?: object }} [opts]
 */
export function logClientEvent(event, { level = "error", message = null, detail = null } = {}) {
  if (!event) return;

  const key = `${event}:${message || ""}`;
  const now = Date.now();
  if (now - (lastSent.get(key) || 0) < DEDUPE_MS) return;
  lastSent.set(key, now);

  void (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user || auth.user.is_anonymous) return;

      await supabase.rpc("log_client_event", {
        p_app: APP,
        p_event: event,
        p_level: level,
        p_message: message,
        p_detail: detail,
        p_app_version: await getAppVersion(),
        p_platform: platform.os || platform.name,
      });
    } catch {
      // RPC absente, réseau coupé ou utilisateur déconnecté : silencieux.
    }
  })();
}

/** Seuls le message et la position sont gardés, jamais la pile. */
export function installGlobalErrorLogging() {
  if (typeof window === "undefined" || window.__nartyaErrorLogging) return;
  window.__nartyaErrorLogging = true;

  window.addEventListener("error", (e) => {
    // Une ressource cassée (<img>) n'a pas de `error`.
    if (!e?.error) return;
    logClientEvent("uncaught_error", {
      message: String(e.error.message || e.message || "erreur inconnue").slice(0, 300),
      detail: { line: e.lineno ?? null, col: e.colno ?? null },
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e?.reason;
    logClientEvent("unhandled_rejection", {
      message: String(r?.message || r || "rejet inconnu").slice(0, 300),
    });
  });
}
