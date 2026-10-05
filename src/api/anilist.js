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
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: gql, variables }),
  });
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
    const body = missing
      .map((_, i) => `m${i}: Media(search: $s${i}, isAdult: false) { coverImage { extraLarge large } }`)
      .join("\n");
    const vars = {};
    missing.forEach((t, i) => (vars[`s${i}`] = t));
    try {
      const data = await query(`query (${decls}) { ${body} }`, vars);
      missing.forEach((t, i) => {
        const c = data?.[`m${i}`]?.coverImage;
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
