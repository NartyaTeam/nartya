/**
 * Le renderer ne voit aucune URL d'hébergeur : il échange le jeton de l'API contre une URL
 * de proxy local auprès du processus principal.
 */
import { getSeasonEpisodes } from "@/api/animeApi";
import { getAbsoluteApiBaseUrl } from "@/config/config";
import { getPrioritizedSources, hasPlayableSources } from "./videoSourceUtils";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { platform } from "@/platform";
import { logClientEvent } from "@/api/clientLogs";
import { getOrFetch } from "@/hooks/useCachedResource";

// Garde-fou, au cas où l'IPC ne répondrait pas du tout.
const EXTRACTION_TIMEOUT_MS = 20000;
const DEFAULT_LANGUAGE = "vostfr";

// La source prioritaire a cette avance, puis la suivante part en parallèle : la première
// URL jouable gagne.
const HEDGE_STAGGER_MS = 1600;

// Les jetons de source vivent 6 h ; revalider au démarrage du lecteur changerait les jetons.
export const EPISODES_TTL_MS = 60 * 60 * 1000;

async function resolveStreamToken(token, { forceRefresh = false } = {}) {
  if (!token) return { success: false, error: "Source invalide" };
  if (typeof platform.resolveStream !== "function") {
    return { success: false, error: "Lecteur disponible uniquement dans l'app Nartya" };
  }

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), EXTRACTION_TIMEOUT_MS)
    );
    const result = await Promise.race([
      platform.resolveStream({
        token,
        apiBaseUrl: getAbsoluteApiBaseUrl(),
        forceRefresh,
      }),
      timeoutPromise,
    ]);
    if (result?.success && result.url) return { success: true, url: result.url };
    return { success: false, error: result?.error || "Source indisponible" };
  } catch (err) {
    if (err?.message === "TIMEOUT") return { success: false, error: "Source trop lente" };
    return { success: false, error: err?.message || "Erreur de résolution" };
  }
}

/** Échec décrit avec le libellé neutre de la source, jamais le nom de l'hébergeur. */
async function _resolveOneSource({ key, id, label, source }, { forceRefresh = false } = {}) {
  const resolved = await resolveStreamToken(id, { forceRefresh });
  if (!resolved.success) {
    return { success: false, error: `${label}: ${resolved.error}` };
  }
  return {
    success: true,
    videoUrl: resolved.url,
    usedSource: key,
    usedLabel: label,
    // Compartiment de la mémoire de débit du lecteur.
    usedSourceKey: source,
  };
}

/**
 * Les perdantes continuent en fond et peuplent le cache de résolution.
 * @returns {Promise<{success:true,...}|{success:false,error:string}>}
 */
function _resolveSourcesHedged(prioritizedSources, { forceRefresh = false } = {}) {
  return new Promise((resolve) => {
    const errors = [];
    let settled = false;
    let nextIdx = 0;
    let inFlight = 0;
    let staggerTimer = null;

    const settle = (val) => {
      if (settled) return;
      settled = true;
      if (staggerTimer) clearTimeout(staggerTimer);
      resolve(val);
    };

    const advance = () => {
      if (settled || nextIdx >= prioritizedSources.length) return;
      const src = prioritizedSources[nextIdx++];
      inFlight++;

      if (staggerTimer) clearTimeout(staggerTimer);
      if (nextIdx < prioritizedSources.length) {
        staggerTimer = setTimeout(advance, HEDGE_STAGGER_MS);
      }

      _resolveOneSource(src, { forceRefresh })
        .then((r) => {
          inFlight--;
          if (settled) return;
          if (r.success) return settle(r);
          errors.push(r.error);
          if (nextIdx < prioritizedSources.length) advance();
          else if (inFlight === 0) {
            settle({ success: false, error: `Aucune source disponible. ${errors.slice(0, 2).join(", ")}` });
          }
        })
        .catch((err) => {
          inFlight--;
          if (settled) return;
          errors.push(`${src.label}: ${err?.message || "erreur"}`);
          if (nextIdx < prioritizedSources.length) advance();
          else if (inFlight === 0) {
            settle({ success: false, error: `Aucune source disponible. ${errors.slice(0, 2).join(", ")}` });
          }
        });
    };

    if (prioritizedSources.length === 0) {
      settle({ success: false, error: "Aucune source" });
    } else {
      advance();
    }
  });
}

/** Repli sur la langue par défaut. */
function pickLecteurs(episode, language) {
  return (
    episode?.lecteurs?.[language] ||
    episode?.lecteurs?.[DEFAULT_LANGUAGE] ||
    Object.values(episode?.lecteurs || {})[0]
  );
}

