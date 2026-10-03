/** api.ani.zip : images haute résolution. */
const cache = new Map();
const pending = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchMappings(anilistId) {
  const url = `https://api.ani.zip/mappings?anilist_id=${anilistId}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) return (await res.json()) || null;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt === 0) {
        await sleep(500);
        continue;
      }
      return null;
    } catch {
      if (attempt === 0) {
        await sleep(500);
        continue;
      }
      return null;
    }
  }
  return null;
}

/** @returns {{ fanart, banner, poster, clearLogo, rawData }} */
export async function fetchAniZipData(anilistId) {
  if (!anilistId) return null;
  const key = String(anilistId).trim();
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);

  const promise = (async () => {
    try {
      const data = await fetchMappings(key);
      if (!data) return null;
      let fanart = null,
        banner = null,
        poster = null,
        clearLogo = null;
      if (Array.isArray(data.images)) {
        for (const img of data.images) {
          if (img.coverType === "Fanart" && img.url) fanart = img.url;
          else if (img.coverType === "Banner" && img.url) banner = img.url;
          else if (img.coverType === "Poster" && img.url) poster = img.url;
          else if (
            img.coverType === "Clearlogo" &&
            img.url &&
            !/\/icons\//i.test(img.url)
          ) clearLogo = img.url;
        }
      }
      const result = { fanart, banner, poster, clearLogo, rawData: data };
      cache.set(key, result);
      return result;
    } catch {
      return null;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, promise);
  return promise;
}

export function formatFrenchDate(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
