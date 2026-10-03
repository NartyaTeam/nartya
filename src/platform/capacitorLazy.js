let loaded = null;

// Sans charger @capacitor/core : le pont natif injecte `window.Capacitor` avant le premier script.
const nativeOs =
  typeof window !== "undefined" && window.Capacitor?.getPlatform?.() === "ios" ? "ios" : "android";

// iOS zoome sur un champ en dessous de 16 px et ne dézoome jamais.
if (nativeOs === "ios" && typeof document !== "undefined") {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover",
    );
}

function implementation() {
  if (!loaded) loaded = import("./capacitor.js").then((module) => module.capacitorPlatform);
  return loaded;
}

export function preloadCapacitor() {
  void implementation();
}

const asyncCall = (key) => (...args) => implementation().then((platform) => platform[key](...args));
const voidCall = (key) => (...args) => void implementation().then((platform) => platform[key](...args));
const listener = (key) => (...args) => {
  let unsubscribe = null;
  let cancelled = false;
  implementation().then((platform) => {
    if (!cancelled) unsubscribe = platform[key](...args);
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
};
const downloadCall = (key) => (...args) =>
  implementation().then((platform) => platform.downloads[key](...args));
const downloadListener = (key) => (...args) => {
  let unsubscribe = null;
  let cancelled = false;
  implementation().then((platform) => {
    if (!cancelled) unsubscribe = platform.downloads[key](...args);
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
};

export const capacitorLazyPlatform = {
  name: `capacitor-${nativeOs}`,
  os: nativeOs,
  isMobile: true,
  isDesktop: false,
  getMachineId: asyncCall("getMachineId"),
  fetchEmbedUrl: asyncCall("fetchEmbedUrl"),
  resolveStream: asyncCall("resolveStream"),
  downloads: {
    list: downloadCall("list"),
    start: downloadCall("start"),
    cancel: downloadCall("cancel"),
    cancelSeason: downloadCall("cancelSeason"),
    remove: downloadCall("remove"),
    setMaxConcurrent: downloadCall("setMaxConcurrent"),
    localUrl: downloadCall("localUrl"),
    getDir: downloadCall("getDir"),
    chooseDir: downloadCall("chooseDir"),
    openDir: downloadCall("openDir"),
    onProgress: downloadListener("onProgress"),
  },
  session: null,
  cast: null,
  hub: null,
  discord: {
    connect: async () => {},
    setPresence: async () => {},
    clearPresence: async () => {},
  },
  openExternal: asyncCall("openExternal"),
  openAuth: asyncCall("openAuth"),
  getAuthRedirectUrl: asyncCall("getAuthRedirectUrl"),
  getCaptchaToken: asyncCall("getCaptchaToken"),
  onAuthCallback: voidCall("onAuthCallback"),
  onNavigate: listener("onNavigate"),
  getVersion: asyncCall("getVersion"),
  installUpdate: asyncCall("installUpdate"),
  setOrientation: voidCall("setOrientation"),
  setBrightness: voidCall("setBrightness"),
  getVolume: asyncCall("getVolume"),
  setVolume: voidCall("setVolume"),
  captureVolumeButtons: voidCall("captureVolumeButtons"),
  onVolumeChange: listener("onVolumeChange"),
  haptic: voidCall("haptic"),
  share: asyncCall("share"),
  canOpenNewWindow: false,
  openNewWindow: () => {},
  quit: () => {},
  focusWindow: () => {},
};
