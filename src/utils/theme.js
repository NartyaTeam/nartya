import { themeToVars, hexToTriplet as strictHexToTriplet, foregroundHexFor, THEME_COLORS } from "@/lib/themeFormat";

/**
 * Surcharge sur `:root` les variables de `src/styles/theme.css`. Sans thème communautaire, seul
 * l'accent et ses dérivées changent ; avec un thème, toute la palette.
 */

// Encre sur teinte claire, blanc sur teinte sombre.
const FG_INK = "32 28 35";
const FG_LIGHT = "250 250 250";

/** Luminance relative WCAG : on garde le texte au meilleur contraste (encre sur corail, blanc sur teinte sombre). */
function luminance(triplet) {
  const [r, g, b] = triplet.split(" ").map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function foregroundFor(triplet) {
  const l = luminance(triplet);
  const contrastInk = (l + 0.05) / (luminance(FG_INK) + 0.05);
  const contrastLight = (luminance(FG_LIGHT) + 0.05) / (l + 0.05);
  return contrastInk >= contrastLight ? FG_INK : FG_LIGHT;
}

/** Triplets "R G B". */
export const THEME_PRESETS = {
  vermillon: { label: "Renard", primary: "255 113 62", accent: "232 176 72", sakura: "255 150 130" },
  sakura: { label: "Sakura", primary: "244 100 140", accent: "232 176 72", sakura: "255 175 189" },
};

export const DEFAULT_PRESET = "vermillon";
export const DEFAULT_CUSTOM_COLOR = "#FF713E";

function hexToTriplet(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function tripletToCss(triplet) {
  return `rgb(${(triplet || "").split(" ").join(",")})`;
}

/** Variables posées par un thème communautaire : retirées en bloc quand il est désinstallé. */
const THEME_VARS = [...THEME_COLORS.map((c) => c.cssVar), "--primary-fg"];

export function applyTheme({ themePreset, customColor, activeTheme } = {}) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (activeTheme) {
    for (const [name, value] of Object.entries(themeToVars(activeTheme))) root.style.setProperty(name, value);
    root.style.setProperty("--primary-fg", strictHexToTriplet(foregroundHexFor(activeTheme.colors.primary)));
    root.classList.toggle("theme-no-grain", activeTheme.grain === false);
    return;
  }
  for (const name of THEME_VARS) root.style.removeProperty(name);
  root.classList.remove("theme-no-grain");

  let palette = THEME_PRESETS[themePreset] || THEME_PRESETS[DEFAULT_PRESET];
  if (themePreset === "custom") {
    palette = {
      ...THEME_PRESETS[DEFAULT_PRESET],
      primary: hexToTriplet(customColor) || THEME_PRESETS[DEFAULT_PRESET].primary,
    };
  }

  root.style.setProperty("--primary", palette.primary);
  root.style.setProperty("--primary-fg", foregroundFor(palette.primary));
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--sakura", palette.sakura);
}

/** La classe `reduce-motion` coupe le grain et les animations. */
export function applyReduceMotion(on) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("reduce-motion", !!on);
}
