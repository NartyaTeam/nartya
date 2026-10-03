import { asset } from "@/lib/asset";
import { isPremiumActive, premiumTier } from "@/lib/premium";

/** Valeur d'un emplacement : `null` (non choisi), `"none"` (vidé) ou l'id de l'item. */

/** Dans l'ordre d'affichage de l'éditeur de profil. */
export const SLOTS = ["ornament", "banner"];

export const SLOT_LABELS = {
  ornament: { title: "Ornement d'avatar", desc: "La parure qui entoure ta photo de profil." },
  banner: { title: "Décor de bannière", desc: "Le motif posé sur l'en-tête de ton profil." },
};

export const ITEMS = {
  ornament: {
    kurotsuki: {
      label: "Sakura",
      tier: "ultimate",
      rgb: "239 35 42",
      shape: "circle",
      frameScale: 132,
      asset: asset("profile-art/kurotsuki/avatar-frame.png?v=20260915-sakura2"),
    },
    raijin: {
      label: "Brigade Fantôme",
      tier: "ultimate",
      rgb: "186 79 255",
      shape: "circle",
      frameScale: 125,
      asset: asset("profile-art/raijin/avatar-frame.png"),
    },
    grand_line: {
      label: "Grand Line",
      tier: "ultimate",
      rgb: "28 143 153",
      shape: "circle",
      frameScale: 130,
      asset: asset("profile-art/grand-line/avatar-frame.png?v=20260910-manga"),
    },
  },
  banner: {
    kurotsuki: {
      label: "Sakura",
      tier: "ultimate",
      rgb: "239 35 42",
      asset: asset("profile-art/kurotsuki/banner-overlay.png?v=20260910-sakura"),
    },
    raijin: {
      label: "Brigade Fantôme",
      tier: "ultimate",
      rgb: "186 79 255",
      asset: asset("profile-art/raijin/banner-overlay.png"),
    },
    grand_line: {
      label: "Grand Line",
      tier: "ultimate",
      rgb: "28 143 153",
      asset: asset("profile-art/grand-line/banner-overlay.png?v=20260910-manga"),
    },
  },
};

/** `plus` par défaut. */
export function itemMinTier(slot, id) {
  return ITEMS[slot]?.[id]?.tier ?? "plus";
}

export function canUseItem(tier, slot, id) {
  if (!tier || !ITEMS[slot]?.[id]) return false;
  return itemMinTier(slot, id) === "ultimate" ? tier === "ultimate" : true;
}

const storedSlot = (profile, slot) =>
  profile?.[`cosmetic_${slot}`] ?? profile?.[`cosmetic${slot[0].toUpperCase()}${slot.slice(1)}`] ?? null;

const EMPTY = { ornament: null, banner: null };

/**
 * Rien si l'abonnement n'est plus actif. Une valeur inéligible au palier est ignorée à
 * l'affichage, sans être effacée.
 */
export function resolveCosmetics(profile) {
  if (!isPremiumActive(profile)) return EMPTY;
  const tier = premiumTier(profile);
  const pick = (slot) => {
    const own = storedSlot(profile, slot);
    if (!own || own === "none") return null;
    return canUseItem(tier, slot, own) ? own : null;
  };
  return { ornament: pick("ornament"), banner: pick("banner") };
}

/** La bannière commande en premier, sinon l'ornement. */
export function cosmeticAccent(cos) {
  for (const slot of ["banner", "ornament"]) {
    const rgb = ITEMS[slot][cos?.[slot]]?.rgb;
    if (rgb) return rgb;
  }
  return null;
}

/** `squircle` par défaut. */
export function avatarShape(ornamentId) {
  return ITEMS.ornament[ornamentId]?.shape || "squircle";
}

/** `fallback` n'est remplacé que si l'ornement impose un cercle. */
export function avatarShapeClass(ornamentId, fallback) {
  return avatarShape(ornamentId) === "circle" ? "rounded-full" : fallback;
}

export function cosmeticRingStyle(profile) {
  const rgb = cosmeticAccent(resolveCosmetics(profile));
  if (!rgb) return undefined;
  return { boxShadow: `inset 0 0 0 2px rgb(${rgb} / 0.9), inset 0 0 7px rgb(${rgb} / 0.55)` };
}
