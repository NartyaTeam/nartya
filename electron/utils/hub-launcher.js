/** Le Hub tient la session partagée à jour. */

import { shell } from "electron";
import path from "path";
import fs from "fs";
import { spawn, execFile } from "child_process";
import { getHubInfo } from "./shared-session.js";
import { SITE_URL } from "../../src/config/instance.js";

// `nartya-hub://` n'est pas toujours enregistré par l'installeur : l'exécutable d'abord.
function hubExeCandidates() {
  if (process.platform === "win32") {
    const dirs = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"),
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
    ].filter(Boolean);
    return dirs.map((d) => path.join(d, "Nartya Hub", "Nartya Hub.exe"));
  }
  if (process.platform === "darwin") {
    return ["/Applications/Nartya Hub.app"];
  }
  return ["/opt/Nartya Hub/nartya-hub", "/usr/bin/nartya-hub"];
}

function hubExeFromMarker() {
  const p = getHubInfo()?.exePath;
  return typeof p === "string" && p ? p : null;
}

export function resolveHubExe() {
  const candidates = [hubExeFromMarker(), ...hubExeCandidates()].filter(Boolean);
  return candidates.find((exe) => fs.existsSync(exe)) || null;
}

/**
 * `null` si indéterminable. Les anciens Hub affichent leur fenêtre quand on les relance, même
 * avec `--hidden` : on vérifie avant.
 */
function isHubRunning(exePath) {
  const name = path.basename(exePath);
  return new Promise((resolve) => {
    try {
      if (process.platform === "win32") {
        execFile(
          "tasklist",
          ["/FI", `IMAGENAME eq ${name}`, "/NH"],
          { windowsHide: true },
          (err, stdout) => resolve(err ? null : stdout.includes(name))
        );
      } else {
        // pgrep sort en code 1 quand rien ne correspond.
        execFile("pgrep", ["-f", name], (err, stdout) =>
          resolve(err ? (err.code === 1 ? false : null) : !!stdout.trim())
        );
      }
    } catch {
      resolve(null);
    }
  });
}

/** C'est lui qui rafraîchit la session. */
export async function ensureHubRunning() {
  const exe = resolveHubExe();
  if (!exe) return;
  if ((await isHubRunning(exe)) === true) return;
  launchHubExe({ mode: "hidden" });
}

/**
 * `mode` : `hidden` (zone de notification), `minimize` ou `visible`. Le verrou d'instance du Hub
 * évite les doublons.
 */
export function launchHubExe({ mode = "visible" }) {
  const exe = resolveHubExe();
  if (!exe) return false;
  const args = mode === "hidden" ? ["--hidden"] : mode === "minimize" ? ["--minimize"] : [];
  try {
    const child = spawn(exe, args, {
      detached: true,
      stdio: "ignore",
      // Le Hub lit NODE_ENV : hérité d'`electron:dev`, il se croirait en dev.
      env: { ...process.env, NODE_ENV: "production" },
    });
    child.unref();
    return true;
  } catch (e) {
    console.error("[hub] lancement de l'exécutable a échoué:", exe, e);
    return false;
  }
}

export function registerHubIpc(secureIpc) {
  /** Exécutable, sinon `nartya-hub://`, sinon le site. `method: "website"` : Hub non ouvert. */
  secureIpc.handle("hub:open", async () => {
    if (launchHubExe({ mode: "visible" })) return { success: true, method: "exe" };

    try {
      await shell.openExternal("nartya-hub://open");
      return { success: true, method: "protocol" };
    } catch {
      /* schéma non enregistré */
    }

    try {
      await shell.openExternal(`${SITE_URL}/`);
      return { success: true, method: "website" };
    } catch {
      return { success: false, method: null };
    }
  });
}
