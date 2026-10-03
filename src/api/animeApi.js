import { getApiBaseUrl, API_CONFIG } from "@/config/config";
import { supabase } from "@/lib/supabase";
import { normalizeFrenchElisions } from "@/utils/typography";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hors session, l'appel part sans jeton : une session absente ne doit pas casser le catalogue. */
async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Retries à backoff sur les erreurs transitoires (réseau, 5xx). */
async function get(path, { retries = 2, timeout = API_CONFIG.TIMEOUT } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${getApiBaseUrl()}${path}`, {
        signal: AbortSignal.timeout(timeout),
        headers: await authHeaders(),
      });
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          lastErr = new Error(`API ${res.status} sur ${path}`);
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw new Error(`API ${res.status} sur ${path}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (e.message?.startsWith("API 4")) throw e;
      if (attempt < retries) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

/** Pas de retry : ce sont des mutations. */
async function postFn(path, body) {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(API_CONFIG.TIMEOUT),
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: { message: json?.error?.message || `API ${res.status}` } };
  return { data: json.data ?? null, error: null };
}

export { postFn };

export async function getHomeSections() {
  // La home affiche déjà un snapshot local : inutile d'empiler de longues attentes.
  return (await get("/v1/home", { retries: 1, timeout: 12_000 })).data;
}

/** Tops AniList filtrés sur les œuvres disponibles en scans. */
export async function getMangaHomeSections() {
  return (await get("/v1/manga/home")).data;
}

/** Null si rien de pertinent. */
export async function getForYou(slugs) {
  if (!slugs?.length) return null;
  try {
    const q = encodeURIComponent(slugs.join(","));
    return (await get(`/v1/home/for-you?slugs=${q}`)).data;
  } catch {
    return null;
  }
}

/** [{ slug, title, image }] */
export async function getAnimesByGenre(genre, page = 1) {
  return (await get(`/v1/anime/genres/${encodeURIComponent(genre)}?page=${page}`)).data;
}

/** [{ genre, image, slug }] */
export async function getGenreCards() {
  return (await get("/v1/anime/genres")).data;
}

/**
 * @returns {Promise<{fetchedAt:number, days:Array<{index:number,name:string,date:string,
 * items:Array<{slug,season,lang,title,image,type,time}>}>}>}
 */
export async function getPlanning() {
  const res = await get("/v1/anime/planning");
  return { fetchedAt: res.meta?.fetchedAt, days: res.data || [] };
}

/** `epMin`/`epMax` : bornes inclusives, null = sans borne. `lang` : "vf" | "vostfr" | "va". */
export async function searchCatalog({
  search = "",
  genres = [],
  type = "",
  media = "anime",
  epMin = null,
  epMax = null,
  lang = "",
  verifiedOnly = false,
  page = 1,
} = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (genres.length) params.set("genre", genres.join(","));
  if (type) params.set("type", type);
  if (epMin != null) params.set("epMin", String(epMin));
  if (epMax != null) params.set("epMax", String(epMax));
  if (lang) params.set("lang", lang);
  if (verifiedOnly) params.set("verified", "true");
  params.set("page", String(page));
  return (await get(`/v1/${media === "manga" ? "manga" : "anime"}/catalog?${params.toString()}`)).data;
}

/** [{ title, url, slug, image }] */
export async function searchAnimes(query, limit = 20, media = "anime") {
  if (!query?.trim()) return [];
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return (await get(`/v1/${media === "manga" ? "manga" : "anime"}/search?${params.toString()}`)).data;
}

export async function resolveAnilistToSlug(anilistId) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/v1/anime/resolve?anilist=${anilistId}`, {
      signal: AbortSignal.timeout(API_CONFIG.TIMEOUT),
      headers: await authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()).data?.slug || null;
  } catch {
    return null;
  }
}

/** `lite` saute l'enrichissement côté serveur : `anilist` et `images` reviennent à null. */
export async function getAnimePage(slug, { lite = false } = {}) {
  return (
    await get(`/v1/anime/${encodeURIComponent(slug)}${lite ? "?lite=1" : ""}`)
  ).data;
}

/** [{ label, oeuvre }] */
export async function getAnimeScans(slug) {
  return (await get(`/v1/anime/${encodeURIComponent(slug)}/manga`)).data;
}

export async function getAnimeRecommendations(slug) {
  return (await get(`/v1/anime/${encodeURIComponent(slug)}/recommendations`)).data;
}

/** AnimeThemes.moe. */
export async function getAnimeThemes(slug) {
  return (await get(`/v1/anime/${encodeURIComponent(slug)}/themes`)).data;
}

export async function getAnimeGallery(slug) {
  return (await get(`/v1/anime/${encodeURIComponent(slug)}/gallery`)).data;
}

/** { oeuvre, imageBase, chapters: [{ chapter, pages }] } */
export async function getScanChapters(oeuvre) {
  return (
    await get(`/v1/manga/${encodeURIComponent(oeuvre)}/chapters`)
  ).data;
}

/** `page` part de 1. */
export function scanPageUrl(imageBase, oeuvre, chapter, page) {
  return `${imageBase}/${encodeURIComponent(oeuvre)}/${chapter}/${page}.jpg`;
}

/** [{ number, seasonId, seasonName }], toutes saisons confondues. */
export async function getAllEpisodes(slug) {
  return (await get(`/v1/anime/${encodeURIComponent(slug)}/episodes`)).data || [];
}

/**
 * Un lecteur est décrit par `{ id, key, label, rank, recommended }`, jamais par l'URL de
 * l'hébergeur : `id` est un jeton à échanger contre l'URL au lancement.
 * @returns {Promise<{episodes: Array<{episode:number, lecteurs:Object}>, totalEpisodes:number,
 * seasonName:string}>}
 */
export async function getSeasonEpisodes(slug, seasonId, { lite = false } = {}) {
  const data = (
    await get(
      `/v1/anime/${encodeURIComponent(slug)}/seasons/${encodeURIComponent(
        seasonId
      )}/episodes${lite ? "?lite=1" : ""}`
    )
  ).data;

  // D'anciennes métadonnées contiennent une espace après l'apostrophe (« d’ ogre »).
  return {
    ...data,
    episodes: (data?.episodes || []).map((episode) => ({
      ...episode,
      title: normalizeFrenchElisions(episode.title),
      description: normalizeFrenchElisions(episode.description),
    })),
  };
}

/** { intro, outro }, chacun { start, end } ou null. Toute erreur renvoie null. */
export async function getSkipSegments(slug, seasonId, episode) {
  if (!slug || !seasonId || !episode) return null;
  try {
    const res = await get(
      `/v1/anime/${encodeURIComponent(slug)}/seasons/${encodeURIComponent(
        seasonId
      )}/episodes/${episode}/skip`,
      { retries: 0 }
    );
    return res.data || null;
  } catch {
    return null;
  }
}
