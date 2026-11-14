const tauri = typeof window !== "undefined" ? window.__TAURI__ : null;
const noop = () => {};

const invoke = (command, args) => tauri.core.invoke(command, args);

/** `listen` rend une promesse de désabonnement : on retourne un désabonnement synchrone. */
function listen(event, cb) {
  let off = null;
  let cancelled = false;
  tauri.event
    .listen(event, (e) => cb(e.payload))
    .then((unlisten) => {
      if (cancelled) unlisten();
      else off = unlisten;
    });
  return () => {
    cancelled = true;
    off?.();
  };
}

function detectOs() {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "win32";
  if (/Mac/i.test(ua)) return "darwin";
  return "linux";
}

const openExternal = (url) => invoke("open_external", { url });

let stopAuthCallback = noop;

// Les modules absents de la coque Tauri restent à `null` : le front les traite comme sur le web.
export const tauriPlatform = {
  name: "tauri",
  os: detectOs(),
  isMobile: false,
  isDesktop: true,
  softwareDecode: false,
  getMachineId: () => invoke("get_machine_id"),
  getAnime4kCapabilities: () => invoke("get_anime4k_capabilities"),
  resolveStream: (payload) => invoke("resolve_stream", { payload: payload || {} }),
  getCaptchaToken: () => invoke("get_captcha_token"),
  // Même index et mêmes dossiers qu'Electron : la bibliothèque hors ligne est partagée.
  downloads: {
    list: () => invoke("downloads_list"),
    start: (payload) => invoke("downloads_start", { payload }),
    cancel: (id) => invoke("downloads_cancel", { id }),
    cancelSeason: (payload) => invoke("downloads_cancel_season", { payload }),
    remove: (id) => invoke("downloads_remove", { id }),
    setMaxConcurrent: (n) => invoke("downloads_set_max_concurrent", { n: Number(n) || 1 }),
    localUrl: (id, rel) => invoke("downloads_local_url", { id, rel: rel || null }),
    getDir: () => invoke("downloads_get_dir"),
    chooseDir: () => invoke("downloads_choose_dir"),
    openDir: () => invoke("downloads_open_dir"),
    onProgress: (cb) => (typeof cb === "function" ? listen("downloads:progress", cb) : noop),
  },
  // Partagée avec Nartya Hub.
  session: {
    get: (key) => invoke("session_get", { key }),
    set: (key, value) => invoke("session_set", { key, value }),
    remove: (key) => invoke("session_remove", { key }),
    /** `value` = valeur brute de `nartya-auth`, `null` si effacée. Retourne le désabonnement. */
    onChanged: (cb) => listen("session:changed", cb),
  },
  // Le serveur LAN et la découverte mDNS vivent dans la coque ; mêmes événements qu'Electron.
  cast: {
    discover: () => invoke("cast_discover"),
    addHost: (ip) => invoke("cast_add_host", { ip: String(ip || "") }),
    diagnostics: () => invoke("cast_diagnostics"),
    start: (deviceId, media) => invoke("cast_start", { deviceId, media }),
    control: (action, value) => invoke("cast_control", { action, value: value ?? null }),
    stop: () => invoke("cast_stop"),
    onDevices: (cb) => (typeof cb === "function" ? listen("cast:devices", cb) : noop),
    onStatus: (cb) => (typeof cb === "function" ? listen("cast:status", cb) : noop),
  },
  hub: {
    // { version, lastSeen }, ou null sans hub.
    getInfo: () => invoke("hub_get_info"),
    isManaged: () => invoke("hub_is_managed"),
    open: () => invoke("hub_open"),
  },
  discord: {
    connect: (clientId) => invoke("discord_connect", { clientId: String(clientId) }),
    setPresence: (params) => invoke("discord_set_presence", { params }),
    clearPresence: () => invoke("discord_clear_presence"),
  },
  openExternal,
  async openAuth(url) {
    try {
      await openExternal(url);
      return { opened: true };
    } catch (error) {
      return { opened: false, error: error?.message || "Impossible d'ouvrir le navigateur" };
    }
  },
  getAuthRedirectUrl: () => invoke("get_auth_redirect_url"),
  onAuthCallback: (cb) => {
    if (typeof cb !== "function") return;
    stopAuthCallback();
    stopAuthCallback = listen("auth-callback", cb);
  },
  onNavigate: (cb) => (typeof cb === "function" ? listen("navigate-to", cb) : noop),
  getVersion: () => invoke("get_version"),
  installUpdate: async ({ url } = {}) => {
    await openExternal(url);
    return { opened: true };
  },
  setOrientation: noop,
  setBrightness: noop,
  getVolume: async () => null,
  setVolume: noop,
  captureVolumeButtons: noop,
  onVolumeChange: () => noop,
  nativePip: null,
  haptic: noop,
  share: async () => false,
  canOpenNewWindow: false,
  openNewWindow: noop,
  quit: () => invoke("app_quit"),
  focusWindow: () => invoke("app_focus"),
};
