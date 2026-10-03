import { create } from "zustand";

/** Plus de limite d'appareils : le créneau ne sert qu'à la présence. */
export const useDeviceStore = create((set) => ({
  checked: false,
  active: 0,

  apply: (r) => set({ active: r?.active ?? 0, checked: true }),

  markChecked: () => set({ checked: true }),

  reset: () => set({ checked: false, active: 0 }),
}));
