import { create } from "zustand";
import { listFavorites } from "@/api/favorites";
import { useAuthStore } from "@/stores/useAuthStore";
import { isGuestSession } from "@/lib/guest";

/** Chargés une fois : indicateur « déjà en favori » sans requête par carte. */

let inflight = null;

export const useFavoritesStore = create((set, get) => ({
  slugs: new Set(),
  loaded: false,

  ensureLoaded() {
    if (get().loaded || inflight) return;
    if (!useAuthStore.getState().session || isGuestSession()) return;
    inflight = listFavorites()
      .then((rows) => set({ slugs: new Set(rows.map((r) => r.anime_slug)), loaded: true }))
      .catch(() => {})
      .finally(() => {
        inflight = null;
      });
  },

  markFavorite(slug) {
    set((s) => {
      if (s.slugs.has(slug)) return s;
      const next = new Set(s.slugs);
      next.add(slug);
      return { slugs: next };
    });
  },

  unmarkFavorite(slug) {
    set((s) => {
      if (!s.slugs.has(slug)) return s;
      const next = new Set(s.slugs);
      next.delete(slug);
      return { slugs: next };
    });
  },

  reset() {
    inflight = null;
    set({ slugs: new Set(), loaded: false });
  },
}));

let lastUserId = useAuthStore.getState().session?.user?.id ?? null;
useAuthStore.subscribe((state) => {
  const uid = state.session?.user?.id ?? null;
  if (uid !== lastUserId) {
    lastUserId = uid;
    useFavoritesStore.getState().reset();
  }
});
