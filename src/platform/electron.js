const api = typeof window !== "undefined" ? window.electronAPI : null;
const noop = () => {};

export const electronPlatform = {
  name: "electron",
  os: api?.platform || null,
  isMobile: false,
  isDesktop: true,
  // Décodage GPU réellement désactivé (ChromeOS/Crostini), pas simplement « Linux ».
  softwareDecode: !!api?.hardwareAccelerationDisabled,
  getMachineId: () => api?.getMachineId?.() ?? Promise.resolve(null),
  resolveStream: (payload) =>
    api?.resolveStream?.(payload) ??
    Promise.resolve({ success: false, error: "Résolution native indisponible" }),
  downloads: api?.downloads || null,
  session: api?.session || null,
  cast: api?.cast || null,
  hub: api?.hub || null,
  discord: api?.discord || null,
  openExternal: (url) => api?.openExternal?.(url) ?? window.open(url, "_blank", "noopener,noreferrer"),
  async openAuth(url) {
    try {
      await (api?.openExternal?.(url) ?? Promise.resolve(window.open(url, "_blank", "noopener,noreferrer")));
      return { opened: true };
    } catch (error) {
      return { opened: false, error: error?.message || "Impossible d'ouvrir le navigateur" };
    }
  },
  getAuthRedirectUrl: () => api?.getAuthRedirectUrl?.() ?? Promise.resolve(null),
  onAuthCallback: (cb) => api?.onAuthCallback?.(cb),
  onNavigate: (cb) => api?.onNavigate?.(cb) ?? noop,
  getVersion: () => api?.updater?.getVersion?.() ?? Promise.resolve(null),
  installUpdate: async ({ url } = {}) => {
    await (api?.openExternal?.(url) ?? Promise.resolve(window.open(url, "_blank", "noopener,noreferrer")));
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
  canOpenNewWindow: !!api?.openNewWindow,
  openNewWindow: () => api?.openNewWindow?.(),
  quit: () => api?.quit?.(),
  focusWindow: () => api?.focusWindow?.(),
};
