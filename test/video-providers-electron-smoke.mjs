/**
 * Recette → API (jetons) → embed → extraction → poignée → proxy local → variante HLS → premier
 * segment. L'API exige un compte hors `NODE_ENV=development` : par défaut, l'API locale.
 * Variables : NARTYA_SMOKE_API, NARTYA_SMOKE_TOKEN, NARTYA_SMOKE_SOURCE.
 */
import { app, net } from "electron";
import { extractFromHtml } from "../electron/utils/video-extract.js";
import { getProviderConfig } from "../electron/utils/provider-fetch.js";
import { ensureRecipe } from "../electron/utils/source-recipe.js";
import { mintHandle } from "../electron/utils/stream-handles.js";
import localProxyServer from "../electron/utils/local-proxy-server.js";

const API_BASE = process.env.NARTYA_SMOKE_API || "http://localhost:3000";
const ACCESS_TOKEN = process.env.NARTYA_SMOKE_TOKEN || null;
// Par clé opaque.
const TARGET_KEY = process.env.NARTYA_SMOKE_SOURCE || "s4";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function authHeaders() {
  return ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {};
}

async function apiJson(path) {
  const response = await net.fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  assert(
    response.ok,
    `API ${path} → HTTP ${response.status}` +
      (response.status === 401
        ? " (compte requis : lancer l'API en dev, ou fournir NARTYA_SMOKE_TOKEN)"
        : "")
  );
  return response.json();
}

async function electronFetchText(url, { sourceKey, referer } = {}) {
  const config = getProviderConfig(sourceKey);
  const headers = { ...config.headers };
  if (referer) {
    headers.Referer = referer;
    headers.Origin = new URL(referer).origin;
  }
  const response = await net.fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(config.options.timeout),
  });
  assert(response.ok, `${new URL(url).hostname} → HTTP ${response.status}`);
  return response.text();
}

/** Et la meilleure disponible en secours, pour le message d'échec. */
function findSource(episodes) {
  const seen = new Set();
  for (const episode of episodes) {
    for (const [lang, sources] of Object.entries(episode.lecteurs || {})) {
      for (const entry of Object.values(sources || {})) {
        if (!entry || typeof entry !== "object" || !entry.id) continue;
        seen.add(entry.key);
        if (entry.key === TARGET_KEY) {
          return { episode: episode.episode, lang, token: entry.id, key: entry.key };
        }
      }
    }
  }
  return { seen: [...seen] };
}

await app.whenReady();

try {
  // 1. Recette
  const recipe = await ensureRecipe({ apiBaseUrl: API_BASE, accessToken: ACCESS_TOKEN });
  assert(
    recipe?.sources,
    `recette non chargée depuis ${API_BASE} ` +
      "(API démarrée ? compte requis hors NODE_ENV=development ?)"
  );
  assert(recipe.sources[TARGET_KEY], `${TARGET_KEY} absent de la recette`);

  // 2. Épisodes
  const json = await apiJson("/anime/gachiakuta/seasons/saison1/episodes?sources=v2");
  assert(
    json.data?.sources === "v2",
    "l'API a répondu en URLs claires : contrat v2 non honoré (repli legacy ?)"
  );
  const source = findSource(json.data?.episodes || []);
  assert(
    source.token,
    `Gachiakuta : source ${TARGET_KEY} absente (présentes : ${source.seen?.join(", ") || "aucune"})`
  );

  // 3. Le jeton se descelle en URL
  const opened = await apiJson(`/anime/stream/${source.token}`);
  const embedUrl = opened.data?.url;
  assert(embedUrl, "jeton de flux : desscellement sans URL");

  const html = await electronFetchText(embedUrl, { sourceKey: source.key });
  const extracted = extractFromHtml(html, embedUrl, source.key);
  assert(extracted.success, extracted.error || `${source.key} : extraction impossible`);

  const directMaster = await electronFetchText(extracted.videoUrl, {
    sourceKey: source.key,
    referer: embedUrl,
  });
  assert(/RESOLUTION=1920x1080/i.test(directMaster), `${source.key} : 1080p absent`);

  // 4. Proxy par poignée
  await localProxyServer.start();
  const handle = mintHandle({
    url: extracted.videoUrl,
    provider: source.key,
    referer: embedUrl,
  });
  const masterUrl = `${localProxyServer.getProxyBaseUrl()}?h=${handle}`;
  const masterResponse = await net.fetch(masterUrl);
  assert(masterResponse.ok, `proxy master → HTTP ${masterResponse.status}`);
  const proxiedMaster = await masterResponse.text();
  assert(
    !proxiedMaster.includes(new URL(extracted.videoUrl).hostname),
    "proxy : la playlist réécrite laisse fuiter le domaine de l'hébergeur"
  );

  const variantUrl = proxiedMaster
    .split(/\r?\n/)
    .find((line) => line.startsWith("http://127.0.0.1:"));
  assert(variantUrl, "proxy : variante HLS non réécrite");

  const variantResponse = await net.fetch(variantUrl);
  assert(variantResponse.ok, `proxy variante → HTTP ${variantResponse.status}`);
  const proxiedVariant = await variantResponse.text();
  const segmentUrl = proxiedVariant
    .split(/\r?\n/)
    .find((line) => line.startsWith("http://127.0.0.1:"));
  assert(segmentUrl, "proxy : segment HLS non réécrit");

  const segmentResponse = await net.fetch(segmentUrl, {
    headers: { Range: "bytes=0-1023" },
  });
  assert(segmentResponse.ok, `proxy segment → HTTP ${segmentResponse.status}`);
  const reader = segmentResponse.body.getReader();
  const firstChunk = await reader.read();
  await reader.cancel();
  assert(firstChunk.value?.byteLength > 0, "proxy segment : aucun octet reçu");

  console.log(
    `✅ Electron réel : Gachiakuta épisode ${source.episode} ${source.lang}, ` +
      `source ${source.key} 1080p, poignée + proxy et segment vidéo ` +
      `(${firstChunk.value.byteLength} octets)`
  );
} catch (error) {
  console.error(`❌ Smoke Electron providers : ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  localProxyServer.stop();
  app.quit();
}
