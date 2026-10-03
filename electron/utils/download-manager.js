/**
 * Par machine, dans `<racine>/<id>/` : video.mp4 (HLS fusionné par ffmpeg), playlist.m3u8 et
 * segments si la fusion échoue, cover.jpg. Un index persistant rend la bibliothèque hors ligne
 * indépendante du réseau.
 */
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { dialog, shell } from "electron";
import Store from "electron-store";
import ffmpegBinary from "ffmpeg-static";
import { fetchChecked, providerAgent, detectProvider } from "./provider-fetch.js";
import { API_BASE_URL, IS_DEV } from "./api-base.js";
import { isPathSafe, isHttpUrl } from "./url-validator.js";
import { resolveHandle } from "./stream-handles.js";
import { friendlyErrorMessage } from "./friendly-error.js";
import { downloadMp4 } from "./download-mp4.js";
import { downloadHls } from "./download-hls.js";
import { downloadScanChapter } from "./download-scans.js";

// Réglés depuis le renderer selon l'offre.
let maxConcurrent = 2;

// En build packagé, ce chemin pointe dans `app.asar`, où un binaire ne s'exécute pas.
let ffmpegPath = ffmpegBinary;

// Instancié après app.ready.
let store = null;
let downloadsRoot = null;
let defaultRoot = null;
let getWindow = () => null;
let sendProgress = () => {};

// id → { controller: AbortController }
const active = new Map();
const queue = [];
let running = 0;

// En mémoire : electron-store réécrit tout le fichier à chaque accès, de façon synchrone.
let items = {};
let saveTimer = null;
const SAVE_DELAY_MS = 2000;

function flushItems() {
  clearTimeout(saveTimer);
  saveTimer = null;
  store?.set("items", items);
}
function saveItemsSoon() {
  if (!saveTimer) saveTimer = setTimeout(flushItems, SAVE_DELAY_MS);
}

function itemsMap() {
  return items;
}
function getItem(id) {
  return items[id] || null;
}
function setItem(id, patch, { flush = false } = {}) {
  items[id] = { ...(items[id] || {}), ...patch };
  if (flush) flushItems();
  else saveItemsSoon();
  return items[id];
}
function deleteItemRecord(id) {
  delete items[id];
  flushItems();
}

function emit(id) {
  const it = getItem(id);
  if (it) sendProgress(it);
}

/** Un id vide désignerait la racine elle-même. */
function isValidId(id) {
  return typeof id === "string" && id.length > 0 && id.length <= 512;
}

function itemDir(id) {
  if (!isValidId(id)) throw new Error("Identifiant de téléchargement invalide");
  // L'id contient des "::" : encodé pour un nom de dossier sûr.
  const safe = Buffer.from(id).toString("base64url");
  return path.join(downloadsRoot, safe);
}

/**
 * Contraint au dossier de l'entrée.
 * @returns {string|null}
 */
export function resolveLocalFile(id, rel = "video.mp4") {
  if (!downloadsRoot || !isValidId(id) || typeof rel !== "string") return null;
  const base = itemDir(id);
  const abs = path.resolve(base, rel);
  if (!isPathSafe(abs, base)) return null;
  return fs.existsSync(abs) ? abs : null;
}

// Répertoire de téléchargement

function isBusy() {
  return active.size > 0 || queue.length > 0;
}

/**
 * `null` si le dossier est valide (absolu, existant, inscriptible, pas la racine d'un volume),
 * sinon le message d'erreur.
 */
function validateRoot(dir) {
  if (!dir || typeof dir !== "string" || !path.isAbsolute(dir)) return "Chemin invalide";
  if (path.dirname(dir) === dir) return "Choisis un sous-dossier, pas la racine du disque";
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch {
    return "Ce dossier n'existe pas";
  }
  if (!stat.isDirectory()) return "Ce chemin n'est pas un dossier";
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    return "Ce dossier n'est pas accessible en écriture";
  }
  return null;
}

/** Copie + suppression quand les volumes diffèrent (EXDEV). */
async function moveDir(src, dest) {
  try {
    await fsp.rename(src, dest);
  } catch (err) {
    if (err.code !== "EXDEV" && err.code !== "EPERM") throw err;
    await fsp.cp(src, dest, { recursive: true });
    await fsp.rm(src, { recursive: true, force: true });
  }
}

