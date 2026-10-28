/** Libellés français des formats, relations et rôles AniList. */

export const FORMAT_LABEL = {
  TV: "Série",
  TV_SHORT: "Format court",
  MOVIE: "Film",
  SPECIAL: "Spécial",
  OVA: "OAV",
  ONA: "ONA",
  MUSIC: "Clip",
  MANGA: "Manga",
  NOVEL: "Light novel",
  ONE_SHOT: "One shot",
};

export const RELATION_LABEL = {
  SEQUEL: "Suite",
  PREQUEL: "Préquelle",
  SIDE_STORY: "Histoire parallèle",
  SPIN_OFF: "Spin-off",
  ALTERNATIVE: "Autre version",
  PARENT: "Œuvre principale",
  SUMMARY: "Résumé",
  ADAPTATION: "Adaptation",
  SOURCE: "Œuvre originale",
  CHARACTER: "Mêmes personnages",
  COMPILATION: "Compilation",
  CONTAINS: "Contient",
  OTHER: "Lié",
};

// Ordre = priorité d'affichage sur la fiche.
const ROLE_LABELS = [
  ["Original Creator", "Auteur original"],
  ["Original Story", "Histoire originale"],
  ["Story & Art", "Scénario et dessin"],
  ["Story", "Scénario"],
  ["Art", "Dessin"],
  ["Director", "Réalisation"],
  ["Series Composition", "Composition"],
  ["Character Design", "Chara-design"],
  ["Music", "Musique"],
];

/** « Director (eps 1-12) » → « Réalisation ». Rôle inconnu : tel quel. */
export function roleLabel(role) {
  const r = (role || "").trim();
  const hit = ROLE_LABELS.find(([en]) => r === en || r.startsWith(`${en} (`));
  return hit ? hit[1] : r;
}

/** Rang du rôle (plus petit = plus important), Infinity si non retenu sur la fiche. */
export function roleRank(role) {
  const r = (role || "").trim();
  const i = ROLE_LABELS.findIndex(([en]) => r === en || r.startsWith(`${en} (`));
  return i < 0 || i > 5 ? Infinity : i;
}

const OCCUPATIONS = {
  Mangaka: "Mangaka",
  Director: "Réalisateur",
  Animator: "Animateur",
  "Character Designer": "Chara-designer",
  Writer: "Scénariste",
  Illustrator: "Illustrateur",
  Composer: "Compositeur",
  Musician: "Musicien",
  "Voice Actor": "Doubleur",
  "Light Novelist": "Auteur de light novels",
  Producer: "Producteur",
  "Storyboard Artist": "Storyboarder",
  "Novelist": "Romancier",
};

/** Métier principal d'une fiche AniList, en français quand il est connu. */
export function occupationLabel(occupation) {
  return OCCUPATIONS[occupation] || occupation;
}
