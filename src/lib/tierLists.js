/** Palette proposée dans l'éditeur, dans l'ordre classique du haut vers le bas. */
export const TIER_COLORS = [
  "#ff7f7f", "#ffbf7f", "#ffdf7f", "#ffff7f", "#bfff7f", "#7fff7f",
  "#7fffff", "#7fbfff", "#7f7fff", "#ff7fff", "#bf7fbf", "#3b3b3b",
  "#e11d48", "#f97316", "#facc15", "#22c55e", "#0ea5e9", "#a855f7",
];

export const MAX_TIERS = 10;
export const MAX_ITEMS = 400;

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export const makeTier = (label = "", color = "#71717a") => ({ id: newId(), label, color, items: [] });

export const TEMPLATES = [
  {
    id: "classic",
    name: "Classique",
    tiers: [
      ["S", "#ff7f7f"], ["A", "#ffbf7f"], ["B", "#ffdf7f"], ["C", "#ffff7f"], ["D", "#bfff7f"], ["F", "#7fff7f"],
    ],
  },
  {
    id: "goated",
    name: "GOATED → Bof",
    tiers: [
      ["GOATED", "#ff7f7f"],
      ["Presque GOATED", "#ffbf7f"],
      ["Incroyable", "#ffdf7f"],
      ["Très bien", "#ffff7f"],
      ["Bien", "#bfff7f"],
      ["Sympa", "#ffff7f"],
      ["Bof, pas ouf", "#ff7f7f"],
    ],
  },
  {
    id: "watch",
    name: "À voir absolument",
    tiers: [
      ["À voir absolument", "#ff7f7f"], ["Recommandé", "#ffdf7f"], ["Si tu as le temps", "#7fbfff"], ["À éviter", "#3b3b3b"],
    ],
  },
  {
    id: "numbers",
    name: "De 10 à 1",
    tiers: [
      ["10", "#ff7f7f"], ["9", "#ffa07f"], ["8", "#ffbf7f"], ["7", "#ffdf7f"], ["6", "#ffff7f"],
      ["5", "#dfff7f"], ["4", "#bfff7f"], ["3", "#7fff7f"], ["2", "#7fffff"], ["1", "#7fbfff"],
    ],
  },
];

export const tiersFromTemplate = (template) => template.tiers.map(([label, color]) => makeTier(label, color));

/** Texte noir ou blanc selon la clarté du fond. */
export function readableTextColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#ffffff";
}

/** Une œuvre dans une tier list : seulement ce que le serveur garde. */
export const toItem = (a) => ({
  slug: a.slug,
  title: a.title || a.slug,
  cover: /^https:\/\//.test(a.cover || a.image || "") ? a.cover || a.image : "",
});

/** Copie avec des ids de rangée neufs, pour « Faire ma version ». */
export function cloneTiers(tiers) {
  return tiers.map((t) => ({ ...makeTier(t.label, t.color), items: (t.items || []).map(toItem) }));
}