function getDownloadsDir() {
  return {
    dir: downloadsRoot,
    defaultDir: defaultRoot,
    isDefault: downloadsRoot === defaultRoot,
    itemCount: Object.keys(itemsMap()).length,
    busy: isBusy(),
  };
}

/** Sélecteur natif, puis « déplacer / laisser / annuler ». */
async function chooseDownloadsDir() {
  if (isBusy()) {
    return { success: false, error: "Un téléchargement est en cours — réessaie après." };
  }

  const win = getWindow();
  const picked = await dialog.showOpenDialog(win || undefined, {
    title: "Dossier de téléchargement",
    defaultPath: downloadsRoot,
    properties: ["openDirectory", "createDirectory"],
    buttonLabel: "Choisir",
  });
  if (picked.canceled || !picked.filePaths?.length) return { canceled: true };

  const dir = path.resolve(picked.filePaths[0]);
  const error = validateRoot(dir);
  if (error) return { success: false, error };
  if (dir === downloadsRoot) return { canceled: true };

  let move = false;
  const itemCount = Object.keys(itemsMap()).length;
  if (itemCount > 0) {
    const { response } = await dialog.showMessageBox(win || undefined, {
      type: "question",
      buttons: ["Déplacer les épisodes", "Laisser sur place", "Annuler"],
      defaultId: 0,
      cancelId: 2,
      title: "Changer le dossier de téléchargement",
      message: `Déplacer les ${itemCount} épisode(s) déjà téléchargé(s) vers le nouveau dossier ?`,
      detail:
        "« Laisser sur place » retire ces épisodes de ta bibliothèque hors ligne : leurs " +
        "fichiers restent sur le disque mais Nartya ne les retrouvera plus.",
    });
    if (response === 2) return { canceled: true };
    move = response === 0;
  }

  const res = await setDownloadsDir(dir, { move });
  // Sans déplacement, les entrées pointent vers des dossiers absents.
  if (res.success && !move && itemCount > 0) {
    items = {};
    flushItems();
  }
  return res;
}

/** Sans `move`, les entrées sortent de la bibliothèque. Refusé pendant un téléchargement. */
async function setDownloadsDir(dir, { move = true } = {}) {
  if (!downloadsRoot) return { success: false, error: "Gestionnaire non initialisé" };
  if (isBusy()) {
    return { success: false, error: "Un téléchargement est en cours — réessaie après." };
  }
  const error = validateRoot(dir);
  if (error) return { success: false, error };

  const target = path.resolve(dir);
  if (target === downloadsRoot) return { success: true, dir: target, moved: 0 };

  const ids = Object.keys(itemsMap());
  let moved = 0;

  if (move) {
    const oldRoot = downloadsRoot;
    for (const id of ids) {
      const safe = Buffer.from(id).toString("base64url");
      const src = path.join(oldRoot, safe);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(target, safe);
      try {
        // Un reste d'un précédent déplacement bloquerait le rename.
        await fsp.rm(dest, { recursive: true, force: true });
        await moveDir(src, dest);
        moved++;
      } catch (err) {
        // Échec partiel : on reste sur l'ancienne racine, rien n'est perdu.
        console.error(`[Downloads] Déplacement de ${id} échoué :`, err.message);
        return {
          success: false,
          error: `Déplacement interrompu (${moved}/${ids.length}) : ${err.message}`,
        };
      }
    }
  }

  downloadsRoot = target;
  store.set("root", target);
  fs.mkdirSync(downloadsRoot, { recursive: true });
  console.log(`[Downloads] Racine → ${target} (${moved} entrée(s) déplacée(s))`);
  return { success: true, dir: target, moved };
}

async function openDownloadsDir() {
  if (!downloadsRoot) return { success: false };
  const err = await shell.openPath(downloadsRoot);
  return err ? { success: false, error: err } : { success: true };
}

