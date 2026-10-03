// Groupes déduits de l'ID (`saison3`, `saga2`, `film`…), pas du libellé, souvent un nom d'arc.
const ID_GROUPS = [/^saisons?(\d+)/i, /^sagas?(\d+)/i, /^films?(\d+)?$|^movies?(\d+)?$/i];

function groupAndNumber(id) {
  for (let group = 0; group < ID_GROUPS.length; group++) {
    const match = id.match(ID_GROUPS[group]);
    if (match) return { group, number: match[1] ? Number(match[1]) : Number.POSITIVE_INFINITY };
  }
  // OAV, spéciaux, hors-série, dans l'ordre de la fiche.
  return { group: ID_GROUPS.length, number: Number.POSITIVE_INFINITY };
}

/** Saisons, sagas, films, puis extras. L'index d'origine départage. */
export function sortSeasonsForDisplay(seasons = []) {
  return seasons
    .map((season, index) => ({
      season,
      index,
      ...groupAndNumber(String(season?.id || "").toLowerCase()),
    }))
    .sort((a, b) => a.group - b.group || a.number - b.number || a.index - b.index)
    .map(({ season }) => season);
}