const _prewarmed = new Set();
const PREWARM_MAX = 300;

/** Une seule source : un survol ne doit pas coûter plus d'un appel. */
export function prewarmEpisodeSource(episode, language = DEFAULT_LANGUAGE, selectedSource) {
  const lecteurs = pickLecteurs(episode, language);
  if (!lecteurs || typeof lecteurs !== "object") return;
  const priorityProvider = useSettingsStore.getState().prioritySource;
  const [top] = getPrioritizedSources(lecteurs, selectedSource, priorityProvider);
  if (!top?.id || _prewarmed.has(top.id)) return;
  if (_prewarmed.size >= PREWARM_MAX) _prewarmed.clear();
  _prewarmed.add(top.id);
  resolveStreamToken(top.id);
}

export function episodesCacheKey(slug, seasonId, lite = false) {
  return `episodes:${slug}:${seasonId}${lite ? ":lite" : ""}`;
}

/** Carte « Reprendre » : on n'a que les coordonnées. */
export async function prewarmEpisode(slug, seasonId, episodeNumber, language = DEFAULT_LANGUAGE) {
  if (!slug || !seasonId) return;
  const lite = useSettingsStore.getState().liteMode;
  try {
    const data = await getOrFetch(
      episodesCacheKey(slug, seasonId, lite),
      () => getSeasonEpisodes(slug, seasonId, { lite }),
      EPISODES_TTL_MS
    );
    const episode = (data?.episodes || []).find(
      (e) => Number(e.episode ?? e.number) === Number(episodeNumber)
    );
    if (episode) prewarmEpisodeSource(episode, language);
  } catch (_) {}
}

/**
 * @param {number} episodeIndex index dans la saison, à partir de 0
 * @param {{ episode?: Object, episodes?: Array, selectedSource?: string, excludeKeys?: string[] }} [options]
 * `excludeKeys` : sources déjà disqualifiées pour cet épisode
 * `forceRefresh` : ignore le cache de résolution (flux peut-être expiré)
 */
export async function getEpisodeVideoUrl(slug, seasonId, episodeIndex, language = DEFAULT_LANGUAGE, options = {}) {
  const {
    episode: existingEpisode,
    episodes: existingEpisodes,
    selectedSource,
    excludeKeys = [],
    forceRefresh = false,
  } = options;
  let episode;
  let episodes;

  if (existingEpisode?.lecteurs) {
    episode = existingEpisode;
    episodes = Array.isArray(existingEpisodes) ? existingEpisodes : [existingEpisode];
  } else {
    if (!slug || !seasonId) return { success: false, error: "Slug ou saison manquant" };
    try {
      const data = await getSeasonEpisodes(slug, seasonId);
      episodes = data?.episodes || [];
      episode = episodes[episodeIndex];
    } catch (err) {
      return { success: false, error: err.message || "Erreur chargement" };
    }
  }

  if (!episode) return { success: false, error: "Épisode introuvable" };

  const lecteurs = pickLecteurs(episode, language);
  if (!lecteurs || typeof lecteurs !== "object") {
    return { success: false, error: "Aucune source pour cet épisode", episode };
  }

  if (!hasPlayableSources(lecteurs)) {
    return { success: false, error: "Aucune source supportée", episode };
  }

  // Seulement en mode « auto ».
  const priorityProvider = useSettingsStore.getState().prioritySource;
  const prioritizedSources = getPrioritizedSources(lecteurs, selectedSource, priorityProvider, {
    excludeKeys,
  });

  if (prioritizedSources.length === 0 && excludeKeys.length > 0) {
    return { success: false, error: "Toutes les sources de cet épisode ont échoué.", episode };
  }

  const resolved = await _resolveSourcesHedged(prioritizedSources, { forceRefresh });
  if (!resolved.success) {
    // Seulement quand toutes les sources ont échoué.
    logClientEvent("extract_failed", {
      message: resolved.error,
      detail: {
        slug,
        season: seasonId,
        episode: episode.episode ?? episode.number ?? episodeIndex + 1,
        language,
        // Clés opaques, jamais les URL résolues.
        tried: prioritizedSources.map((s) => s.key),
        excluded: excludeKeys,
      },
    });
    return { success: false, error: resolved.error, episode };
  }

  return {
    success: true,
    videoUrl: resolved.videoUrl,
    episode,
    episodeTitle: episode.title || `Épisode ${episode.episode ?? episode.number ?? episodeIndex + 1}`,
    episodeImage: episode.image || episode.thumbnail || null,
    totalEpisodesInSeason: episodes.length,
    usedSource: resolved.usedSource,
    usedLabel: resolved.usedLabel,
    usedSourceKey: resolved.usedSourceKey,
  };
}
