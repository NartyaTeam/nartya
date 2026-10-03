/**
 * Aucun hébergeur connu ici : l'API envoie pour chaque source un jeton, un libellé neutre et
 * un rang. `key` identifie un lecteur (choix manuel), `source` l'hébergeur (source prioritaire).
 * { key: "eps1", id: "<jeton>", source: "s1", label: "Source A", rank: 10, recommended }
 */

/** Gardés ici pour peupler les Paramètres sans requête. */
const SOURCE_LABELS = {
  s1: "Source A",
  s2: "Source B",
  s3: "Source C",
  s4: "Source D",
  s5: "Source E",
  s6: "Source F",
  s7: "Source G",
  s8: "Source H",
};

export const SELECTABLE_SOURCE_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"];

export function getSourceLabel(sourceKey) {
  return SOURCE_LABELS[sourceKey] || "Source";
}

/**
 * Triée par rang ; entrées malformées écartées.
 * @returns {Array<{key:string,id:string,source:string,label:string,rank:number,recommended:boolean}>}
 */
function normalizeSources(sources) {
  if (!sources || typeof sources !== "object") return [];
  return Object.entries(sources)
    .filter(([, value]) => value && typeof value === "object" && typeof value.id === "string")
    .map(([key, value]) => ({
      key,
      id: value.id,
      source: value.key || null,
      label: value.label || getSourceLabel(value.key),
      rank: Number.isFinite(value.rank) ? value.rank : 999,
      recommended: value.recommended === true,
    }))
    .sort((a, b) => a.rank - b.rank);
}

/** L'étoile marque la source recommandée par le serveur. */
export function sourceOptionLabel(source) {
  return source?.recommended ? `${source.label} ★` : source?.label || "Source";
}

export function sourceSelectOptions(sources, { includeAuto = true } = {}) {
  const options = (Array.isArray(sources) ? sources : [])
    .filter((source) => source && typeof source.key === "string")
    .map((source) => ({ value: source.key, label: sourceOptionLabel(source) }));
  return includeAuto ? [{ value: "auto", label: "Source auto" }, ...options] : options;
}

export function hasPlayableSources(sources) {
  return normalizeSources(sources).length > 0;
}

export function sortSourcesForDisplay(sources) {
  return normalizeSources(sources);
}

/**
 * @param {string} [preferredSource="auto"] lecteur choisi à la main
 * @param {string|null} [prioritySource=null] hébergeur préféré, en tête en auto
 * @param {{ excludeKeys?: string[] }} [options] sources disqualifiées pendant la lecture
 */
export function getPrioritizedSources(
  sources,
  preferredSource = "auto",
  prioritySource = null,
  { excludeKeys = [] } = {}
) {
  const all = normalizeSources(sources);
  if (!all.length) return [];

  const excluded = new Set(excludeKeys);
  const available = all.filter((s) => !excluded.has(s.key));
  if (!available.length) return [];

  if (preferredSource && preferredSource !== "auto") {
    const found = available.find((s) => s.key === preferredSource);
    if (found) return [found];
    if (!excluded.has(preferredSource)) return [];
    // Disqualifiée en lecture : ordre auto des sources restantes.
  }

  if (!prioritySource || prioritySource === "auto") return available;

  return [...available].sort((a, b) => {
    const aPref = a.source === prioritySource;
    const bPref = b.source === prioritySource;
    if (aPref && !bPref) return -1;
    if (!aPref && bPref) return 1;
    return a.rank - b.rank;
  });
}