async function cacheImage(url, dest) {
  if (!isHttpUrl(url)) return null;
  try {
    const res = await fetchChecked(url, {
      agent: providerAgent,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    await fsp.writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return dest;
  } catch {
    return null;
  }
}

// Erreurs du disque : changer d'hébergeur n'y changerait rien.
const LOCAL_ERRORS = new Set(["ENOSPC", "EACCES", "EPERM", "EROFS", "EMFILE", "EBUSY", "EISDIR", "ENOTDIR"]);

async function processQueue() {
  if (running >= maxConcurrent) return;
  const next = queue.shift();
  if (!next) return;

  const { id, directUrl, provider, maxHeight } = next;
  // Supprimée pendant qu'elle patientait en file : ne pas la recréer.
  if (!getItem(id)) return processQueue();

  running++;
  const controller = new AbortController();
  active.set(id, { controller });

  try {
    setItem(id, { status: "downloading", percent: 0 });
    emit(id);

    const dir = itemDir(id);
    const onProgress = (patch) => {
      setItem(id, { status: "downloading", ...patch });
      emit(id);
    };
    const isScan = getItem(id)?.type === "scan";
    let file, sizeBytes;
    if (isScan) {
      console.log(`[Downloads] Démarrage ${id} | scan | ${getItem(id).pages} page(s)`);
      ({ file, sizeBytes } = await downloadScanChapter(getItem(id), dir, controller, onProgress));
    } else {
      const isHls = /\.m3u8(\?|$)/i.test(directUrl);
      console.log(
        `[Downloads] Démarrage ${id} | provider=${provider} | ${isHls ? "HLS" : "MP4"} | maxHeight=${
          maxHeight > 0 ? maxHeight : "∞"
        }`
      );
      ({ file, sizeBytes } = isHls
        ? await downloadHls(dir, directUrl, provider, controller, {
            // 0 ou absent = pas de plafond, comme sur Android (format de reprise partagé).
            maxHeight: maxHeight > 0 ? maxHeight : Infinity,
            ffmpegPath,
            onProgress,
            onProcessingDone: () => {
              if (getItem(id)) setItem(id, { processing: false });
            },
            label: id,
          })
        : await downloadMp4(dir, directUrl, provider, controller, onProgress));
    }
    setItem(
      id,
      { status: "done", percent: 100, file, sizeBytes, finishedAt: Date.now(), failedProviders: [] },
      { flush: true }
    );
    emit(id);
  } catch (err) {
    if (controller.signal.aborted) {
      await removeDownload(id).catch(() => {});
    } else if (getItem(id)) {
      // Le détail reste dans les logs, l'UI reçoit un message lisible.
      console.error(`[Downloads] ${id} en erreur :`, err?.message || err);
      const it = getItem(id);
      const failedProvider = it.type !== "scan" && !LOCAL_ERRORS.has(err?.code) ? provider || it.provider : null;
      const failedProviders = failedProvider
        ? [...new Set([...(it.failedProviders || []), failedProvider])]
        : it.failedProviders || [];
      setItem(id, { status: "error", error: friendlyErrorMessage(err), failedProviders }, { flush: true });
      emit(id);
    }
  } finally {
    active.delete(id);
    running--;
    processQueue();
  }
}

/** Pages servies par notre API : seule cette origine est acceptée (plus localhost en dev). */
function isTrustedScanBase(imageBase) {
  try {
    const { origin, hostname } = new URL(imageBase);
    if (origin === new URL(API_BASE_URL).origin) return true;
    return IS_DEV && (hostname === "localhost" || hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

async function startScanDownload(payload) {
  const { id, animeCover, oeuvre, chapter, folder, pages, imageBase } = payload;
  if (!isValidId(id) || !oeuvre || chapter == null || folder == null || !pages || !imageBase) {
    return { success: false, error: "Paramètres manquants" };
  }
  if (!isTrustedScanBase(imageBase)) {
    return { success: false, error: "Source des pages non reconnue" };
  }

  const existing = getItem(id);
  if (existing && (existing.status === "done" || existing.status === "downloading")) {
    return { success: true, alreadyExists: true };
  }

  const dir = itemDir(id);
  await fsp.mkdir(dir, { recursive: true });

  let coverFile = null;
  if (animeCover) {
    const ok = await cacheImage(animeCover, path.join(dir, "cover.jpg"));
    if (ok) coverFile = "cover.jpg";
  }

  setItem(id, {
    id,
    type: "scan",
    slug: payload.slug,
    oeuvre,
    oeuvreLabel: payload.oeuvreLabel || null,
    chapter,
    folder,
    pages,
    imageBase,
    animeTitle: payload.animeTitle || payload.slug,
    animeCover: payload.animeCover || null,
    coverFile,
    status: "queued",
    error: null,
    percent: 0,
    sizeBytes: 0,
    createdAt: Date.now(),
  });
  emit(id);

  queue.push({ id });
  processQueue();
  return { success: true };
}

async function startDownload(payload) {
  if (!downloadsRoot) return { success: false, error: "Gestionnaire non initialisé" };
  if (payload?.type === "scan") return startScanDownload(payload);
  const { id, animeCover, maxHeight } = payload || {};

  // Le renderer n'envoie qu'une poignée, jamais d'URL.
  if (!isValidId(id) || !payload.handle) return { success: false, error: "Paramètres manquants" };
  const target = resolveHandle(payload.handle);
  if (!target) return { success: false, error: "Lien de téléchargement expiré, relance-le." };
  const { url: directUrl, provider } = target;

  const existing = getItem(id);
  if (existing && (existing.status === "done" || existing.status === "downloading")) {
    return { success: true, alreadyExists: true };
  }

  const dir = itemDir(id);
  await fsp.mkdir(dir, { recursive: true });

  // Pour la bibliothèque hors ligne.
  let coverFile = null;
  if (animeCover) {
    const ok = await cacheImage(animeCover, path.join(dir, "cover.jpg"));
    if (ok) coverFile = "cover.jpg";
  }
  let thumbFile = null;
  if (payload.epThumb) {
    const ok = await cacheImage(payload.epThumb, path.join(dir, "thumb.jpg"));
    if (ok) thumbFile = "thumb.jpg";
  }

  setItem(id, {
    id,
    slug: payload.slug,
    seasonId: payload.seasonId,
    ep: payload.ep,
    lang: payload.lang,
    animeTitle: payload.animeTitle || payload.slug,
    animeCover: payload.animeCover || null, // URL distante
    coverFile, // fichier local
    epThumb: payload.epThumb || null,
    thumbFile,
    epTitle: payload.epTitle || null,
    seasonName: payload.seasonName || null,
    provider: provider || detectProvider(directUrl),
    // Pour « Reprendre », qui relance avec la même qualité et la même source.
    maxHeight: maxHeight > 0 ? maxHeight : 0,
    sourcePreference: payload.sourcePreference || "auto",
    status: "queued",
    error: null,
    percent: 0,
    sizeBytes: 0,
    createdAt: Date.now(),
  });
  emit(id);

  queue.push({ id, directUrl, provider, maxHeight });
  processQueue();
  return { success: true };
}

async function cancelDownload(id) {
  if (!isValidId(id)) return { success: false, error: "Identifiant invalide" };
  const entry = active.get(id);
  if (entry) {
    // Le nettoyage revient au catch de processQueue, une fois le téléchargement arrêté.
    entry.controller.abort();
    return { success: true };
  }
  const qi = queue.findIndex((q) => q.id === id);
  if (qi !== -1) {
    queue.splice(qi, 1);
    await removeDownload(id);
    return { success: true };
  }
  // Un item resté « en cours » sans processus doit pouvoir être annulé.
  const it = getItem(id);
  if (it && (it.status === "downloading" || it.status === "queued")) {
    await removeDownload(id);
  }
  return { success: true };
}

/**
 * Filtre sur le préfixe d'id (`slug::seasonId::`) : la saison peut avoir des épisodes mis en
 * file ailleurs. `{ slug, oeuvre, type: "scan" }` annule les chapitres d'une édition.
 */
async function cancelSeason({ slug, seasonId, lang, oeuvre, type } = {}) {
  if (type === "scan") {
    if (!slug || !oeuvre) return { success: false, error: "Paramètres manquants" };
    return cancelBatch(`scan::${slug}::${oeuvre}::`, null);
  }
  if (!slug || seasonId == null) return { success: false, error: "Paramètres manquants" };
  return cancelBatch(`${slug}::${seasonId}::`, lang ? `::${lang}` : null);
}

async function cancelBatch(prefix, suffix) {
  const matches = (id) => id.startsWith(prefix) && (!suffix || id.endsWith(suffix));

  // File vidée d'abord, sinon chaque abandon démarrerait l'épisode suivant.
  for (let i = queue.length - 1; i >= 0; i--) {
    if (matches(queue[i].id)) queue.splice(i, 1);
  }

  const ids = Object.keys(itemsMap()).filter((id) => {
    if (!matches(id)) return false;
    const st = getItem(id)?.status;
    return st === "queued" || st === "downloading";
  });
  // Les épisodes terminés sont épargnés.
  for (const id of ids) await removeDownload(id).catch(() => {});

  console.log(`[Downloads] Lot annulé ${prefix}${suffix ?? "*"} → ${ids.length} entrée(s)`);
  return { success: true, canceled: ids.length };
}

async function removeDownload(id) {
  if (!isValidId(id)) return { success: false, error: "Identifiant invalide" };
  const entry = active.get(id);
  if (entry) entry.controller.abort();
  // Un id supprimé ne doit jamais être repris par processQueue.
  const qi = queue.findIndex((q) => q.id === id);
  if (qi !== -1) queue.splice(qi, 1);
  try {
    await fsp.rm(itemDir(id), { recursive: true, force: true });
  } catch (_) {}
  deleteItemRecord(id);
  return { success: true };
}

function listDownloads() {
  // Enregistrements corrompus (sans slug) écartés.
  const items = Object.entries(itemsMap())
    .map(([id, it]) => ({ id, ...it }))
    .filter((it) => it && it.slug);
  return { items };
}

/** Dans app.whenReady(). */
export function initDownloads(app, windowGetter) {
  store = new Store({ name: "downloads" });
  defaultRoot = path.join(app.getPath("userData"), "downloads");

  // `asarUnpack` sort le binaire ffmpeg sous `app.asar.unpacked`.
  if (app.isPackaged && ffmpegPath) {
    ffmpegPath = ffmpegPath.replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`
    );
  }
  if (!ffmpegPath) {
    console.warn(
      "[Downloads] ffmpeg indisponible sur cette plateforme → les téléchargements HLS resteront en playlist + segments séparés."
    );
  }

  // Racine choisie si elle est encore utilisable, sinon le défaut, sans perdre le réglage.
  const saved = store.get("root");
  if (saved && !validateRoot(saved)) {
    downloadsRoot = saved;
  } else {
    if (saved) {
      console.warn(`[Downloads] Racine « ${saved} » inutilisable → repli sur ${defaultRoot}`);
    }
    downloadsRoot = defaultRoot;
  }
  fs.mkdirSync(downloadsRoot, { recursive: true });

  getWindow = () => windowGetter?.() || null;
  sendProgress = (item) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send("downloads:progress", item);
  };

  items = store.get("items", {});
  let changed = false;
  for (const [id, it] of Object.entries(items)) {
    // Corrompu (sans slug) : purgé.
    if (!it || !it.slug) {
      delete items[id];
      changed = true;
      continue;
    }
    // Laissées « en cours » par un arrêt brutal.
    if (it.status === "downloading" || it.status === "queued") {
      items[id] = { ...it, status: "error", error: "Interrompu" };
      changed = true;
    }
  }
  if (changed) flushItems();
}

/** Borné à [1, 99]. Une hausse relance la file. */
function setMaxConcurrent(n) {
  const next = Math.max(1, Math.min(99, Math.floor(Number(n) || 1)));
  if (next === maxConcurrent) return;
  maxConcurrent = next;
  for (let i = running; i < maxConcurrent; i++) processQueue();
}

/** Avant de quitter. */
export function flushDownloads() {
  if (saveTimer) flushItems();
}

export function registerDownloadsIpc(ipcMain) {
  ipcMain.handle("downloads:list", () => listDownloads());
  ipcMain.handle("downloads:start", (_e, payload) => startDownload(payload));
  ipcMain.handle("downloads:set-max-concurrent", (_e, n) => setMaxConcurrent(n));
  ipcMain.handle("downloads:cancel", (_e, id) => cancelDownload(id));
  ipcMain.handle("downloads:cancel-season", (_e, payload) => cancelSeason(payload));
  ipcMain.handle("downloads:remove", (_e, id) => removeDownload(id));
  ipcMain.handle("downloads:get-dir", () => getDownloadsDir());
  ipcMain.handle("downloads:choose-dir", () => chooseDownloadsDir());
  ipcMain.handle("downloads:open-dir", () => openDownloadsDir());
}
