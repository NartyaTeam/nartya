import { app, BrowserWindow, ipcMain, shell, net } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import localProxyServer from "./utils/local-proxy-server.js";
import authCallbackServer from "./utils/auth-callback-server.js";
import { isHttpUrl } from "./utils/url-validator.js";
import { registerUpdaterIpc } from "./updater.js";
import {
  initSharedSession,
  registerSessionIpc,
  watchSharedSession,
  getItem,
} from "./utils/shared-session.js";
import { initDownloads, registerDownloadsIpc, flushDownloads } from "./utils/download-manager.js";
import { initCast, registerCastIpc, shutdownCast } from "./utils/cast-manager.js";
import discordRPC from "./utils/discord-rpc.js";
import { registerStreamIpc } from "./utils/stream-resolver.js";
import { ensureHubRunning, launchHubExe, resolveHubExe, registerHubIpc } from "./utils/hub-launcher.js";
import { registerCaptchaIpc } from "./utils/captcha-window.js";
import { registerSystemIpc } from "./utils/system-info.js";
import { IS_DEV as isDev } from "./utils/api-base.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEEP_LINK_SCHEME = "nartya";

// Lancée par le Hub : pas d'onboarding « Découvre le Hub ».
const HUB_MANAGED = process.argv.includes("--hub-managed") || process.env.NARTYA_HUB === "1";

// Le compositing GPU de Crostini échoue souvent (fenêtre blanche/noire). ChromeOS monte
// `/dev/.cros_milestone` dans le conteneur, absent des autres Linux.
const IS_CROSTINI = process.platform === "linux" && fs.existsSync("/dev/.cros_milestone");
if (IS_CROSTINI) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
}

// La blocklist GPU de Chromium coupe Vulkan (donc WebGPU/Anime4K) sur des pilotes NVIDIA
// récents pourtant fonctionnels.
if (process.platform === "linux" && !IS_CROSTINI) {
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
}

// Bug Chromium : l'overlay vidéo DirectComposition décale l'image en plein écran avec une
// mise à l'échelle ≠ 100 % ou des DPI mixtes.
if (process.platform === "win32") {
  app.commandLine.appendSwitch("disable-features", "DirectCompositionVideoOverlays");
}

const APP_ICON = path.join(__dirname, isDev ? "../public/icon.png" : "../dist/icon.png");

const APP_FILE = path.join(__dirname, "../dist/index.html");
const APP_URL = isDev ? "http://localhost:5173/" : pathToFileURL(APP_FILE).href;

/**
 * En chemin, pas en chaîne : encodage d'un chemin accentué ou casse du lecteur peuvent différer
 * entre `pathToFileURL` et Chromium.
 */
function isAppUrl(url) {
  if (typeof url !== "string") return false;
  if (isDev) return url.startsWith(APP_URL);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") return false;
    const file = fileURLToPath(parsed);
    return process.platform === "win32"
      ? file.toLowerCase() === APP_FILE.toLowerCase()
      : file === APP_FILE;
  } catch {
    return false;
  }
}

const MIN_WIDTH = 1400;
const MIN_HEIGHT = 680;

let mainWindow = null;
let pendingDeepLink = null;
let stopSessionWatch = () => {};

// `app.quit()` seul laissait la seconde instance aller jusqu'à `whenReady` avant de se fermer.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

if (process.defaultApp) {
  // `electron .` en dev : il faut passer le chemin du script.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
}

