/**
 * Surcharge sur `:root` les variables de `src/styles/theme.css` : seul l'accent et ses dérivées
 * changent.
 */

// Encre sur teinte claire, crème sur teinte sombre.
const FG_INK = "32 28 35";
const FG_LIGHT = "255 245 224";

export function foregroundFor(triplet) {
  const [r, g, b] = triplet.split(" ").map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? FG_INK : FG_LIGHT;
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

export function applyTheme({ themePreset, customColor } = {}) {
  if (typeof document === "undefined") return;

  let palette = THEME_PRESETS[themePreset] || THEME_PRESETS[DEFAULT_PRESET];
  if (themePreset === "custom") {
    palette = {
      ...THEME_PRESETS[DEFAULT_PRESET],
      primary: hexToTriplet(customColor) || THEME_PRESETS[DEFAULT_PRESET].primary,
    };
  }

  const root = document.documentElement;
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
