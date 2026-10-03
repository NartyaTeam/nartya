import { useAuthStore } from "@/stores/useAuthStore";

export const PREMIUM_TIERS = {
  plus: { label: "Nartya +", short: "Supporter" },
  ultimate: { label: "Ultimate", short: "Ultimate" },
};

export function isPremiumActive(p) {
  const tier = p?.premium_tier ?? p?.premiumTier;
  if (!tier) return false;
  const until = p?.premium_until ?? p?.premiumUntil;
  if (!until) return true;
  return new Date(until).getTime() > Date.now();
}

export function premiumTier(p) {
  return isPremiumActive(p) ? p?.premium_tier ?? p?.premiumTier : null;
}

/** Gratuit 12, + 30, Ultimate illimité. */
export function pinnedLimit(p) {
  const t = premiumTier(p);
  return t === "ultimate" ? Infinity : t === "plus" ? 30 : 12;
}

/** Gratuit 2, + 5, Ultimate illimité (99). */
export function downloadConcurrency(p) {
  const t = premiumTier(p);
  return t === "ultimate" ? 99 : t === "plus" ? 5 : 2;
}

/** Gratuit 5, + 10, Ultimate illimité. */
export function partyCapacityForTier(tier) {
  return tier === "ultimate" ? Infinity : tier === "plus" ? 10 : 5;
}

export const useIsPremium = () => useAuthStore((s) => isPremiumActive(s.user));

export const usePremiumTier = () => useAuthStore((s) => premiumTier(s.user));
