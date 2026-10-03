/**
 * Registre des hébergeurs, chargé depuis l'API et gardé en mémoire. Pas un secret : le client
 * doit détenir la recette pour joindre les hébergeurs.
 */

let recipe = null;
let loadedAt = 0;
let inFlight = null;

let credentials = null;

// Ne change qu'aux déploiements de l'API.
const RECIPE_TTL_MS = 60 * 60_000;

export function setRecipeCredentials({ apiBaseUrl, accessToken }) {
  if (!apiBaseUrl) return;
  credentials = { apiBaseUrl, accessToken: accessToken || null };
}

/** Null en cas d'échec : à l'appelant de décider. */
export async function ensureRecipe(creds) {
  if (creds?.apiBaseUrl) setRecipeCredentials(creds);
  if (recipe && Date.now() - loadedAt < RECIPE_TTL_MS) return recipe;
  if (inFlight) return inFlight;
  if (!credentials?.apiBaseUrl) return recipe; // jamais amorcé : on garde l'existant

  inFlight = (async () => {
    try {
      const res = await fetch(`${credentials.apiBaseUrl}/v1/sources/recipe`, {
        headers: credentials.accessToken
          ? { Authorization: `Bearer ${credentials.accessToken}` }
          : {},
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const next = json?.data;
      if (!next?.sources || typeof next.sources !== "object") {
        throw new Error("recette malformée");
      }
      recipe = next;
      loadedAt = Date.now();
      console.log(
        `[recipe] ${Object.keys(next.sources).length} sources chargées (v${next.version})`,
      );
      return recipe;
    } catch (e) {
      console.warn("[recipe] chargement impossible:", e.message);
      // Mieux vaut une recette un peu datée qu'une lecture morte.
      return recipe;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function getRecipe() {
  return recipe;
}

/** `sourceKey` opaque (`s1`…). */
export function getSource(sourceKey) {
  return recipe?.sources?.[sourceKey] || null;
}

/** Pour une URL d'hébergeur non reconnu (CDN tiers). */
export function getDefaultHeaders() {
  return recipe?.defaultHeaders || {};
}

/** Null sans recette chargée. */
export function detectSourceKey(url) {
  if (!url || typeof url !== "string" || !recipe) return null;
  const lower = url.toLowerCase();
  for (const [key, source] of Object.entries(recipe.sources)) {
    if (source.domains?.some((domain) => lower.includes(domain))) return key;
  }
  return null;
}

/** Allowlist anti-SSRF, dérivée de la recette. */
export function isAllowedEmbedHost(hostname) {
  if (!recipe) return false;
  const host = String(hostname || "").toLowerCase();
  for (const source of Object.values(recipe.sources)) {
    for (const domain of source.domains || []) {
      if (host === domain || host.endsWith(`.${domain}`)) return true;
    }
  }
  return false;
}

/** Un motif invalide est ignoré. */
export function recipeRegExp(pattern, flags = "i") {
  if (!pattern || typeof pattern !== "string") return null;
  try {
    return new RegExp(pattern, flags);
  } catch {
    console.warn("[recipe] motif invalide ignoré:", pattern);
    return null;
  }
}

export function resetRecipe() {
  recipe = null;
  loadedAt = 0;
  inFlight = null;
  credentials = null;
}

/** Sans réseau, pour les tests. */
export function setRecipe(next) {
  recipe = next;
  loadedAt = Date.now();
}
