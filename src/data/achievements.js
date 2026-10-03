import nightOwl1 from "@/assets/achievements/night_owl_1.png";
import nightOwl2 from "@/assets/achievements/night_owl_2.png";
import nightOwl3 from "@/assets/achievements/night_owl_3.png";
import marathon1 from "@/assets/achievements/marathon_1.png";
import marathon2 from "@/assets/achievements/marathon_2.png";
import marathon3 from "@/assets/achievements/marathon_3.png";
import watchTime1 from "@/assets/achievements/watch_time_1.png";
import watchTime2 from "@/assets/achievements/watch_time_2.png";
import watchTime3 from "@/assets/achievements/watch_time_3.png";
import completion1 from "@/assets/achievements/completion_1.png";
import completion2 from "@/assets/achievements/completion_2.png";
import completion3 from "@/assets/achievements/completion_3.png";

/**
 * Attribution côté serveur : les seuils doivent rester synchronisés avec `achievement_tier()`.
 * `metric` = clé du compteur de `get_achievements()` ; les identifiants `<famille>_<palier>`
 * servent de clé en base.
 */
export const ACHIEVEMENT_FAMILIES = [
  {
    id: "night_owl",
    name: "Oiseau de nuit",
    description: "Termine des épisodes après minuit.",
    metric: "nightEpisodes",
    unit: "episodes",
    tiers: [
      { level: 1, name: "Veilleur", threshold: 1, badge: nightOwl1 },
      { level: 2, name: "Noctambule", threshold: 10, badge: nightOwl2 },
      { level: 3, name: "Maître de l'éclipse", threshold: 50, badge: nightOwl3 },
    ],
  },
  {
    id: "marathon",
    name: "Flamme du marathon",
    description: "Bats ton record d'épisodes réellement vus en une journée.",
    metric: "bestDayEpisodes",
    unit: "episodes",
    tiers: [
      { level: 1, name: "Étincelle", threshold: 3, badge: marathon1 },
      { level: 2, name: "Brasier", threshold: 5, badge: marathon2 },
      { level: 3, name: "Feu légendaire", threshold: 8, badge: marathon3 },
    ],
  },
  {
    id: "watch_time",
    name: "Le temps s'écoule",
    description: "Cumule du temps de visionnage vérifié.",
    metric: "trustedSeconds",
    unit: "seconds",
    tiers: [
      { level: 1, name: "Première heure", threshold: 3_600, badge: watchTime1 },
      { level: 2, name: "Hors du temps", threshold: 18_000, badge: watchTime2 },
      { level: 3, name: "Éternité", threshold: 43_200, badge: watchTime3 },
    ],
  },
  {
    id: "completion",
    name: "Jusqu'au bout",
    description: "Termine des saisons complètes.",
    metric: "completedSeasons",
    unit: "seasons",
    tiers: [
      { level: 1, name: "Premier voyage", threshold: 1, badge: completion1 },
      { level: 2, name: "Pèlerin", threshold: 5, badge: completion2 },
      { level: 3, name: "Gardien du torii", threshold: 20, badge: completion3 },
    ],
  },
];

/** `night_owl_2`, `watch_time_3`… */
export const tierId = (familyId, level) => `${familyId}_${level}`;

/**
 * Additif : le II ajoute trames et rayons, le III l'or et les braises. Le I reprend l'accent
 * du membre ; les II et III ont leur métal propre.
 */
export const ACHIEVEMENT_TIER_LOOKS = {
  1: { numeral: "I",   label: "Encre", halo: "rgb(var(--primary))", life: 4000, rays: false, tone: false, gloss: false, embers: 0 },
  2: { numeral: "II",  label: "Trame", halo: "rgb(232 226 212)",    life: 5000, rays: true,  tone: true,  gloss: true,  embers: 0 },
  3: { numeral: "III", label: "Éclat", halo: "rgb(227 179 65)",     life: 6500, rays: true,  tone: true,  gloss: true,  embers: 18 },
};

/** `night_owl_2` → { family, tier } */
export const ACHIEVEMENT_TIERS_BY_ID = Object.fromEntries(
  ACHIEVEMENT_FAMILIES.flatMap((family) =>
    family.tiers.map((tier) => [tierId(family.id, tier.level), { family, tier }])
  )
);

/** Arrive en secondes, s'affiche en heures/minutes. */
export function formatAchievementValue(family, value) {
  if (family.unit === "seconds") {
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    return hours ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${minutes} min`;
  }
  if (family.unit === "seasons") return `${value} saison${value > 1 ? "s" : ""}`;
  return `${value} épisode${value > 1 ? "s" : ""}`;
}
