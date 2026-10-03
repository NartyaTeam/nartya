import { create } from "zustand";

/**
 * La modale doit rester montée pendant toute la déconnexion, alors que `signOut()` fait
 * démonter la route `/settings` : son état vit donc hors de la page.
 */
export const useSignOutModalStore = create((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
