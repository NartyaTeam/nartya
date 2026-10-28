import { occupationLabel } from "@/utils/anilistLabels";

/** GraphQL public, sans clé, normalisé vers la forme « carte » de l'UI. */
const ENDPOINT = "https://graphql.anilist.co";

function normalize(media) {
  return {
    id: media.id,
    slug: String(media.id),
    title:
      media.title?.userPreferred ||
      media.title?.romaji ||
      media.title?.english ||
      "Sans titre",
    titleNative: media.title?.native || "",
    cover: media.coverImage?.extraLarge || media.coverImage?.large || "",
    color: media.coverImage?.color || "#FF713E",
    banner: media.bannerImage || "",
    genres: media.genres || [],
    score: media.averageScore ? media.averageScore / 10 : null,
    description: (media.description || "").replace(/<[^>]+>/g, ""),
    format: media.format,
    status: media.status,
    countryOfOrigin: media.countryOfOrigin || null,
    episodes: media.episodes,
    season: media.season,
    year: media.seasonYear,
    nextEpisode: media.nextAiringEpisode || null,
  };
}

const MEDIA_FIELDS = `
  id
  title { userPreferred romaji english native }
  coverImage { extraLarge large color }
  bannerImage
  genres
  averageScore
  description(asHtml: false)
  format
  status
  countryOfOrigin
  episodes
  season
  seasonYear
  nextAiringEpisode { episode airingAt timeUntilAiring }
`;

// Appels sérialisés pour ne pas déclencher le rate-limit AniList.
let _chain = Promise.resolve();
const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rawQuery(gql, variables, attempt = 0) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: gql, variables }),
    });
  } catch (e) {
    // Un 429 d'AniList arrive sans en-tête CORS : le navigateur n'en montre qu'un échec réseau.
    if (attempt < 2) {
      await _sleep(2500 * (attempt + 1));
      return rawQuery(gql, variables, attempt + 1);
    }
    throw e;
  }
  if (res.status === 429 && attempt < 3) {
    const retryAfter = Number(res.headers.get("Retry-After")) || 1.5;
    await _sleep(retryAfter * 1000 + 200);
    return rawQuery(gql, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const json = await res.json();
  return json.data;
}

function query(gql, variables) {
  const run = () => rawQuery(gql, variables);
  const result = _chain.then(run, run);
  _chain = result.catch(() => {});
  return result;
}

/** `pages` agrège plusieurs pages, pour survivre à la déduplication entre carrousels. */
export async function getRow({ sort, genre, perPage = 50, pages = 1, season, year }) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const data = await query(
      `query ($page: Int, $perPage: Int, $sort: [MediaSort], $genre: String, $season: MediaSeason, $seasonYear: Int) {
        Page(page: $page, perPage: $perPage) {
          media(type: ANIME, sort: $sort, genre: $genre, season: $season, seasonYear: $seasonYear, isAdult: false) {
            ${MEDIA_FIELDS}
          }
        }
      }`,
      { page, perPage, sort, genre, season, seasonYear: year }
    );
    out.push(...(data?.Page?.media || []).map(normalize));
  }
  return out;
}

export async function getMediaById(id) {
  if (!id) return null;
  const data = await query(
    `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }`,
    { id: Number(id) }
  );
  return data?.Media ? normalize(data.Media) : null;
}

