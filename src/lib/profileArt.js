import { asset } from "./asset";

export const KUROTSUKI = {
  id: "kurotsuki",
  label: "Sakura",
  subtitle: "Printemps shōjo",
  rgb: "239 35 42",
  background: asset("profile-art/kurotsuki/banner-background.png"),
  overlay: asset("profile-art/kurotsuki/banner-overlay.png?v=20260910-sakura"),
  frame: asset("profile-art/kurotsuki/avatar-frame.png?v=20260915-sakura2"),
};

export const RAIJIN = {
  id: "raijin",
  label: "Brigade Fantôme",
  subtitle: "Toile nocturne",
  rgb: "186 79 255",
  background: asset("profile-art/raijin/banner-background.png"),
  overlay: asset("profile-art/raijin/banner-overlay.png"),
  frame: asset("profile-art/raijin/avatar-frame.png"),
};

export const GRAND_LINE = {
  id: "grand_line",
  label: "Grand Line",
  subtitle: "Cap vers l'inconnu",
  rgb: "28 143 153",
  // Le paramètre invalide les anciens PNG en cache.
  background: asset("profile-art/grand-line/banner-background.png?v=20260910-manga"),
  overlay: asset("profile-art/grand-line/banner-overlay.png?v=20260910-manga"),
  frame: asset("profile-art/grand-line/avatar-frame.png?v=20260910-manga"),
};

export const PROFILE_ARTS = [KUROTSUKI, RAIJIN, GRAND_LINE];

export function profileArt(token) {
  return PROFILE_ARTS.find((item) => item.id === token) || null;
}
