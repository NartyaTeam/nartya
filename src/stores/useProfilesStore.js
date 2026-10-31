import { create } from "zustand";
import {
  listAccountProfiles,
  enterAccountProfile,
  leaveAccountProfile,
  createAccountProfile,
  updateAccountProfile,
  setAccountProfilePin,
  deleteAccountProfile,
} from "@/api/accountProfiles";
import {
  profileSessionFor,
  setProfileSession,
  updateOpenProfile,
  clearProfileSession,
  onProfileSessionExpired,
} from "@/lib/profileSession";

/**
 * Profils du compte et profil ouvert dans cette fenêtre.
 *
 * `status` : `idle` (pas de compte, invité, hors ligne, liste illisible) → `loading` → `picking` (écran « Qui est
 * là ? ») → `ready`. Après un refus du jeton en cours de route, `reloadAfterEnter` : les stores
 * déjà chargés appartiennent à l'ancien profil, la page repart de zéro une fois le profil choisi.
 */
export const useProfilesStore = create((set, get) => ({
  status: "idle",
  accountId: null,
  profiles: [],
  limit: 3,
  active: null,
  error: null,
  reloadAfterEnter: false,

  /** Au lancement et à chaque changement de compte. */
  sync: async (accountId) => {
    if (!accountId) {
      clearProfileSession();
      set({ status: "idle", accountId: null, profiles: [], active: null, error: null });
      return;
    }
    const open = profileSessionFor(accountId);
    if (!open) clearProfileSession(); // jeton d'un autre compte
    set({
      accountId,
      active: open?.profile ?? null,
      status: open ? "ready" : "loading",
      error: null,
    });
    try {
      await get().refresh();
      if (!open) set({ status: "picking" });
    } catch (e) {
      // Liste illisible (réseau, serveur pas encore à jour) : l'app s'ouvre sur le profil
      // principal, comme avant les profils. Un refus de la base ramènera « Qui est là ? ».
      if (!open) set({ status: "idle", error: e });
    }
  },

  refresh: async () => {
    const data = await listAccountProfiles();
    const profiles = data?.profiles ?? [];
    const active = get().active ? profiles.find((p) => p.id === get().active.id) : null;
    if (active) updateOpenProfile(active);
    set({ profiles, limit: data?.limit ?? 3, active: active ?? get().active });
    return profiles;
  },

  /** `{ ok }` ou `{ ok: false, error, retryAfter }` pour l'écran du code. */
  enter: async (profile, pin = null) => {
    const res = await enterAccountProfile(profile.id, pin);
    if (!res?.ok) return { ok: false, error: res?.error, retryAfter: res?.retry_after ?? null };
    setProfileSession({ accountId: get().accountId, token: res.token, profile: res.profile });
    if (get().reloadAfterEnter) {
      window.location.reload();
      return { ok: true };
    }
    set({ active: res.profile, status: "ready", error: null });
    return { ok: true };
  },

  /** Retour à « Qui est là ? » ; la page est rechargée pour vider les données du profil quitté. */
  switchProfile: async () => {
    try {
      await leaveAccountProfile();
    } catch {
      /* le jeton expirera de lui-même */
    }
    clearProfileSession();
    window.location.reload();
  },

  /** Jeton refusé par la base pendant l'utilisation. */
  expire: () => {
    const { status, accountId } = get();
    if (!accountId || status === "picking" || status === "loading") return;
    clearProfileSession();
    set({ status: "picking", active: null, reloadAfterEnter: true });
    get()
      .refresh()
      .catch(() => {});
  },

  create: async (fields) => {
    const profile = await createAccountProfile(fields);
    await get().refresh();
    return profile;
  },

  update: async (id, fields, pin) => {
    const profile = await updateAccountProfile(id, fields, pin);
    updateOpenProfile(profile);
    if (get().active?.id === id) set({ active: profile });
    await get().refresh();
    return profile;
  },

  setPin: async (id, newPin, currentPin) => {
    const profile = await setAccountProfilePin(id, newPin, currentPin);
    updateOpenProfile(profile);
    await get().refresh();
    return profile;
  },

  remove: async (id, pin) => {
    await deleteAccountProfile(id, pin);
    await get().refresh();
  },
}));

onProfileSessionExpired(() => useProfilesStore.getState().expire());
