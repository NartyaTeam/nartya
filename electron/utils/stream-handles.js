/**
 * Identifiant opaque à la place de l'URL réelle dans les URL du proxy : l'URL de l'hébergeur
 * ne quitte pas le main. Pas un secret : le domaine reste visible à la connexion TLS.
 */
import crypto from "node:crypto";

// ~250 poignées par épisode et par variante HLS ; au-delà, les plus anciennes sont évincées.
const MAX_HANDLES = 20_000;

/** poignée → { url, provider, referer, origin } */
const byHandle = new Map();
/** Rejouer ne recrée pas de poignée. */
const byContent = new Map();

const contentKey = (e) => `${e.url}|${e.provider || ""}|${e.referer || ""}|${e.origin || ""}`;

/**
 * Idempotent.
 * @param {{ url: string, provider?: string|null, referer?: string, origin?: string }} target
 * @returns {string|null}
 */
export function mintHandle(target) {
  if (!target?.url || typeof target.url !== "string") return null;
  const entry = {
    url: target.url,
    provider: target.provider || null,
    referer: target.referer || "",
    origin: target.origin || "",
  };

  const key = contentKey(entry);
  const existing = byContent.get(key);
  if (existing && byHandle.has(existing)) return existing;

  const handle = crypto.randomBytes(9).toString("base64url");
  byHandle.set(handle, entry);
  byContent.set(key, handle);

  while (byHandle.size > MAX_HANDLES) {
    const oldest = byHandle.keys().next().value;
    const victim = byHandle.get(oldest);
    byHandle.delete(oldest);
    if (victim && byContent.get(contentKey(victim)) === oldest) {
      byContent.delete(contentKey(victim));
    }
  }
  return handle;
}

/** @returns {{ url: string, provider: string|null, referer: string, origin: string }|null} */
export function resolveHandle(handle) {
  if (!handle || typeof handle !== "string") return null;
  return byHandle.get(handle) || null;
}

export function clearHandles() {
  byHandle.clear();
  byContent.clear();
}
