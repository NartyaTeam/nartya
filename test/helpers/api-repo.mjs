/**
 * `api/` est un dépôt séparé : sans lui, les tests qui en dépendent se déclarent « skipped ».
 * Seul le module manquant est toléré.
 */

export const API_ABSENTE =
  "dépôt api/ absent (dépôt séparé, gitignoré) — cf. test/helpers/api-repo.mjs";

/**
 * @param {string} name chemin dans `api/src/` (suffixe de requête admis pour forcer un rechargement)
 * @returns {Promise<object|null>} `null` si le dépôt API est absent
 */
export async function loadApiModule(name) {
  try {
    return await import(`../../api/src/${name}`);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") return null;
    throw error;
  }
}
