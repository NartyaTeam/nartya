import { create } from "zustand";
import { getPlanning } from "@/api/animeApi";

/** `lastSeenAt` : dernière ouverture du calendrier, pour la pastille « nouveau ». */
const SEEN_KEY = "nartya_planning_seen";
const TTL_MS = 15 * 60 * 1000;

function loadSeen() {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export const usePlanningStore = create((set, get) => ({
  planning: { days: [], fetchedAt: 0 },
  loading: false,
  loadedAt: 0,
  error: false,
  lastSeenAt: loadSeen(),

  load: async (force = false) => {
    if (!force && get().loadedAt && Date.now() - get().loadedAt < TTL_MS) return;
    if (get().loading) return;
    set({ loading: true, error: false });
    try {
      const planning = await getPlanning();
      set({ planning, loadedAt: Date.now(), loading: false });
    } catch {
      set({ loading: false, error: true });
    }
  },

  markSeen: () => {
    const now = Date.now();
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {}
    set({ lastSeenAt: now });
  },
}));
