import { create } from "zustand";
import * as api from "@/api/friends";
import { useAuthStore } from "@/stores/useAuthStore";
import { isGuestSession } from "@/lib/guest";

// Montage, focus et intervalle déclenchent le compteur : le throttle fusionne ces rafales.
const COUNT_THROTTLE_MS = 20000;
let lastCountAt = 0;

/** Actions optimistes avec rollback ; sans effet pour un invité. */
export const useFriendsStore = create((set, get) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  pendingCount: 0,
  loaded: false,
  loading: false,

  _canLoad() {
    return !!useAuthStore.getState().session && !isGuestSession();
  },

  async refresh() {
    if (get().loading || !get()._canLoad()) return;
    set({ loading: true });
    try {
      const [friends, { incoming, outgoing }] = await Promise.all([
        api.listFriends(),
        api.listFriendRequests(),
      ]);
      set({ friends, incoming, outgoing, pendingCount: incoming.length, loaded: true });
    } catch {
      /* hors ligne : on garde l'état courant */
    } finally {
      set({ loading: false });
    }
  },

  async refreshCount(force = false) {
    if (!get()._canLoad()) return;
    const now = Date.now();
    if (!force && now - lastCountAt < COUNT_THROTTLE_MS) return;
    lastCountAt = now;
    try {
      const n = await api.countPendingRequests();
      set({ pendingCount: n });
    } catch {
      lastCountAt = 0; // échec réseau : autorise un nouvel essai
    }
  },

  async sendRequest(handle) {
    const status = await api.sendFriendRequest(handle);
    await get().refresh();
    return status;
  },

  async accept(requesterId) {
    const prev = { incoming: get().incoming, friends: get().friends, pendingCount: get().pendingCount };
    const person = get().incoming.find((p) => p.id === requesterId);
    set({
      incoming: get().incoming.filter((p) => p.id !== requesterId),
      pendingCount: Math.max(0, get().pendingCount - 1),
      friends: person ? [{ ...person, since: new Date().toISOString() }, ...get().friends] : get().friends,
    });
    try {
      await api.respondFriendRequest(requesterId, true);
    } catch (e) {
      set(prev);
      throw e;
    }
  },

  async refuse(requesterId) {
    const prev = { incoming: get().incoming, pendingCount: get().pendingCount };
    set({
      incoming: get().incoming.filter((p) => p.id !== requesterId),
      pendingCount: Math.max(0, get().pendingCount - 1),
    });
    try {
      await api.respondFriendRequest(requesterId, false);
    } catch (e) {
      set(prev);
      throw e;
    }
  },

  async cancelRequest(otherId) {
    const prev = { outgoing: get().outgoing };
    set({ outgoing: get().outgoing.filter((p) => p.id !== otherId) });
    try {
      await api.removeFriend(otherId);
    } catch (e) {
      set(prev);
      throw e;
    }
  },

  async remove(otherId) {
    const prev = { friends: get().friends };
    set({ friends: get().friends.filter((p) => p.id !== otherId) });
    try {
      await api.removeFriend(otherId);
    } catch (e) {
      set(prev);
      throw e;
    }
  },

  reset() {
    lastCountAt = 0;
    set({ friends: [], incoming: [], outgoing: [], pendingCount: 0, loaded: false, loading: false });
  },
}));

let lastUserId = useAuthStore.getState().session?.user?.id ?? null;
useAuthStore.subscribe((state) => {
  const uid = state.session?.user?.id ?? null;
  if (uid !== lastUserId) {
    lastUserId = uid;
    useFriendsStore.getState().reset();
    if (uid) useFriendsStore.getState().refreshCount();
  }
});
