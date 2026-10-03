import { create } from "zustand";
import {
  castAvailable,
  discoverCastDevices,
  addCastHost,
  getCastDiagnostics,
  startCast as apiStart,
  castControl,
  stopCast as apiStop,
  onCastDevices,
  onCastStatus,
} from "@/api/cast";

const MANUAL_HOSTS_KEY = "nartya-cast-manual-hosts";

function readManualHosts() {
  try {
    const list = JSON.parse(localStorage.getItem(MANUAL_HOSTS_KEY) || "[]");
    return Array.isArray(list) ? list.filter((ip) => typeof ip === "string") : [];
  } catch {
    return [];
  }
}

function saveManualHost(ip) {
  try {
    const list = [...new Set([ip, ...readManualHosts()])].slice(0, 5);
    localStorage.setItem(MANUAL_HOSTS_KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible : l'ajout reste valable pour la session */
  }
}

const ENDED_MESSAGES = {
  "media-error": "La TV n'a pas pu lire cette vidéo.",
  "device-closed": "La TV a mis fin au cast.",
  error: "La connexion avec la TV a été perdue.",
};

export const useCastStore = create((set, get) => ({
  available: castAvailable(),
  devices: [],
  status: null,
  deviceId: null,
  connecting: false,
  diagnostics: null,
  lastError: null,
  // La TV n'a pas su lire la source en cours : { deviceId, at }, pour en relancer une autre.
  mediaFailure: null,
  _subscribed: false,
  _manualTried: false,

  init: () => {
    if (!get().available || get()._subscribed) return;
    set({ _subscribed: true });
    onCastDevices((devices) => set({ devices }));
    onCastStatus((status) => {
      if (status?.ended) {
        const { deviceId, status: prev } = get();
        const mediaError = status.reason === "media-error" && deviceId;
        set({
          status: null,
          deviceId: null,
          connecting: false,
          lastError: mediaError ? null : ENDED_MESSAGES[status.reason] || null,
          mediaFailure: mediaError ? { deviceId, at: prev?.currentTime || 0 } : null,
        });
      } else {
        set({ status, deviceId: status?.deviceId || get().deviceId, connecting: false });
      }
    });
  },

  discover: async () => {
    if (!get().available) return;
    get().init();
    set({ devices: await discoverCastDevices() });
    if (!get()._manualTried) {
      set({ _manualTried: true });
      for (const ip of readManualHosts()) addCastHost(ip);
    }
  },

  addHost: async (ip) => {
    const res = await addCastHost(ip);
    if (res.success) saveManualHost(ip);
    return res;
  },

  loadDiagnostics: async () => set({ diagnostics: await getCastDiagnostics() }),

  cast: async (deviceId, media) => {
    set({ connecting: true, lastError: null });
    const res = await apiStart(deviceId, media);
    if (!res.success) set({ connecting: false });
    else set({ deviceId });
    return res;
  },

  clearError: () => set({ lastError: null }),
  clearMediaFailure: () => set({ mediaFailure: null }),

  play: () => castControl("play"),
  pause: () => castControl("pause"),
  seek: (seconds) => castControl("seek", seconds),
  setVolume: (level) => castControl("volume", level),
  setMuted: (muted) => castControl("mute", muted),

  stop: async () => {
    await apiStop();
    set({ status: null, deviceId: null, connecting: false });
  },

  isCasting: () => !!get().deviceId,
}));