/** { titre → url|null } ; sur un null, l'appelant garde le cover d'origine. */
const _coverByTitle = new Map();
export async function getCoversByTitle(titles) {
  const uniq = [...new Set((titles || []).map((t) => (t || "").trim()).filter(Boolean))];
  const missing = uniq.filter((t) => !_coverByTitle.has(t.toLowerCase()));

  if (missing.length) {
    const decls = missing.map((_, i) => `$s${i}: String`).join(", ");
    // Un favori peut être un manga : pas de filtre `type`.
    // Le premier résultat de recherche n'est pas fiable : « Demon Slayer » est un synonyme
    // exact du court-métrage « Onigiri », dont l'affiche remplaçait celle de Kimetsu no Yaiba.
    // On n'accepte qu'un titre principal identique, le plus populaire en cas d'égalité.
    const body = missing
      .map(
        (_, i) =>
          `m${i}: Page(perPage: 8) { media(search: $s${i}, isAdult: false, sort: [SEARCH_MATCH, POPULARITY_DESC]) { popularity title { romaji english native userPreferred } coverImage { extraLarge large } } }`
      )
      .join("\n");
    const vars = {};
    missing.forEach((t, i) => (vars[`s${i}`] = t));
    const norm = (v) => (v || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    try {
      const data = await query(`query (${decls}) { ${body} }`, vars);
      missing.forEach((t, i) => {
        const wanted = norm(t);
        const best = (data?.[`m${i}`]?.media || [])
          .filter((m) => Object.values(m.title || {}).some((v) => norm(v) === wanted))
          .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
        const c = best?.coverImage;
        _coverByTitle.set(t.toLowerCase(), c?.extraLarge || c?.large || null);
      });
    } catch {
      missing.forEach((t) => _coverByTitle.set(t.toLowerCase(), null));
    }
  }

  const out = {};
  for (const t of uniq) out[t] = _coverByTitle.get(t.toLowerCase()) || null;
  return out;
}

// ─── Fiches auteur / studio et franchise (suggestions #0072 et #0081) ─────────────────────

const CARD_FIELDS = `
  id
  type
  format
  status
  title { userPreferred }
  coverImage { large }
  startDate { year }
`;

function normalizeCard(node) {
  return {
    id: node.id,
    type: node.type,
    format: node.format,
    status: node.status,
    title: node.title?.userPreferred || "Sans titre",
    cover: node.coverImage?.large || "",
    year: node.startDate?.year || null,
  };
}

// Relations qui restent dans la même histoire : on les suit pour reconstituer la franchise.
const FOLLOWED_RELATIONS = new Set([
  "SEQUEL", "PREQUEL", "SIDE_STORY", "SPIN_OFF", "PARENT", "ALTERNATIVE", "SUMMARY", "COMPILATION", "CONTAINS",
]);
const FRANCHISE_MAX = 40;
const _startCache = new Map();
const _franchiseCache = new Map();

/** Requête de départ, partagée par les crédits de la fiche et la franchise. */
function getMediaStart(id) {
  if (!_startCache.has(id)) {
    const p = query(
      `query ($id: Int) {
        Media(id: $id) {
          ${CARD_FIELDS}
          studios(isMain: true) { nodes { id name } }
          staff(perPage: 25, sort: [RELEVANCE]) { edges { role node { id name { full } image { medium } } } }
          relations { edges { relationType(version: 2) node { ${CARD_FIELDS} } } }
        }
      }`,
      { id }
    ).then((data) => data?.Media || null);
    // Un échec n'est pas gardé : la fiche suivante retentera.
    p.catch(() => _startCache.delete(id));
    _startCache.set(id, p);
  }
  return _startCache.get(id);
}

function creditsOf(media) {
  return {
    studios: (media.studios?.nodes || []).map((s) => ({ id: s.id, name: s.name })),
    staff: (media.staff?.edges || [])
      .filter((e) => e.node?.id)
      .map((e) => ({ id: e.node.id, name: e.node.name?.full || "", image: e.node.image?.medium || "", role: e.role || "" })),
  };
}

/** Studios et équipe (auteur, réalisation…) d'une œuvre. */
export async function getMediaCredits(id) {
  id = Number(id);
  if (!id) return null;
  const media = await getMediaStart(id);
  return media ? creditsOf(media) : null;
}

/**
 * Œuvre de départ + toute sa franchise animée (suites, préquelles, films, spin-off…), en
 * parcourant les relations AniList niveau par niveau (une requête par niveau).
 * @returns {{ studios, staff, animes, sources }} — `sources` : mangas / romans liés.
 */
export async function getFranchise(id) {
  id = Number(id);
  if (!id) return null;
  if (_franchiseCache.has(id)) return _franchiseCache.get(id);

  const media = await getMediaStart(id);
  if (!media) return null;

  const animes = new Map([[media.id, { ...normalizeCard(media), relation: null }]]);
  const sources = new Map();
  let frontier = [];
  const visit = (edges, fromStart) => {
    for (const e of edges || []) {
      const n = e.node;
      // Les clips musicaux ne sont pas des épisodes à regarder.
      if (!n?.id || n.format === "MUSIC") continue;
      if (n.type === "MANGA") {
        // Seules les œuvres liées directement : les adaptations de toute la franchise noieraient la liste.
        if (fromStart && !sources.has(n.id)) sources.set(n.id, { ...normalizeCard(n), relation: e.relationType });
        continue;
      }
      if (animes.has(n.id) || animes.size >= FRANCHISE_MAX) continue;
      animes.set(n.id, { ...normalizeCard(n), relation: fromStart ? e.relationType : null });
      if (FOLLOWED_RELATIONS.has(e.relationType)) frontier.push(n.id);
    }
  };
  visit(media.relations?.edges, true);

  for (let level = 0; level < 6 && frontier.length && animes.size < FRANCHISE_MAX; level++) {
    const ids = frontier.slice(0, 50);
    frontier = [];
    const page = await query(
      `query ($ids: [Int]) {
        Page(perPage: 50) {
          media(id_in: $ids) {
            id
            relations { edges { relationType(version: 2) node { ${CARD_FIELDS} } } }
          }
        }
      }`,
      { ids }
    ).catch(() => null);
    for (const m of page?.Page?.media || []) {
      visit((m.relations?.edges || []).filter((e) => FOLLOWED_RELATIONS.has(e.relationType)), false);
    }
  }

  const byDate = (a, b) => (a.year || 9999) - (b.year || 9999) || a.id - b.id;
  const result = {
    id: media.id,
    type: media.type,
    ...creditsOf(media),
    animes: [...animes.values()].sort(byDate),
    sources: [...sources.values()].sort(byDate),
  };
  _franchiseCache.set(id, result);
  return result;
}

/** Biographie AniList (markdown) en texte simple : liens réduits à leur texte, spoilers retirés. */
function cleanBio(markdown) {
  return (markdown || "")
    .replace(/<[^>]+>/g, "")
    .replace(/~!([\s\S]*?)!~/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Auteur, réalisateur, chara-designer… avec ses œuvres, de la plus populaire à la moins connue. */
export async function getStaffPage(id) {
  const data = await query(
    `query ($id: Int) {
      Staff(id: $id) {
        id
        name { full native }
        image { large }
        description(asHtml: false)
        primaryOccupations
        homeTown
        yearsActive
        staffMedia(sort: [POPULARITY_DESC], perPage: 50) {
          edges { staffRole node { ${CARD_FIELDS} isAdult } }
        }
      }
    }`,
    { id: Number(id) }
  );
  const s = data?.Staff;
  if (!s) return null;
  // Une même œuvre revient une fois par rôle : on regroupe les rôles.
  const works = new Map();
  for (const e of s.staffMedia?.edges || []) {
    if (!e.node?.id || e.node.isAdult) continue;
    const prev = works.get(e.node.id);
    if (prev) prev.roles.push(e.staffRole);
    else works.set(e.node.id, { ...normalizeCard(e.node), roles: [e.staffRole].filter(Boolean) });
  }
  return {
    id: s.id,
    name: s.name?.full || "",
    nativeName: s.name?.native || "",
    image: s.image?.large || "",
    description: cleanBio(s.description),
    occupations: s.primaryOccupations || [],
    homeTown: s.homeTown || null,
    works: [...works.values()],
  };
}

/** Studio d'animation et ses œuvres principales. */
export async function getStudioPage(id) {
  const data = await query(
    `query ($id: Int) {
      Studio(id: $id) {
        id
        name
        isAnimationStudio
        media(sort: [POPULARITY_DESC], isMain: true, perPage: 50) { nodes { ${CARD_FIELDS} isAdult } }
      }
    }`,
    { id: Number(id) }
  );
  const s = data?.Studio;
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    works: (s.media?.nodes || []).filter((n) => n?.id && !n.isAdult).map(normalizeCard),
  };
}

/** Recherche d'auteurs et de studios par leur nom, pour la barre de recherche. */
export async function searchPeople(term, perPage = 3) {
  if (!term?.trim()) return [];
  const data = await query(
    `query ($s: String, $n: Int) {
      staff: Page(perPage: $n) { staff(search: $s, sort: [SEARCH_MATCH, FAVOURITES_DESC]) { id name { full } image { medium } primaryOccupations } }
      studios: Page(perPage: $n) { studios(search: $s, sort: [SEARCH_MATCH, FAVOURITES_DESC]) { id name isAnimationStudio } }
    }`,
    { s: term.trim(), n: perPage }
  );
  return [
    ...(data?.staff?.staff || []).map((p) => ({
      kind: "staff",
      id: p.id,
      name: p.name?.full || "",
      image: p.image?.medium || "",
      detail: p.primaryOccupations?.[0] ? occupationLabel(p.primaryOccupations[0]) : null,
    })),
    ...(data?.studios?.studios || [])
      .filter((s) => s.isAnimationStudio)
      .map((s) => ({ kind: "studio", id: s.id, name: s.name, image: "", detail: "Studio" })),
  ];
}

/**
 * IDs AniList des animes portant un tag, des plus populaires aux moins connus. `page` part de 1 ;
 * une page = 150 IDs (trois pages AniList en une requête).
 * @returns {{ ids: number[], hasMore: boolean }}
 */
export async function getAnimeIdsByTag(tag, page = 1) {
  const first = (page - 1) * 3 + 1;
  const part = (alias, n) =>
    `${alias}: Page(page: ${n}, perPage: 50) { pageInfo { hasNextPage } media(type: ANIME, tag: $tag, isAdult: false, sort: [POPULARITY_DESC]) { id } }`;
  const data = await query(
    `query ($tag: String) { ${part("a", first)} ${part("b", first + 1)} ${part("c", first + 2)} }`,
    { tag }
  );
  return {
    ids: ["a", "b", "c"].flatMap((k) => (data?.[k]?.media || []).map((m) => m.id)),
    hasMore: !!data?.c?.pageInfo?.hasNextPage,
  };
}
