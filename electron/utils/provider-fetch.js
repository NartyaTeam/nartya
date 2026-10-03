/**
 * Aucun hébergeur n'est nommé ici : domaines et en-têtes viennent de la recette, chaque
 * hébergeur est désigné par sa clé opaque.
 */
import { URL } from "url";
import fetch from "node-fetch";
import { validateExternalUrl } from "./url-validator.js";
import { createDohHttpsAgent, createDohHttpAgent } from "./doh-resolver.js";
import {
  detectSourceKey,
  getSource,
  getDefaultHeaders,
  recipeRegExp,
} from "./source-recipe.js";

// Même résolveur DoH que le proxy local.
const httpsAgent = createDohHttpsAgent({
  family: 4,
  rejectUnauthorized: true,
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 32,
  maxFreeSockets: 16,
  timeout: 60_000,
});

const httpAgent = createDohHttpAgent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 32,
  maxFreeSockets: 16,
  timeout: 60_000,
});

const DEFAULT_TIMEOUT_MS = 30000;

/** `clear()` dès l'arrivée des en-têtes, pour ne pas armer ce timer sur le corps. */
function withTimeout(userSignal, timeoutMs) {
  const controller = new AbortController();
  if (userSignal) {
    if (userSignal.aborted) controller.abort(userSignal.reason);
    else userSignal.addEventListener("abort", () => controller.abort(userSignal.reason), { once: true });
  }
  const timer = setTimeout(() => {
    controller.abort(new Error(`Timeout (${timeoutMs}ms) : aucune réponse de l'hébergeur`));
  }, timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export function detectProvider(url) {
  return detectSourceKey(url);
}

/** Sans recette ou pour un hôte inconnu : en-têtes neutres. */
export function getProviderConfig(provider) {
  const source = getSource(provider);
  if (!source) {
    return {
      headers: { ...getDefaultHeaders() },
      options: { timeout: DEFAULT_TIMEOUT_MS },
    };
  }
  return {
    headers: { ...source.headers },
    options: { timeout: source.timeout || DEFAULT_TIMEOUT_MS },
  };
}

/** Hôte canonique de l'hébergeur, d'après la recette. */
export function canonicalizeUrl(url, provider) {
  const source = getSource(provider || detectSourceKey(url));
  if (!source?.canonicalHost || !source.hostMatch) return url;
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.includes(source.hostMatch) &&
      !parsed.hostname.endsWith(source.canonicalHost)
    ) {
      parsed.hostname = source.canonicalHost;
      return parsed.toString();
    }
  } catch {
  }
  return url;
}

/**
 * Exigé par certains hébergeurs sur leurs MP4.
 * @returns {string|null}
 */
export function getMediaReferer(mediaUrl, provider) {
  const rule = getSource(provider || detectSourceKey(mediaUrl))?.mp4Referer;
  if (!rule?.pattern || !rule.template) return null;
  const re = recipeRegExp(rule.pattern, "");
  const match = re && String(mediaUrl).match(re);
  if (!match) return null;
  return rule.template.replace(/\{(\d+)\}/g, (_, i) => match[Number(i)] ?? "");
}

/** @returns {{ url: string, headers: object, isHttps: boolean, options: object }} */
export function buildProviderRequest(targetUrl, provider, { rangeHeader } = {}) {
  const detected = provider || detectSourceKey(targetUrl);
  const source = getSource(detected);
  const url = canonicalizeUrl(targetUrl, detected);

  const config = getProviderConfig(detected);
  const headers = { ...config.headers };

  // Ajusté sur le domaine de l'hébergeur, retiré sur un CDN tiers (sinon 403).
  if (source?.dropRefererOffHost && source.hostMatch) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes(source.hostMatch)) {
        headers.Referer = `${parsed.origin}/`;
        headers.Origin = parsed.origin;
      } else {
        delete headers.Referer;
        delete headers.Origin;
      }
    } catch {
    }
  }

  const mediaReferer = getMediaReferer(url, detected);
  if (mediaReferer) headers.Referer = mediaReferer;

  if (rangeHeader) headers.Range = rangeHeader;

  return { url, headers, isHttps: url.startsWith("https:"), options: config.options };
}

const MAX_REDIRECTS = 5;

/** Choisi selon le schéma de chaque saut. */
export function providerAgent(parsedUrl) {
  return parsedUrl.protocol === "http:" ? httpAgent : httpsAgent;
}

function freshAgent(parsedUrl) {
  return parsedUrl.protocol === "http:"
    ? createDohHttpAgent()
    : createDohHttpsAgent({ family: 4, rejectUnauthorized: true });
}

function isRetryableNetworkError(err) {
  return (
    err?.code === "ECONNRESET" ||
    err?.code === "ECONNREFUSED" ||
    err?.message?.includes("socket hang up") ||
    err?.message?.includes("ECONNRESET")
  );
}

/** Redirections suivies à la main : un hôte public pourrait rediriger vers 127.0.0.1 ou le LAN. */
export async function fetchChecked(url, options = {}) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await validateExternalUrl(current);
    if (!check.valid) {
      throw Object.assign(new Error(`URL bloquée : ${check.error}`), { code: "URL_BLOCKED" });
    }

    const res = await fetch(current, { ...options, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;

    res.body?.destroy?.();
    current = new URL(location, current).toString();
  }
  throw new Error("Trop de redirections");
}

/** Le CDN ferme parfois un keep-alive réutilisé. */
export async function fetchCheckedWithRetry(url, options = {}) {
  try {
    return await fetchChecked(url, { agent: providerAgent, ...options });
  } catch (err) {
    if (!isRetryableNetworkError(err)) throw err;
    return fetchChecked(url, { ...options, agent: freshAgent });
  }
}

/** Corps en flux. */
export async function fetchFromProvider(targetUrl, { provider, rangeHeader, signal } = {}) {
  const { url, headers, options } = buildProviderRequest(targetUrl, provider, { rangeHeader });
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;

  const attempt = async (agent) => {
    const t = withTimeout(signal, timeoutMs);
    try {
      return await fetchChecked(url, { method: "GET", headers, agent, signal: t.signal });
    } finally {
      t.clear();
    }
  };

  try {
    return await attempt(providerAgent);
  } catch (err) {
    if (!isRetryableNetworkError(err)) throw err;
    return attempt(freshAgent);
  }
}
