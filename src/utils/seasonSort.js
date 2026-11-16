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

/**
 * Saisons, sagas, films, puis extras. L'index d'origine départage. Quand la fiche range ses
 * saisons en sections (`group` : « Trame principale », « Anime Version Kai »…), c'est l'ordre
 * de la fiche qui compte, sections comme contenu : la trame principale de fate est un ordre de
 * visionnage choisi (Unlimited Blade Works avant Zero), qu'un tri par numéro défaisait.
 */
export function sortSeasonsForDisplay(seasons = []) {
  const vues = new Set();
  const sections = new Map();
  const sectionnee = seasons.some((season) => season?.group);
  return seasons
    .filter((season) => season && !vues.has(season.id) && vues.add(season.id))
    .map((season, index) => {
      if (!sections.has(season.group)) sections.set(season.group, sections.size);
      return {
        season,
        index,
        section: sections.get(season.group),
        ...groupAndNumber(String(season.id || "").toLowerCase()),
      };
    })
    .sort((a, b) =>
      sectionnee
        ? a.section - b.section || a.index - b.index
        : a.group - b.group || a.number - b.number || a.index - b.index
    )
    .map(({ season }) => season);
}
