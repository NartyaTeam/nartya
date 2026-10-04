const noop = () => {};

export const webPlatform = {
  name: "web",
  os: null,
  isMobile: false,
  isDesktop: false,
  getMachineId: async () => null,
  resolveStream: async () => ({ success: false, error: "Lecteur disponible uniquement dans l'app Nartya" }),
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
