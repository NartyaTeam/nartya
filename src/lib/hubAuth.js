/** Sur le bureau, la session appartient au Hub : l'app ne fait que refléter la session partagée. */

import { platform } from "@/platform";
import { SITE_URL } from "@/config/instance";

export const HUB_DOWNLOAD_URL = `${SITE_URL}/`;

export const authOwnedByHub = () => platform.isDesktop;

/** `method === "website"` : hub introuvable, à traiter comme un échec par qui comptait sur lui. */
export async function openHub(hubPresent = true) {
  if (!hubPresent) {
    platform.openExternal(HUB_DOWNLOAD_URL);
    return { success: true, method: "website" };
  }
  const api = platform.hub;
  if (!api?.open) {
    // Preload d'une version antérieure encore en mémoire.
    return { success: false, method: null, stale: true };
  }
  try {
    return (await api.open()) || { success: false, method: null };
  } catch {
    return { success: false, method: null };
  }
}

export function quitApp() {
  platform.quit();
}

export async function getHubInfo() {
  try {
    return (await platform.hub?.getInfo?.()) ?? null;
  } catch {
    return null;
  }
}
