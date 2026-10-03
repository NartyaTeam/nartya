/**
 * Le renderer ne voit aucune URL : le processus principal résout le jeton et rend une
 * poignée opaque.
 */
import { getPrioritizedSources } from "./videoSourceUtils";
import { getAbsoluteApiBaseUrl } from "@/config/config";
import { platform } from "@/platform";
import { useSettingsStore } from "@/stores/useSettingsStore";

const DEFAULT_LANGUAGE = "vostfr";

// Les sources HLS se téléchargent plus vite que les MP4 (segments en parallèle).
const DOWNLOAD_PRIORITY = ["s4", "s3", "s1", "s8", "s2", "s6", "s5", "s7"];

/**
 * Chaque source tentée consomme un appel API, plafonné à 60/min par compte. 40 : la lecture
 * en cours partage le même compteur.
 */
const RESOLVE_BUDGET_PER_MIN = 40;
const RESOLVE_WINDOW_MS = 60_000;

const resolveStamps = [];

/**
 * @param {() => boolean} [shouldAbort] consulté pendant l'attente
 * @returns {Promise<boolean>} `false` si l'attente a été interrompue
 */
async function waitForResolveSlot(shouldAbort) {
  for (;;) {
    if (shouldAbort?.()) return false;
    const now = Date.now();
    while (resolveStamps.length && now - resolveStamps[0] >= RESOLVE_WINDOW_MS) {
      resolveStamps.shift();
    }
    if (resolveStamps.length < RESOLVE_BUDGET_PER_MIN) {
      resolveStamps.push(now);
      return true;
    }
    // Borné, pour rester réactif à l'annulation.
    const attente = Math.min(1000, RESOLVE_WINDOW_MS - (now - resolveStamps[0]) + 50);
    await new Promise((r) => setTimeout(r, attente));
  }
}

/**
 * `excludeSources` : hébergeurs (`s1`…) déjà en échec sur ce téléchargement ; `lastResort`
 * les réessaie tous quand aucun autre ne reste (un hébergeur en panne peut revenir).
 * @param {{shouldAbort?: () => boolean, excludeSources?: string[], lastResort?: boolean}} [options]
 * @returns {Promise<{success:boolean, handle?:string, error?:string}>}
 */
export async function resolveDownloadSource(
  episode,
  lang,
  selectedSource = "auto",
  { shouldAbort, excludeSources = [], lastResort = false } = {}
) {
  const lecteurs =
    episode?.lecteurs?.[lang] ||
    episode?.lecteurs?.[DEFAULT_LANGUAGE] ||
    Object.values(episode?.lecteurs || {})[0];

  if (!lecteurs || typeof lecteurs !== "object") {
    return { success: false, error: "Aucune source pour cet épisode" };
  }
  if (typeof platform.resolveStream !== "function" || !platform.downloads) {
    return { success: false, error: "Téléchargement indisponible" };
  }

  // Un lecteur choisi à la main mais écarté fait repasser sur l'ordre auto.
  const excludeKeys = Object.entries(lecteurs)
    .filter(([, value]) => excludeSources.includes(value?.key))
    .map(([key]) => key);
  let sources = getPrioritizedSources(lecteurs, selectedSource, null, { excludeKeys });
  if (!sources.length && excludeKeys.length && lastResort) {
    sources = getPrioritizedSources(lecteurs, selectedSource);
  }
  if (!sources.length) {
    return {
      success: false,
      error: excludeKeys.length ? "Aucune autre source pour cet épisode" : "Aucune source supportée",
    };
  }

  // Avec une qualité précise, l'ordre de lecture commence par les hébergeurs qui exposent
  // plusieurs résolutions.
  const downloadQuality = useSettingsStore.getState().downloadQuality;
  const wantsSpecificQuality = downloadQuality && downloadQuality !== "max";
  if (selectedSource === "auto" && !wantsSpecificQuality) {
    const rank = (source) => {
      const i = DOWNLOAD_PRIORITY.indexOf(source);
      return i === -1 ? DOWNLOAD_PRIORITY.length : i;
    };
    sources = [...sources].sort((a, b) => rank(a.source) - rank(b.source));
  }

  const apiBaseUrl = getAbsoluteApiBaseUrl();
  const errors = [];
  for (const { id, label } of sources) {
    // Chaque source tentée est un appel compté, repli compris.
    if (!(await waitForResolveSlot(shouldAbort))) {
      return { success: false, error: "Téléchargement annulé" };
    }
    const res = await platform
      .resolveStream({ token: id, apiBaseUrl, mode: "download" })
      .catch((e) => ({ success: false, error: e?.message }));
    if (res?.success && res.handle) return { success: true, handle: res.handle };
    errors.push(`${label}: ${res?.error || "échec"}`);
  }
  return { success: false, error: `Extraction impossible. ${errors.slice(0, 2).join(", ")}` };
}
