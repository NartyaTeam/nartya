import { create } from "zustand";

/** Stocké par machine : une notification est un événement local. */
const KEY = "nartya_notify_follows";

function load() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persist(set) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {}
}

export const useNotifyStore = create((set, get) => ({
  slugs: load(),

  isFollowing: (slug) => get().slugs.has(slug),

  toggle: (slug) => {
    if (!slug) return false;
    const next = new Set(get().slugs);
    const following = !next.has(slug);
    if (following) next.add(slug);
    else next.delete(slug);
    persist(next);
    set({ slugs: next });
    return following;
  },

  setFollowing: (slug, following) => {
    if (!slug) return;
    const next = new Set(get().slugs);
    if (following) next.add(slug);
    else next.delete(slug);
    persist(next);
    set({ slugs: next });
  },
}));
