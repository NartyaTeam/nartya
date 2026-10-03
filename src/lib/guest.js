import { toast } from "./toast.js";
import { useAuthStore } from "@/stores/useAuthStore";
import { classifySession } from "@/lib/sessionGuards";

/** Compte anonyme : il parcourt et regarde, sans aucune fonctionnalité de compte. */

export const GUEST_FEATURE_MSG = "Crée un compte gratuit pour débloquer cette fonctionnalité";

/** Non réactif, pour les appels hors composant. */
export const isGuestSession = () => classifySession(useAuthStore.getState().session) === "guest";

export function guestBlockToast(msg = GUEST_FEATURE_MSG) {
  toast.info(msg);
}

export const useIsGuest = () => useAuthStore((s) => classifySession(s.session) === "guest");

export const useHasAccount = () => useAuthStore((s) => classifySession(s.session) === "account");
