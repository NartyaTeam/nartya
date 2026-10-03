import { create } from "zustand";
import { getApiBaseUrl } from "@/config/config";

/** `navigator.onLine` ment souvent : seule une réponse HTTP de l'API prouve qu'on est en ligne. */
// Les coupures franches passent par l'événement `offline` ; ce ping repère une connexion sans Internet.
const PING_INTERVAL_MS = 120_000;
const PING_TIMEOUT_MS = 7_500;
// Un ping isolé peut échouer sans panne réelle.
const FAILURES_BEFORE_OFFLINE = 3;
const BOOT_RETRY_DELAYS_MS = [900, 2_000];
let retryTimer = null;
let refreshing = false;

async function probeOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    await fetch(`${getApiBaseUrl()}/v1/health`, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

export const useNetworkStore = create((set, get) => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  checked: false,
  _failures: 0,
  _timer: null,
  _initialized: false,

  init: () => {
    if (get()._initialized) return;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        // Pas de court-circuit sur `navigator.onLine` : au démarrage, il renvoie souvent un faux « hors ligne ».
        const online = await probeOnline();
        if (online) {
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = null;
          set({ online: true, checked: true, _failures: 0 });
          return;
        }

        const failures = get()._failures + 1;
        const confirmedOffline = failures >= FAILURES_BEFORE_OFFLINE;
        set({
          online: confirmedOffline ? false : get().online,
          checked: confirmedOffline ? true : get().checked,
          _failures: failures,
        });

        if (!confirmedOffline) {
          if (retryTimer) clearTimeout(retryTimer);
          const delay = BOOT_RETRY_DELAYS_MS[Math.min(failures - 1, BOOT_RETRY_DELAYS_MS.length - 1)];
          retryTimer = setTimeout(refresh, delay);
        }
      } finally {
        refreshing = false;
      }
    };
    const stopPolling = () => {
      const timer = get()._timer;
      if (timer) clearInterval(timer);
      set({ _timer: null });
    };
    const startPolling = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!get()._timer) set({ _timer: setInterval(refresh, PING_INTERVAL_MS) });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", refresh);
      window.addEventListener("offline", () =>
        set({ online: false, checked: true, _failures: FAILURES_BEFORE_OFFLINE })
      );
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") stopPolling();
        else {
          refresh();
          startPolling();
        }
      });
    }
    refresh();
    set({ _initialized: true });
    startPolling();
  },

  recheck: async () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    const online = await probeOnline();
    set({ online, checked: true, _failures: online ? 0 : FAILURES_BEFORE_OFFLINE });
    return online;
  },
}));
