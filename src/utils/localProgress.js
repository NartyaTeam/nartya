import { episodeKey, saveEpisodeProgressBatch } from "@/api/progress";
import { createProgressBatcher } from "@/lib/progressBatcher";

// Copie locale des positions de lecture : hors ligne, Supabase n'est joignable ni pour lire
// ni pour écrire, et un épisode téléchargé repartait du début. Les positions restées non
// envoyées partent au retour du réseau.
const STORAGE_KEY = "nartya:local-progress:v1";
const MAX_ENTRIES = 300;

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  const keys = Object.keys(all);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (all[a].at || 0) - (all[b].at || 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete all[k]);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Stockage plein ou indisponible : la sauvegarde serveur reste la référence.
  }
}

/** `{ positionSeconds, duration, at }` ou null. */
export function getLocalProgress(slug, seasonId, episodeNumber, language) {
  const entry = readAll()[episodeKey(slug, seasonId, episodeNumber, language)];
  return entry ? { positionSeconds: entry.positionSeconds, duration: entry.duration, at: entry.at } : null;
}

// Les envois sont regroupés : la dernière position d'un épisode remplace les précédentes encore
// en attente, et tout part en une requête (jusqu'à 50 épisodes) au lieu d'une par sauvegarde.
const batcher = createProgressBatcher({
  send: (entries) => saveEpisodeProgressBatch(entries.map((e) => e.p)),
  onSettled: (entries, ok) => {
    if (!ok) return; // la copie locale reste « en attente » : elle repart au prochain essai
    const after = readAll();
    let changed = false;
    for (const { key, at } of entries) {
      // Une sauvegarde plus récente a pu passer entre-temps : elle garde son propre état.
      if (after[key]?.at === at) {
        after[key].pending = false;
        changed = true;
      }
    }
    if (changed) writeAll(after);
  },
});

const ASAP_MS = 50;

/**
 * Mêmes champs que `saveEpisodeProgress`. Enregistre localement puis envoie, avec un court délai
 * pour regrouper. `immediate` (fermeture de page, changement d'épisode) envoie sans attendre.
 */
export function saveProgressWithLocalCopy(p, { immediate = false } = {}) {
  const key = episodeKey(p.slug, p.seasonId, p.episodeNumber, p.language);
  const at = Date.now();
  const all = readAll();
  all[key] = { ...p, at, pending: true };
  writeAll(all);
  batcher.add(key, { key, at, p }, immediate ? { delay: ASAP_MS } : undefined);
}

let flushing = false;

/** Renvoie au serveur, en un envoi regroupé, les positions enregistrées sans réseau. */
export async function flushPendingProgress() {
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  flushing = true;
  try {
    for (const [key, entry] of Object.entries(readAll())) {
      if (!entry.pending) continue;
      const p = { ...entry };
      delete p.at;
      delete p.pending;
      batcher.add(key, { key, at: entry.at, p });
    }
    await batcher.flush();
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") window.addEventListener("online", () => flushPendingProgress());
