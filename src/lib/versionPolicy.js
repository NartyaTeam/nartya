/**
 * Échec ouvert : API injoignable ou réponse illisible, on laisse passer. L'écran bloquant
 * propose toujours une issue.
 */
import { getApiBaseUrl } from "@/config/config";
import { compareVersions, isUsableVersion } from "./semver";
import { policyAppliesTo } from "./appUpdate";

/** `"ok"` couvre aussi tous les cas d'échec. */
export async function checkVersionPolicy(currentVersion, { target = "desktop" } = {}) {
  const ok = { status: "ok" };
  if (!isUsableVersion(currentVersion)) return ok;

  let policy;
  try {
    const normalizedTarget = target === "android" || target === "ios" ? target : "desktop";
    const query = new URLSearchParams({ platform: normalizedTarget });
    const res = await fetch(`${getApiBaseUrl()}/version-policy?${query}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return ok;
    policy = (await res.json())?.data;
  } catch {
    return ok;
  }
  if (!policyAppliesTo(target, policy)) return ok;

  const { minSupported, latest, message, downloadUrl, sha256 } = policy;

  if (isUsableVersion(minSupported) && compareVersions(currentVersion, minSupported) < 0) {
    return { status: "blocked", latest, message, downloadUrl, sha256 };
  }
  if (isUsableVersion(latest) && compareVersions(currentVersion, latest) < 0) {
    return { status: "outdated", latest, message, downloadUrl, sha256 };
  }
  return ok;
}
