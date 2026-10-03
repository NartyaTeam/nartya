const { contextBridge, ipcRenderer } = require("electron");

// Sandboxé : aucun module Node (un `require("fs")` ferait avorter le script). Ce que le main
// calcule arrive par `additionalArguments`.
const IS_CROSTINI = process.argv.includes("--nartya-crostini");
const IS_DEV = process.argv.includes("--nartya-dev");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,

  // ChromeOS/Crostini, où le GPU est désactivé.
  hardwareAccelerationDisabled: IS_CROSTINI,

  // Haché, pour le ban machine.
  getMachineId: () => ipcRenderer.invoke("get-machine-id"),

  // Diagnostic local : rien n'est envoyé au serveur.
  getAnime4kCapabilities: () => ipcRenderer.invoke("system:anime4k-capabilities"),

  // Ce qui identifie l'hébergeur reste dans le main.
  resolveStream: (payload) => ipcRenderer.invoke("resolve-stream", payload || {}),

  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  // Cloudflare refuse l'origine `file://` : fenêtre sur le site. { token } ou { error }.
  getCaptchaToken: () => ipcRenderer.invoke("captcha:get-token"),

  // Partagée avec Nartya Hub.
  session: {
    get: (key) => ipcRenderer.invoke("session:get", key),
    set: (key, value) => ipcRenderer.invoke("session:set", key, value),
    remove: (key) => ipcRenderer.invoke("session:remove", key),
    /** `value` = valeur brute de `nartya-auth`, `null` si effacée. Retourne le désabonnement. */
    onChanged: (cb) => {
      const handler = (_e, value) => cb(value);
      ipcRenderer.on("session:changed", handler);
      return () => ipcRenderer.removeListener("session:changed", handler);
    },
  },

  // Dev uniquement : tester la watch party à deux.
  ...(IS_DEV ? { openNewWindow: () => ipcRenderer.invoke("open-new-window") } : {}),

  // Null si le serveur loopback n'a pas pu démarrer.
  getAuthRedirectUrl: () => ipcRenderer.invoke("get-auth-redirect-url"),

  onAuthCallback: (cb) => {
    if (typeof cb !== "function") return;
    ipcRenderer.removeAllListeners("auth-callback");
    ipcRenderer.on("auth-callback", (_event, url) => cb(url));
  },

  // Deep-link nartya://anime/<slug>.
  onNavigate: (cb) => {
    if (typeof cb !== "function") return () => {};
    const handler = (_event, route) => cb(route);
    ipcRenderer.on("navigate-to", handler);
    return () => ipcRenderer.removeListener("navigate-to", handler);
  },

  discord: {
    connect: (clientId) => ipcRenderer.invoke("discord:connect", clientId),
    setPresence: (params) => ipcRenderer.invoke("discord:set-presence", params),
    clearPresence: () => ipcRenderer.invoke("discord:clear-presence"),
  },

  downloads: {
    list: () => ipcRenderer.invoke("downloads:list"),
    start: (payload) => ipcRenderer.invoke("downloads:start", payload),
    cancel: (id) => ipcRenderer.invoke("downloads:cancel", id),
    cancelSeason: (payload) => ipcRenderer.invoke("downloads:cancel-season", payload),
    remove: (id) => ipcRenderer.invoke("downloads:remove", id),
    setMaxConcurrent: (n) => ipcRenderer.invoke("downloads:set-max-concurrent", n),
    localUrl: (id, rel) => ipcRenderer.invoke("downloads:local-url", id, rel),
    getDir: () => ipcRenderer.invoke("downloads:get-dir"),
    chooseDir: () => ipcRenderer.invoke("downloads:choose-dir"),
    openDir: () => ipcRenderer.invoke("downloads:open-dir"),
    onProgress: (cb) => {
      if (typeof cb !== "function") return () => {};
      const handler = (_event, item) => cb(item);
      ipcRenderer.on("downloads:progress", handler);
      return () => ipcRenderer.removeListener("downloads:progress", handler);
    },
  },

  cast: {
    discover: () => ipcRenderer.invoke("cast:discover"),
    addHost: (ip) => ipcRenderer.invoke("cast:add-host", ip),
    diagnostics: () => ipcRenderer.invoke("cast:diagnostics"),
    start: (deviceId, media) => ipcRenderer.invoke("cast:start", deviceId, media),
    control: (action, value) => ipcRenderer.invoke("cast:control", action, value),
    stop: () => ipcRenderer.invoke("cast:stop"),
    onDevices: (cb) => {
      if (typeof cb !== "function") return () => {};
      const handler = (_e, list) => cb(list);
      ipcRenderer.on("cast:devices", handler);
      return () => ipcRenderer.removeListener("cast:devices", handler);
    },
    onStatus: (cb) => {
      if (typeof cb !== "function") return () => {};
      const handler = (_e, status) => cb(status);
      ipcRenderer.on("cast:status", handler);
      return () => ipcRenderer.removeListener("cast:status", handler);
    },
  },

  // Les mises à jour passent par le Hub : seule la version est exposée.
  updater: {
    getVersion: () => ipcRenderer.invoke("updater:get-version"),
  },

  hub: {
    // { version, lastSeen }, ou null sans hub.
    getInfo: () => ipcRenderer.invoke("hub:get-info"),
    isManaged: () => ipcRenderer.invoke("hub:is-managed"),
    // Repli sur sa page de téléchargement. → { success, fallback }
    open: () => ipcRenderer.invoke("hub:open"),
  },

  quit: () => ipcRenderer.invoke("app:quit"),

  focusWindow: () => ipcRenderer.invoke("app:focus"),
});
