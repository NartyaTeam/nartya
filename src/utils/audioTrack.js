/**
 * Le serveur indexe toutes les pistes du master, `hls.audioTracks` seulement celles du groupe
 * courant : on apparie sur la langue, l'index ne servant que de repli.
 */

const normalizeTag = (value) => String(value ?? "").trim().toLowerCase();

/** « fr-FR », « fra », « fre » → « fr ». */
function primarySubtag(value) {
  const base = normalizeTag(value).split(/[-_]/)[0];
  return base === "fre" || base === "fra" ? "fr" : base;
}

/**
 * @param {Array<{lang?:string,name?:string}>} tracks pistes exposées par hls.js
 * @param {{index?:number,lang?:string,name?:string}|null} preferred recommandation serveur
 * @returns {number} index dans `tracks`, ou -1 si aucune correspondance sûre
 */
export function findPreferredAudioIndex(tracks, preferred) {
  if (!Array.isArray(tracks) || tracks.length === 0 || !preferred) return -1;

  const lang = normalizeTag(preferred.lang);
  const name = normalizeTag(preferred.name);

  if (lang) {
    const exact = tracks.findIndex((t) => normalizeTag(t?.lang) === lang);
    if (exact >= 0) return exact;
    const base = primarySubtag(lang);
    const loose = tracks.findIndex((t) => primarySubtag(t?.lang) && primarySubtag(t?.lang) === base);
    if (loose >= 0) return loose;
  }
  if (name) {
    const byName = tracks.findIndex((t) => normalizeTag(t?.name) === name);
    if (byName >= 0) return byName;
  }
  if (!lang && !name && Number.isInteger(preferred.index) && tracks[preferred.index]) {
    return preferred.index;
  }
  return -1;
}
