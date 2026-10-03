import { create } from "zustand";
import { checkBan } from "@/api/ban";
import { deriveBanState } from "@/lib/sessionGuards";

/** `checked` évite un flash de contenu avant la première vérification. */
export const useBanStore = create((set) => ({
  checked: false,
  banned: false,
  kind: null, // 'account' | 'machine'
  reason: null,
  until: null, // ISO string | null (permanent)

  apply: (s) => set({ ...deriveBanState(s), checked: true }),

  markChecked: () => set({ checked: true }),

  check: async () => {
    try {
      const s = await checkBan();
      set({ ...deriveBanState(s), checked: true });
    } catch {
      // Réseau indisponible : on n'infère pas un ban.
      set({ checked: true });
    }
  },
}));
