/**
 * L'URL de l'hébergeur n'existe que dans le main. L'extraction se fait depuis la machine du
 * client : beaucoup d'hébergeurs lient le flux à l'IP qui a chargé l'embed.
 */

import localProxyServer from "./local-proxy-server.js";
import { validateEmbedUrl } from "./url-validator.js";
import { getSharedAccessToken } from "./shared-session.js";
import {
  detectProvider as detectFetchProvider,
  getProviderConfig,
  canonicalizeUrl,
  fetchChecked,
  providerAgent,
} from "./provider-fetch.js";
import {
  ensureRecipe,
  setRecipeCredentials,
  getSource as getRecipeSource,
} from "./source-recipe.js";
import { extractFromHtml, isExtractedVideoUrlConsistentWithEmbed } from "./video-extract.js";
import { mintHandle } from "./stream-handles.js";
import { friendlyErrorMessage } from "./friendly-error.js";
import { API_BASE_URL } from "./api-base.js";

/** Avec les règles de la recette pour son hébergeur. */
async function fetchEmbedHtml(embedUrl, options = {}) {
  if (!embedUrl || typeof embedUrl !== "string") {
    return { success: false, error: "URL invalide" };
  }
  const embedCheck = validateEmbedUrl(embedUrl);
  if (!embedCheck.valid) {
    return { success: false, error: `Embed bloqué : ${embedCheck.error}` };
  }

  const sourceKey = options.sourceKey || detectFetchProvider(embedUrl);
  const providerConfig = getProviderConfig(sourceKey);
  const rules = getRecipeSource(sourceKey);
  const headers = { ...providerConfig.headers };

  let finalUrl = canonicalizeUrl(embedUrl, sourceKey);

  if (rules?.embedQuery && !finalUrl.includes(rules.embedQuery.split("=")[0] + "=")) {
    finalUrl += (finalUrl.includes("?") ? "&" : "?") + rules.embedQuery;
  }

  if (rules?.refererFromEmbed) {
    headers.Referer = finalUrl;
    try {
      headers.Origin = new URL(finalUrl).origin;
    } catch {
      /* déjà écartée par validateEmbedUrl */
    }
  }

  try {
    const timeoutMs =
      options?.timeoutMs > 0 && options.timeoutMs <= 60000
        ? options.timeoutMs
        : providerConfig.options.timeout;
    const res = await fetchChecked(finalUrl, {
      method: "GET",
      headers,
      agent: providerAgent,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    return { success: true, html: await res.text() };
  } catch (e) {
    console.error("[Stream] fetchEmbedHtml en erreur :", e?.message || e);
    return { success: false, error: friendlyErrorMessage(e) };
  }
}

/** jeton → { handle, isHls, at } */
const _streamCache = new Map();
const _streamInflight = new Map();
const STREAM_CACHE_TTL_MS = 10 * 60_000;
const STREAM_TIMEOUT_MS = 15_000;

/** En téléchargement, le téléchargeur résout la poignée dans le main. */
function streamResult(handle, mode, isHls) {
  if (mode === "download") return { success: true, handle };
  const url = localProxyServer.playbackUrl(handle, isHls);
  if (!url) return { success: false, error: "Proxy local indisponible" };
  return { success: true, url };
}

/** Descellement par l'API, page d'embed, extraction. */
async function resolveStreamToken(token, accessToken) {
  const startedAt = Date.now();
  // Demandés ensemble : la première lecture ne paie qu'un aller-retour API.
  setRecipeCredentials({ apiBaseUrl: API_BASE_URL, accessToken });
  const recipeReady = ensureRecipe();

  let embedUrl;
  let provider;
  try {
    const res = await fetch(`${API_BASE_URL}/v1/streams/${encodeURIComponent(token)}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) return { success: false, error: "Connecte-toi pour lancer la lecture." };
    if (res.status === 410) return { success: false, error: "Lien expiré, recharge l'épisode." };
    if (res.status === 429) return { success: false, error: "Trop de lectures d'affilée, patiente un instant." };
    if (!res.ok) return { success: false, error: `Résolution indisponible (${res.status})` };
    const json = await res.json();
    embedUrl = json?.data?.url;
    provider = json?.data?.provider || null;
  } catch (e) {
    console.error("[Stream] resolve-stream (jeton→URL) en erreur :", e?.message || e);
    return { success: false, error: friendlyErrorMessage(e) };
  }
  if (!embedUrl) return { success: false, error: "Source introuvable" };
  if (!(await recipeReady)) {
    return { success: false, error: "Configuration des sources indisponible" };
  }
  const tokenMs = Date.now() - startedAt;

  const html = await fetchEmbedHtml(embedUrl, { timeoutMs: STREAM_TIMEOUT_MS });
  if (!html.success) return { success: false, error: html.error || "Hébergeur injoignable" };

  const extracted = extractFromHtml(html.html, embedUrl, provider);
  if (!extracted.success || !extracted.videoUrl) {
    return { success: false, error: extracted.error || "Flux introuvable" };
  }
  if (!isExtractedVideoUrlConsistentWithEmbed(embedUrl, extracted.videoUrl)) {
    return { success: false, error: "Flux extrait incohérent avec la source" };
  }

  // La page d'embed sert de Referer/Origin à la playlist et à ses segments.
  const handle = mintHandle({
    url: extracted.videoUrl,
    provider: provider || null,
    referer: embedUrl,
    origin: new URL(embedUrl).origin,
  });
  if (!handle) return { success: false, error: "Flux non enregistrable" };

  // Sans extension dans l'URL de proxy, c'est `kind=hls` qui fait monter hls.js.
  const isHls = /\.m3u8(\?|$)/i.test(extracted.videoUrl);
  _streamCache.set(token, { handle, isHls, at: Date.now() });
  if (_streamCache.size > 200) _streamCache.delete(_streamCache.keys().next().value);

  console.log(
    `[Stream] ${provider || "?"} résolu en ${Date.now() - startedAt} ms (API ${tokenMs} ms)`
  );
  return { success: true, handle, isHls };
}

export function registerStreamIpc(secureIpc) {
  secureIpc.handle("resolve-stream", async (_e, payload = {}) => {
    const { token, forceRefresh, mode } = payload;
    if (!token || typeof token !== "string") return { success: false, error: "Jeton manquant" };
    // Le renderer ne choisit ni le jeton envoyé, ni sa destination.
    const accessToken = getSharedAccessToken();

    if (forceRefresh) _streamCache.delete(token);
    const cached = _streamCache.get(token);
    if (cached && Date.now() - cached.at < STREAM_CACHE_TTL_MS) {
      return { ...streamResult(cached.handle, mode, cached.isHls), cached: true };
    }

    // Un survol a pu lancer la même résolution juste avant le clic.
    let pending = _streamInflight.get(token);
    if (!pending) {
      pending = resolveStreamToken(token, accessToken).finally(() => _streamInflight.delete(token));
      _streamInflight.set(token, pending);
    }
    const resolved = await pending;
    if (!resolved.success) return resolved;

    // Chargée pendant que le lecteur se monte.
    if (resolved.isHls && mode !== "download") localProxyServer.warmUp(resolved.handle);
    return streamResult(resolved.handle, mode, resolved.isHls);
  });
}
