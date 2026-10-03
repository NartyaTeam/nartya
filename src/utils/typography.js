/**
 * Recolle les élisions cassées (« d’ ogre »). Le préfixe commence hors d'un mot, pour épargner
 * les possessifs anglais (« Pirates' Great Efforts »).
 */
export function normalizeFrenchElisions(value) {
  if (typeof value !== "string" || !value) return value;
  return value
    .replace(/(^|[^\p{L}])(l|d|n|j|c|m|t|s|qu)['’`]\s+(?=\p{L})/giu, "$1$2'")
    .replace(/’/gu, "'");
}
