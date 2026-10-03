import { SITE_URL } from "../config/instance.js";

export const DEFAULT_UPDATE_PAGE = SITE_URL;

/** Le loopback HTTP n'est toléré que pour les essais sur émulateur. */
export function safeUpdateUrl(value, fallback = DEFAULT_UPDATE_PAGE) {
  try {
    const parsed = new URL(String(value || ""));
    const localLoopback =
      parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
    if (parsed.protocol === "https:" || localLoopback) return parsed.toString();
  } catch (_) {}
  return fallback;
}

/**
 * Une ancienne API répond la politique desktop à toute cible inconnue, ce qui bloquerait
 * l'iPhone : iOS n'obéit qu'à une politique explicitement iOS.
 */
export function policyAppliesTo(target, policy) {
  if (!policy) return false;
  return target !== "ios" || policy.platform === "ios";
}

export function updateTargetForPlatform(currentPlatform) {
  if (currentPlatform?.name === "capacitor-android") return "android";
  if (currentPlatform?.name === "capacitor-ios") return "ios";
  return "desktop";
}
