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
  resolveStream: async () => ({ success: false, error: "Résolution native indisponible" }),
  getCaptchaToken: () => invoke("get_captcha_token"),
  downloads: null,
  // Partagée avec Nartya Hub.
  session: {
    get: (key) => invoke("session_get", { key }),
    set: (key, value) => invoke("session_set", { key, value }),
    remove: (key) => invoke("session_remove", { key }),
    /** `value` = valeur brute de `nartya-auth`, `null` si effacée. Retourne le désabonnement. */
    onChanged: (cb) => listen("session:changed", cb),
  },
  cast: null,
  hub: {
    // { version, lastSeen }, ou null sans hub.
    getInfo: () => invoke("hub_get_info"),
    isManaged: () => invoke("hub_is_managed"),
    open: () => invoke("hub_open"),
  },
  discord: null,
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
