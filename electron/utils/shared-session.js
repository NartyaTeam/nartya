/**
 * Fichier commun hors des `userData` (%APPDATA%/Nartya/shared, ~/Library/Application
 * Support/Nartya/shared, ~/.config/Nartya/shared). Écriture atomique : hub et app peuvent
 * rafraîchir en parallèle. Pas de `safeStorage` : chaque app a sa propre clé.
 */

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

let sharedFile = null;
let sharedDir = null;

export function initSharedSession(app) {
  // Parent commun des userData de chaque app.
  const base = app?.getPath ? app.getPath("appData") : path.join(os.homedir(), ".config");
  sharedDir = path.join(base, "Nartya", "shared");
  try {
    fs.mkdirSync(sharedDir, { recursive: true, mode: 0o700 });
  } catch (e) {
    console.error("[shared-session] mkdir a échoué:", e);
  }
  sharedFile = path.join(sharedDir, "session.json");
  restrictPermissions();
  return sharedFile;
}

/** Refresh token en clair : réservé au compte courant. `mode` ne s'applique qu'à la création. */
function restrictPermissions() {
  if (process.platform === "win32") return;
  try {
    fs.chmodSync(sharedDir, 0o700);
    if (fs.existsSync(sharedFile)) fs.chmodSync(sharedFile, 0o600);
  } catch (e) {
    console.warn("[shared-session] chmod a échoué:", e?.message || e);
  }
}

/** Écrit par le hub au démarrage : `{version, lastSeen}`, ou `null` s'il n'a jamais tourné ici. */
export function getHubInfo() {
  try {
    if (!sharedDir) return null;
    const f = path.join(sharedDir, "hub.json");
    if (!fs.existsSync(f)) return null;
    const obj = JSON.parse(fs.readFileSync(f, "utf-8"));
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function readAll() {
  try {
    if (!sharedFile || !fs.existsSync(sharedFile)) return {};
    const raw = fs.readFileSync(sharedFile, "utf-8");
    const parsed = JSON.parse(raw);
    // Un ancien fichier chiffré est ignoré : il sera réécrit en clair.
    if (parsed && typeof parsed === "object" && parsed.__enc) return {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(obj) {
  if (!sharedFile) return;
  const tmp = `${sharedFile}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, sharedFile);
  } catch (e) {
    console.error("[shared-session] écriture a échoué:", e);
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
  }
}

export function getItem(key) {
  const v = readAll()[key];
  return v === undefined ? null : v;
}

function parseStoredAccessToken(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const session = parsed?.currentSession ?? parsed;
    const token = session?.access_token;
    return typeof token === "string" && token.length > 0 && token.length <= 16_384
      ? token
      : null;
  } catch {
    return null;
  }
}

/**
 * Lu dans le fichier partagé, pas reçu du renderer : un renderer compromis ne peut pas en
 * imposer un autre.
 */
export function getSharedAccessToken() {
  return parseStoredAccessToken(getItem("nartya-auth"));
}

function setItem(key, value) {
  const all = readAll();
  all[key] = value;
  writeAll(all);
}

function removeItem(key) {
  const all = readAll();
  if (key in all) {
    delete all[key];
    writeAll(all);
  }
}

/**
 * Écriture atomique : on surveille le dossier, le fichier étant remplacé.
 * @param {(value: string|null) => void} onChange `null` = déconnexion
 */
export function watchSharedSession(onChange, key = "nartya-auth") {
  if (!sharedDir) return () => {};
  let last = getItem(key);
  let timer = null;
  let watcher = null;

  const check = () => {
    const now = getItem(key);
    if (now === last) return; // un rename déclenche plusieurs événements
    last = now;
    onChange(now);
  };

  try {
    watcher = fs.watch(sharedDir, (_event, filename) => {
      if (filename && filename !== "session.json") return;
      clearTimeout(timer);
      timer = setTimeout(check, 150);
    });
  } catch (e) {
    console.error("[shared-session] surveillance impossible:", e);
    return () => {};
  }

  return () => {
    clearTimeout(timer);
    try {
      watcher.close();
    } catch {}
  };
}

const isSessionKey = (key) => typeof key === "string" && /^nartya-auth(-[\w-]+)?$/.test(key);

export function registerSessionIpc(ipcMain) {
  ipcMain.handle("session:get", (_e, key) => (isSessionKey(key) ? getItem(key) : null));
  ipcMain.handle("session:set", (_e, key, value) => {
    if (!isSessionKey(key) || typeof value !== "string") return false;
    setItem(key, value);
    return true;
  });
  ipcMain.handle("session:remove", (_e, key) => {
    if (!isSessionKey(key)) return false;
    removeItem(key);
    return true;
  });
  ipcMain.handle("hub:get-info", () => getHubInfo());
}
