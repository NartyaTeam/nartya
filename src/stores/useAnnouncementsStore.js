import { create } from "zustand";
import * as api from "@/api/announcements";

// Plancher entre deux rechargements (focus, profil, intervalle).
const MIN_REFRESH_INTERVAL_MS = 60_000;
let lastRefreshAt = 0;

/** « Lu » éteint la pastille mais garde l'annonce ; « retirer » la fait disparaître. */
export const useAnnouncementsStore = create((set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  panelOpen: false,

  unreadCount: () => get().items.filter((a) => !a.isRead).length,

  latestUnread: () => get().items.find((a) => !a.isRead) || null,

  refresh: async () => {
    if (get().loading || Date.now() - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return;
    lastRefreshAt = Date.now();
    set({ loading: true });
    try {
      const { items } = await api.getMyAnnouncements({ limit: 20 });
      set({ items, loaded: true });
    } catch {
      /* hors ligne : on garde l'état courant */
    } finally {
      set({ loading: false });
    }
  },

  markAllSeen: async () => {
    const unread = get().items.filter((a) => !a.isRead).map((a) => a.id);
    if (!unread.length) return;
    set({ items: get().items.map((a) => ({ ...a, isRead: true })) });
    try {
      await api.markRead(unread);
    } catch {
      /* best-effort */
    }
  },

  markSeen: async (id) => {
    const target = get().items.find((a) => a.id === id);
    if (!target || target.isRead) return;
    set({ items: get().items.map((a) => (a.id === id ? { ...a, isRead: true } : a)) });
    try {
      await api.markRead([id]);
    } catch {
      /* best-effort */
    }
  },

  dismissOne: async (id) => {
    const prev = get().items;
    set({ items: prev.filter((a) => a.id !== id) });
    try {
      await api.dismiss(id);
    } catch {
      set({ items: prev });
    }
  },

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  reset: () => {
    lastRefreshAt = 0;
    set({ items: [], loaded: false, loading: false, panelOpen: false });
  },
}));
