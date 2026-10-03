/** Réseau, hors tests unitaires : catalogue → page embed → manifeste HLS. */
import { extractFromHtml } from "../electron/utils/video-extract.js";
import { detectProvider, getProviderConfig } from "../electron/utils/provider-fetch.js";

const API = "https://anime.nartya.app";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(pathname) {
  const response = await fetch(`${API}${pathname}`, {
    signal: AbortSignal.timeout(45_000),
  });
  assert(response.ok, `${pathname} → HTTP ${response.status}`);
  return response.json();
}

function findSource(episodes, wantedProvider) {
  for (const episode of episodes) {
    for (const [lang, sources] of Object.entries(episode.lecteurs || {})) {
      for (const url of Object.values(sources || {})) {
        if (detectProvider(url) === wantedProvider) {
          return { episode: episode.episode, lang, url };
        }
      }
    }
  }
  return null;
}

async function fetchText(url, provider, referer) {
  const config = getProviderConfig(provider);
  const headers = { ...config.headers };
  if (referer) {
    headers.Referer = referer;
    headers.Origin = new URL(referer).origin;
  }
  const response = await fetch(url, {
    headers,
    redirect: config.options.followRedirects ? "follow" : "manual",
    signal: AbortSignal.timeout(config.options.timeout),
  });
  assert(response.ok, `${provider} ${new URL(url).hostname} → HTTP ${response.status}`);
  return response.text();
}

async function checkProvider({ slug, season, provider, require1080 = false }) {
  const json = await getJson(
    `/anime/${encodeURIComponent(slug)}/seasons/${encodeURIComponent(season)}/episodes`
  );
  const source = findSource(json.data?.episodes || [], provider);
  assert(source, `${slug}/${season}: aucune source ${provider}`);

  const html = await fetchText(source.url, provider);
  const extracted = extractFromHtml(html, source.url, provider);
  assert(extracted.success && extracted.videoUrl, `${provider}: ${extracted.error || "pas d'URL"}`);

  const playlist = await fetchText(extracted.videoUrl, provider, source.url);
  assert(playlist.startsWith("#EXTM3U"), `${provider}: manifeste HLS invalide`);
  if (require1080) {
    assert(/RESOLUTION=1920x1080/i.test(playlist), `${provider}: variante 1080p absente`);
  }

  const qualities = [
    ...new Set([...playlist.matchAll(/RESOLUTION=(\d+x\d+)/gi)].map((match) => match[1])),
  ];
  console.log(
    `✅ ${slug} épisode ${source.episode} ${source.lang} — ${provider} — ${qualities.join(", ")}`
  );
  return { source, extracted, playlist };
}

await checkProvider({
  slug: "hunter-x-hunter",
  season: "saison1",
  provider: "ansembed",
});
await checkProvider({
  slug: "hunter-x-hunter",
  season: "saison1",
  provider: "smoothpre",
});
await checkProvider({
  slug: "gachiakuta",
  season: "saison1",
  provider: "movearnpre",
  require1080: true,
});

// Cet hébergeur coupe parfois les connexions automatisées.
try {
  await checkProvider({
    slug: "hunter-x-hunter",
    season: "saison1",
    provider: "oneupload",
  });
} catch (error) {
  console.warn(`⚠️ OneUpload indisponible pendant le smoke test : ${error.message}`);
}
