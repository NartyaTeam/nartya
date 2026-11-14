/**
 * Copie le localStorage de la page dans un fichier du dossier de données. Sous Tauri l'origine
 * change (`file://` → `tauri.localhost`) et le localStorage Electron n'est plus lisible : la coque
 * Tauri relit ce fichier à son premier lancement (voir `src-tauri/src/migrate.rs`).
 */
import fs from "fs";
import path from "path";

export const EXPORT_FILE = "localstorage-export.json";
const AFTER_LOAD_MS = 5_000;
const EVERY_MS = 60_000;
const MAX_BYTES = 4 * 1024 * 1024;

const SNAPSHOT_SCRIPT =
  "JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))";

export function initStorageExport(app, getWindow) {
  const file = path.join(app.getPath("userData"), EXPORT_FILE);
  let last = "";

  const snapshot = async () => {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.webContents.isLoading()) return;
    // Les pages de l'app seulement (pas un site tiers atterri dans la fenêtre).
    if (!win.webContents.getURL().startsWith("file:") && !win.webContents.getURL().startsWith("http://localhost")) return;
    try {
      const json = await win.webContents.executeJavaScript(SNAPSHOT_SCRIPT);
      if (typeof json !== "string" || json === last || json.length > MAX_BYTES) return;
      const tmp = `${file}.tmp`;
      await fs.promises.writeFile(tmp, json, "utf8");
      await fs.promises.rename(tmp, file);
      last = json;
    } catch {
      // Un export manqué se rattrape au suivant.
    }
  };

  setTimeout(snapshot, AFTER_LOAD_MS);
  const timer = setInterval(snapshot, EVERY_MS);
  timer.unref?.();
  app.on("before-quit", snapshot);
}