function extractDeepLink(argv) {
  return argv.find((a) => a.startsWith(`${DEEP_LINK_SCHEME}://`)) || null;
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

/** nartya://[open/]anime/<slug>, u/<handle> ou party/<code> → route de l'app, sinon null. */
function parseNavigationDeepLink(url) {
  let path = url.slice(`${DEEP_LINK_SCHEME}://`.length);
  if (path.startsWith("open/")) path = path.slice("open/".length);
  path = path.replace(/[<>"'\s]/g, "");
  if (path.startsWith("anime/")) {
    const slug = path.slice("anime/".length).split(/[?#/]/)[0];
    return slug ? `/anime/${slug}` : null;
  }
  if (path.startsWith("u/")) {
    const handle = path.slice("u/".length).split(/[?#/]/)[0].replace(/[^a-z0-9_]/gi, "");
    return handle ? `/u/${handle}` : null;
  }
  if (path.startsWith("party/")) {
    const code = path.slice("party/".length).split(/[?#/]/)[0].replace(/[^a-z0-9]/gi, "").toUpperCase();
    return code ? `/party/${code}` : null;
  }
  return null;
}

/** Par deep-link ou par le serveur loopback (voie par défaut). */
function isAuthCallback(url) {
  if (url.startsWith(`${DEEP_LINK_SCHEME}://auth-callback`)) return true;
  try {
    const u = new URL(url);
    return u.hostname === "127.0.0.1" && u.pathname === "/auth-callback";
  } catch {
    return false;
  }
}

function handleDeepLink(url) {
  if (!url || url.length > 2048) return;
  if (!mainWindow || mainWindow.webContents.isLoading()) {
    pendingDeepLink = url;
    return;
  }
  if (isAuthCallback(url)) {
    mainWindow.webContents.send("auth-callback", url);
  } else {
    const route = parseNavigationDeepLink(url);
    if (route) mainWindow.webContents.send("navigate-to", route);
  }
  focusMainWindow();
}

// Windows / Linux : le deep-link arrive par une seconde instance.
app.on("second-instance", (_event, argv) => {
  const link = extractDeepLink(argv);
  if (link) handleDeepLink(link);
  focusMainWindow();
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on("child-process-gone", (_event, details) => {
  console.error("[main] child-process-gone:", details);
});

function createWindow({ primary = true, autoReveal = true } = {}) {
  const win = new BrowserWindow({
    width: MIN_WIDTH,
    height: 880,
    // En dessous, la barre d'outils des épisodes passe sur deux lignes.
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: "#0b0b0f",
    show: false,
    autoHideMenuBar: true,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // Le preload est sandboxé (pas de `fs`) : on lui passe ce qu'on calcule ici.
      additionalArguments: [
        ...(IS_CROSTINI ? ["--nartya-crostini"] : []),
        ...(isDev ? ["--nartya-dev"] : []),
      ],
      // Peu fiable avec une mise à l'échelle fractionnaire : `setFullScreen` est piloté plus bas.
      disableHtmlFullscreenWindowResize: true,
      // Sinon la vidéo saccade dès que la fenêtre perd le focus (PiP, second écran).
      backgroundThrottling: false,
    },
  });

  if (primary) mainWindow = win;

  // À forte mise à l'échelle, l'écran peut être plus étroit que la taille minimale en DIP.
  win.webContents.on("enter-html-full-screen", () => {
    win.setMinimumSize(0, 0);
    if (!win.isFullScreen()) win.setFullScreen(true);
  });
  win.webContents.on("leave-html-full-screen", () => {
    if (win.isFullScreen()) win.setFullScreen(false);
    win.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
  });

  win.loadURL(APP_URL);

  // La fenêtre expose `electronAPI`, session comprise : elle n'affiche jamais que l'app.
  win.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (isHttpUrl(url)) shell.openExternal(url);
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());

  let shown = false;
  const reveal = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    win.show();
    if (primary && pendingDeepLink) {
      const link = pendingDeepLink;
      pendingDeepLink = null;
      handleDeepLink(link);
    }
  };
  if (autoReveal) {
    // `ready-to-show` ne part pas toujours sous Crostini : deux filets.
    win.once("ready-to-show", reveal);
    win.webContents.once("did-finish-load", reveal);
    setTimeout(reveal, 8000);
  }

  // Ctrl+M (« Réduire » par défaut) ouvre « Mes listes ». Sur macOS, Cmd+M reste la réduction.
  win.webContents.on("before-input-event", (_e, input) => {
    win.webContents.setIgnoreMenuShortcuts(
      input.control && !input.alt && !input.shift && input.key.toLowerCase() === "m"
    );
  });

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[main] render-process-gone:", details);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[main] did-fail-load: ${code} ${desc} (${url})`);
  });
  win.webContents.on("unresponsive", () => {
    console.error("[main] renderer unresponsive");
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    if (win === mainWindow) mainWindow = null;
  });

  return win;
}

// IPC

/** Cadre principal de l'app seulement : ni page tierce atterrie dans la fenêtre, ni iframe. */
function isTrustedSender(event) {
  const frame = event.senderFrame;
  return !!frame && frame.parent === null && isAppUrl(frame.url);
}

/** `ipcMain.handle` avec vérification de l'émetteur. */
const secureIpc = {
  handle(channel, listener) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedSender(event)) {
        console.warn(`[ipc] appel refusé sur ${channel} depuis ${event.senderFrame?.url || "?"}`);
        throw new Error("Appel IPC non autorisé");
      }
      return listener(event, ...args);
    });
  },
};

registerSystemIpc(secureIpc, { hardwareAccelerationDisabled: IS_CROSTINI });
registerStreamIpc(secureIpc);

secureIpc.handle("open-external", (_e, url) => {
  if (isHttpUrl(url)) {
    shell.openExternal(url);
    return { success: true };
  }
  return { success: false };
});

registerHubIpc(secureIpc);

// Session arrivée du Hub : l'app passe devant. `setAlwaysOnTop` contourne le refus de focus
// de Windows.
secureIpc.handle("app:focus", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return { success: false };
  if (win.isMinimized()) win.restore();
  win.show();
  win.setAlwaysOnTop(true);
  win.setAlwaysOnTop(false);
  win.focus();
  launchHubExe({ mode: "minimize" });
  return { success: true };
});

secureIpc.handle("app:quit", () => {
  app.quit();
  return { success: true };
});

// Dev uniquement : tester la watch party à deux.
secureIpc.handle("open-new-window", () => {
  if (!isDev) return { success: false };
  createWindow({ primary: false });
  return { success: true };
});

secureIpc.handle("get-auth-redirect-url", () => authCallbackServer.getRedirectUrl());

registerCaptchaIpc(secureIpc, { getParent: () => mainWindow, icon: APP_ICON });

secureIpc.handle("discord:connect", async (_e, clientId) => {
  discordRPC.connect(clientId);
  return { success: true };
});

secureIpc.handle("discord:set-presence", async (_e, params) => {
  if (!params || typeof params !== "object") {
    return { success: false, error: "Paramètres invalides" };
  }
  return discordRPC.setActivity(params);
});

secureIpc.handle("discord:clear-presence", async () => discordRPC.clearActivity());

registerUpdaterIpc(secureIpc, app);
registerSessionIpc(secureIpc);
secureIpc.handle("hub:is-managed", () => HUB_MANAGED);
registerDownloadsIpc(secureIpc);
registerCastIpc(secureIpc);

secureIpc.handle("downloads:local-url", (_e, id, rel) =>
  typeof id === "string" ? localProxyServer.localFileUrl(id, rel || "video.mp4") : null,
);

// Cycle de vie
app.whenReady().then(async () => {
  // DoH pour le renderer (le main a son propre agent), avec repli sur le DNS système.
  try {
    await app.configureHostResolver({
      enableBuiltInResolver: true,
      secureDnsMode: "automatic",
      secureDnsServers: [
        "https://cloudflare-dns.com/dns-query",
        "https://dns.google/dns-query",
      ],
    });
  } catch (e) {
    console.warn("[dns] configuration DoH du renderer impossible :", e?.message || e);
  }

  // Avant le renderer : le stockage Supabase lit ce fichier.
  initSharedSession(app);

  // Connexion ou déconnexion depuis le Hub ou une autre app Nartya.
  stopSessionWatch = watchSharedSession((value) => {
    mainWindow?.webContents.send("session:changed", value);
  });

  // Sans session, le Hub s'ouvre d'abord et la fenêtre attend la connexion, plutôt qu'un écran
  // « va dans le Hub » sous le Hub. Hors ligne, on montre directement l'app (téléchargements).
  const hasSession = !!getItem("nartya-auth");
  const offlineAtBoot = !hasSession && !net.isOnline();
  let deferReveal = false;

  if (!HUB_MANAGED && !offlineAtBoot) {
    if (hasSession) {
      ensureHubRunning();
    } else if (resolveHubExe()) {
      deferReveal = true;
      launchHubExe({ mode: "visible" });
    }
  }

  try {
    await localProxyServer.start();
  } catch (e) {
    console.error("[main] Échec démarrage proxy local:", e);
  }

  // nartya:// n'est pas fiable sous Linux/ChromeOS.
  try {
    await authCallbackServer.start((url) => handleDeepLink(url));
  } catch (e) {
    console.error("[main] Échec démarrage serveur callback OAuth:", e);
  }

  const initialLink = extractDeepLink(process.argv);
  if (initialLink) pendingDeepLink = initialLink;

  const win = createWindow({ autoReveal: !deferReveal });

  if (deferReveal) {
    // Normalement révélée par `app:focus` ; filet assez long pour se connecter dans le Hub.
    const GATE_TIMEOUT_MS = 90_000;
    const fallback = setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) {
        win.show();
        win.focus();
      }
    }, GATE_TIMEOUT_MS);
    win.once("show", () => clearTimeout(fallback));
  }

  initDownloads(app, () => mainWindow);
  initCast(() => mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", flushDownloads);

app.on("window-all-closed", () => {
  flushDownloads();
  stopSessionWatch();
  shutdownCast();
  localProxyServer.stop();
  authCallbackServer.stop();
  discordRPC.destroy();
  if (process.platform !== "darwin") app.quit();
});
