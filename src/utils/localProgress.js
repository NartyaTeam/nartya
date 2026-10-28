import { episodeKey, saveEpisodeProgress } from "@/api/progress";

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

/** Mêmes champs que `saveEpisodeProgress`. Enregistre localement puis tente l'envoi. */
export async function saveProgressWithLocalCopy(p) {
  const key = episodeKey(p.slug, p.seasonId, p.episodeNumber, p.language);
  const all = readAll();
  all[key] = { ...p, at: Date.now(), pending: true };
  writeAll(all);
  const sent = await saveEpisodeProgress(p).catch(() => false);
  if (!sent) return;
  const after = readAll();
  // Une sauvegarde plus récente a pu passer entre-temps : elle garde son propre état.
  if (after[key] && after[key].positionSeconds === p.positionSeconds) {
    after[key].pending = false;
    writeAll(after);
  }
}

let flushing = false;

/** Renvoie au serveur les positions enregistrées sans réseau. */
export async function flushPendingProgress() {
  if (flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  flushing = true;
  try {
    for (const [key, entry] of Object.entries(readAll())) {
      if (!entry.pending) continue;
      const p = { ...entry };
      delete p.at;
      delete p.pending;
      if (!(await saveEpisodeProgress(p).catch(() => false))) break;
      const after = readAll();
      if (after[key]?.at === entry.at) {
        after[key].pending = false;
        writeAll(after);
      }
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") window.addEventListener("online", () => flushPendingProgress());
