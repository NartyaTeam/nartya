/** Sans API native, tout renvoie des valeurs vides. */
import { platform } from "@/platform";

const api = () => platform.downloads;

export function downloadsAvailable() {
  return !!api();
}

export async function listDownloads() {
  const d = api();
  if (!d?.list) return [];
  try {
    const res = await d.list();
    return res?.items || [];
  } catch {
    return [];
  }
}

/** @param {object} payload { slug, seasonId, ep, lang, embedUrl, animeTitle, animeCover, epTitle, epThumb, seasonName } */
export async function startDownload(payload) {
  const d = api();
  if (!d?.start) return { success: false, error: "Téléchargement indisponible" };
  try {
    return await d.start(payload);
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
}

export async function cancelDownload(id) {
  const d = api();
  if (!d?.cancel) return { success: false };
  try {
    return await d.cancel(id);
  } catch {
    return { success: false };
  }
}

/**
 * Seuls les épisodes en file ou en cours sont annulés.
 * @param {{slug:string, seasonId:string|number, lang?:string}} payload
 */
export async function cancelSeasonDownloads(payload) {
  const d = api();
  if (!d?.cancelSeason) return { success: false };
  try {
    return await d.cancelSeason(payload);
  } catch {
    return { success: false };
  }
}

export async function removeDownload(id) {
  const d = api();
  if (!d?.remove) return { success: false };
  try {
    return await d.remove(id);
  } catch {
    return { success: false };
  }
}

/** Null si absent. */
export async function getLocalPlaybackUrl(id, rel = "video.mp4") {
  const d = api();
  if (!d?.localUrl) return null;
  try {
    return await d.localUrl(id, rel);
  } catch {
    return null;
  }
}

/** @returns {Promise<{dir:string,defaultDir:string,isDefault:boolean,itemCount:number,busy:boolean}|null>} */
export async function getDownloadsDir() {
  const d = api();
  if (!d?.getDir) return null;
  try {
    return await d.getDir();
  } catch {
    return null;
  }
}

/**
 * Sélecteur natif, puis choix du sort de l'existant.
 * @returns {Promise<{canceled:true}|{success:boolean,error?:string,dir?:string,moved?:number}>}
 */
export async function chooseDownloadsDir() {
  const d = api();
  if (!d?.chooseDir) return { canceled: true };
  try {
    return await d.chooseDir();
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
}

export async function openDownloadsDir() {
  const d = api();
  if (!d?.openDir) return { success: false };
  try {
    return await d.openDir();
  } catch {
    return { success: false };
  }
}

export async function setMaxConcurrentDownloads(n) {
  const d = api();
  if (!d?.setMaxConcurrent) return;
  try {
    await d.setMaxConcurrent(n);
  } catch {
    // best-effort
  }
}

export function onDownloadProgress(cb) {
  const d = api();
  if (!d?.onProgress) return () => {};
  return d.onProgress(cb);
}

export function downloadId(slug, seasonId, ep, lang) {
  return `${slug}::${seasonId}::${ep}::${lang}`;
}

export function scanDownloadId(slug, oeuvre, chapter) {
  return `scan::${slug}::${oeuvre}::${chapter}`;
}
