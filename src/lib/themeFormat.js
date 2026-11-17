/**
 * Thème communautaire : des valeurs, jamais du code. La même validation sert à l'éditeur, à
 * l'installation d'un thème reçu du serveur et (en miroir SQL) à la publication.
 */

export const THEME_VERSION = 1;

/** Variables de `src/styles/theme.css`, dans l'ordre d'affichage de l'éditeur. */
export const THEME_COLORS = [
  { key: "bg", label: "Fond", cssVar: "--bg" },
  { key: "bg2", label: "Fond secondaire", cssVar: "--bg-2" },
  { key: "surface", label: "Panneaux", cssVar: "--surface" },
  { key: "surface2", label: "Panneaux (survol)", cssVar: "--surface-2" },
  { key: "border", label: "Bordures", cssVar: "--border" },
  { key: "text", label: "Texte", cssVar: "--text" },
  { key: "muted", label: "Texte discret", cssVar: "--muted" },
  { key: "primary", label: "Accent", cssVar: "--primary" },
  { key: "accent", label: "Accent secondaire", cssVar: "--accent" },
  { key: "sakura", label: "Touche décorative", cssVar: "--sakura" },
];

/** Palette d'origine (Kitsune Cut), point de départ de l'éditeur. */
export const DEFAULT_THEME_COLORS = {
  bg: "#17151a",
  bg2: "#1b191f",
  surface: "#201e24",
  surface2: "#2c2931",
  border: "#3d3944",
  text: "#fafafa",
  muted: "#a09ea6",
  primary: "#ff713e",
  accent: "#e8b048",
  sakura: "#ff9682",
};

export const THEME_NAME_MAX = 40;
export const THEME_DESCRIPTION_MAX = 200;

const HEX = /^#[0-9a-f]{6}$/i;

export const hexToTriplet = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminanceOfHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Rapport de contraste WCAG entre deux couleurs hex, de 1 à 21. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminanceOfHex(a), luminanceOfHex(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Texte lisible sur le fond et sur les panneaux : en dessous, le thème rendrait l'app illisible. */
export const MIN_TEXT_CONTRAST = 4.5;
/** L'accent sert de fond de bouton et de texte coloré : seuil plus souple, comme pour les éléments d'interface. */
export const MIN_ACCENT_CONTRAST = 3;

/** Problèmes de lisibilité d'une palette valide, en phrases pour l'éditeur. Vide si tout va bien. */
export function contrastIssues(colors) {
  const issues = [];
  if (contrastRatio(colors.text, colors.bg) < MIN_TEXT_CONTRAST) issues.push("Le texte est trop proche du fond.");
  if (contrastRatio(colors.text, colors.surface) < MIN_TEXT_CONTRAST) issues.push("Le texte est trop proche des panneaux.");
  if (contrastRatio(colors.muted, colors.bg) < 3) issues.push("Le texte discret est presque invisible sur le fond.");
  if (contrastRatio(colors.primary, colors.bg) < MIN_ACCENT_CONTRAST) issues.push("L'accent ne ressort pas assez sur le fond.");
  return issues;
}

const cleanText = (value, max) =>
  typeof value === "string"
    ? // eslint-disable-next-line no-control-regex
      value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max)
    : "";

/**
 * `{ ok: true, theme }` avec uniquement les champs connus, normalisés, ou `{ ok: false, error }`.
 * Tout champ inconnu est ignoré, toute couleur invalide refuse le thème.
 */
export function validateTheme(raw, { requireReadable = true } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Thème invalide." };
  if (raw.v !== THEME_VERSION) return { ok: false, error: "Version de thème non prise en charge." };

  const name = cleanText(raw.name, THEME_NAME_MAX);
  if (name.length < 2) return { ok: false, error: "Donne un nom d'au moins 2 caractères." };

  const colors = {};
  for (const { key, label } of THEME_COLORS) {
    const value = raw.colors?.[key];
    if (typeof value !== "string" || !HEX.test(value)) return { ok: false, error: `Couleur invalide : ${label}.` };
    colors[key] = value.toLowerCase();
  }

  if (requireReadable) {
    const issues = contrastIssues(colors);
    if (issues.length) return { ok: false, error: issues[0] };
  }

  return {
    ok: true,
    theme: {
      v: THEME_VERSION,
      name,
      description: cleanText(raw.description, THEME_DESCRIPTION_MAX),
      colors,
      grain: raw.grain !== false,
    },
  };
}

/** `{ "--bg": "23 21 26", … }`, le format RGB attendu par Tailwind. */
export function themeToVars(theme) {
  const vars = {};
  for (const { key, cssVar } of THEME_COLORS) vars[cssVar] = hexToTriplet(theme.colors[key]);
  return vars;
}

/** Encre ou blanc selon la teinte, pour le texte posé sur l'accent. */
export function foregroundHexFor(hex) {
  const ink = "#201c23";
  const light = "#fafafa";
  return contrastRatio(hex, ink) >= contrastRatio(hex, light) ? ink : light;
}
