/**
 * Contrat unique entre la page et la plateforme qui l'héberge (coque Tauri, Capacitor, web).
 * Chaque adaptateur déclare ce qu'il sait faire ; le reste retombe sur le comportement du web.
 *
 * Capacités optionnelles : leur simple présence dit ce que la plateforme sait faire (le front
 * teste `platform.getCaptchaToken`), elles ne reçoivent donc pas de valeur par défaut.
 *   fetchEmbedUrl, getCaptchaToken, getAnime4kCapabilities, saveImage, softwareDecode
 */

export const noop = () => {};

/** Clés de tout adaptateur, avec la nature attendue : « fn » ou « value » (donnée, objet ou null). */
export const PLATFORM_SHAPE = {
  name: "value",
  os: "value",
  isMobile: "value",
  isDesktop: "value",
  getMachineId: "fn",
  resolveStream: "fn",
  // Modules natifs : `null` quand la plateforme ne les a pas, le front le traite comme le web.
  downloads: "value",
  session: "value",
  cast: "value",
  hub: "value",
  discord: "value",
  openExternal: "fn",
  openAuth: "fn",
  getAuthRedirectUrl: "fn",
  onAuthCallback: "fn",
  onNavigate: "fn",
  getVersion: "fn",
  installUpdate: "fn",
  setOrientation: "fn",
  setBrightness: "fn",
  getVolume: "fn",
  setVolume: "fn",
  captureVolumeButtons: "fn",
  onVolumeChange: "fn",
  nativePip: "value",
  haptic: "fn",
  share: "fn",
  canOpenNewWindow: "value",
  openNewWindow: "fn",
  quit: "fn",
  focusWindow: "fn",
};

export const OPTIONAL_CAPABILITIES = [
  "fetchEmbedUrl",
  "getCaptchaToken",
  "getAnime4kCapabilities",
  "saveImage",
  "softwareDecode",
];

/** Comportement du navigateur : ce que fait une plateforme qui ne déclare rien. */
const webDefaults = {
  name: "web",
  os: null,
  isMobile: false,
  isDesktop: false,
  getMachineId: async () => null,
  resolveStream: async () => ({
    success: false,
    error: "Lecteur disponible uniquement dans l'app Nartya",
  }),
  downloads: null,
  session: null,
  cast: null,
  hub: null,
  discord: null,
  openExternal: (url) => window.open(url, "_blank", "noopener,noreferrer"),
  async openAuth(url) {
    window.location.assign(url);
    return { opened: true };
  },
  getAuthRedirectUrl: async () => null,
  onAuthCallback: noop,
  onNavigate: () => noop,
  getVersion: async () => null,
  installUpdate: async ({ url } = {}) => {
    window.open(url, "_blank", "noopener,noreferrer");
    return { opened: true };
  },
  setOrientation: noop,
  setBrightness: noop,
  getVolume: async () => null,
  setVolume: noop,
  captureVolumeButtons: noop,
  onVolumeChange: () => noop,
  nativePip: null,
  haptic: () => navigator.vibrate?.(10),
  share: async (data) => {
    if (!navigator.share) return false;
    await navigator.share(data);
    return true;
  },
  canOpenNewWindow: false,
  openNewWindow: noop,
  quit: noop,
  focusWindow: noop,
};

/** Une plateforme = les défauts du web + ce que l'adaptateur sait faire de mieux. */
export function definePlatform(overrides) {
  return { ...webDefaults, ...overrides };
}
