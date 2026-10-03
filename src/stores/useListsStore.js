import { create } from "zustand";
import { toast } from "@/lib/toast";
import { listMyAnimeLists, setAnimeStatus, removeAnimeStatus, getAnimeStatus } from "@/api/lists";
import { useAuthStore } from "@/stores/useAuthStore";
import { isGuestSession } from "@/lib/guest";

/** Chargée une fois ; mutations optimistes avec rollback. */
let inflight = null;

export const useListsStore = create((set, get) => ({
  statuses: new Map(), // slug -> "watching" | "planned" | "completed" | "dropped"
  loaded: false,

  ensureLoaded() {
    if (get().loaded || inflight) return;
    if (!useAuthStore.getState().session || isGuestSession()) return;
    inflight = listMyAnimeLists()
      .then((rows) =>
        set({ statuses: new Map(rows.map((r) => [r.anime_slug, r.status])), loaded: true })
      )
      .catch(() => {})
      .finally(() => {
        inflight = null;
      });
  },

  async setStatus(slug, status, meta = {}) {
    const prev = get().statuses.get(slug) || null;
    const next = new Map(get().statuses);
    next.set(slug, status);
    set({ statuses: next });
    try {
      await setAnimeStatus({ slug, status, title: meta.title, cover: meta.cover });
      return true;
    } catch {
      const rb = new Map(get().statuses);
      if (prev) rb.set(slug, prev);
      else rb.delete(slug);
      set({ statuses: rb });
      toast.error("Impossible de mettre à jour ta liste");
      return false;
    }
  },

  /** Ne remplace pas un statut déjà posé. Vérifie en base : le store peut ne pas être chargé. */
  async ensureTracking(slug, meta = {}) {
    if (!slug || !useAuthStore.getState().session || isGuestSession()) return;
    if (get().statuses.get(slug)) return;
    try {
      const existing = await getAnimeStatus(slug);
      if (existing) {
        const m = new Map(get().statuses);
        m.set(slug, existing);
        set({ statuses: m });
        return;
      }
      await setAnimeStatus({ slug, status: "watching", title: meta.title, cover: meta.cover });
      const m = new Map(get().statuses);
      m.set(slug, "watching");
      set({ statuses: m });
    } catch {
      /* best-effort : le suivi auto ne doit jamais gêner la lecture */
    }
  },

  /** `true` si l'écriture a réussi, pour que l'appelant puisse défaire son retrait local. */
  async remove(slug) {
    const prev = get().statuses.get(slug) || null;
    const next = new Map(get().statuses);
    next.delete(slug);
    set({ statuses: next });
    try {
      await removeAnimeStatus(slug);
      return true;
    } catch {
      const rb = new Map(get().statuses);
      if (prev) rb.set(slug, prev);
      set({ statuses: rb });
      toast.error("Impossible de mettre à jour ta liste");
      return false;
    }
  },

  reset() {
    inflight = null;
    set({ statuses: new Map(), loaded: false });
  },
}));

let lastUserId = useAuthStore.getState().session?.user?.id ?? null;
useAuthStore.subscribe((state) => {
  const uid = state.session?.user?.id ?? null;
  if (uid !== lastUserId) {
    lastUserId = uid;
    useListsStore.getState().reset();
  }
});
