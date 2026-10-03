import { create } from "zustand";
import { ACHIEVEMENT_TIERS_BY_ID } from "@/data/achievements";

/** Plusieurs paliers peuvent tomber sur le même battement : on les joue l'un après l'autre. */
export const useAchievementUnlockStore = create((set) => ({
  queue: [],
  // Taille de la salve en cours, pour afficher « 2 / 3 ».
  batch: 0,

  enqueue: (ids) =>
    set((state) => {
      const fresh = (ids || []).filter(
        (id) => ACHIEVEMENT_TIERS_BY_ID[id] && !state.queue.includes(id)
      );
      if (!fresh.length) return state;
      return {
        queue: [...state.queue, ...fresh],
        batch: state.batch + fresh.length,
      };
    }),

  dismiss: () =>
    set((state) => {
      const queue = state.queue.slice(1);
      return { queue, batch: queue.length ? state.batch : 0 };
    }),

  clear: () => set({ queue: [], batch: 0 }),
}));

/** Appelé hors composant, depuis le battement du lecteur. */
export const celebrateAchievements = (ids) =>
  useAchievementUnlockStore.getState().enqueue(ids);
