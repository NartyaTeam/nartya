/**
 * Volontairement générique : les motifs décrivent des familles de lecteurs, les domaines et
 * en-têtes viennent de la recette.
 */

import { detectSourceKey, getSource, recipeRegExp } from "./sourceRecipe.js";

/** `sources: [{ file: … }]` (JWPlayer et dérivés). */
function parseJwSources(html, source) {
  let match = html.match(/sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/);
  if (!match) {
    match = html.match(
      /player\.setup\s*\([^)]*sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/
    );
  }
  if (!match) {
    match = html.match(
      /playerInstance\s*=\s*player\.setup\s*\([^)]*sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/
    );
  }
  if (!match) {
    const m3u8 = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/);
    if (m3u8) match = [m3u8[0], m3u8[0]];
  }
  if (!match?.[1]) return { success: false, error: "URL vidéo non trouvée dans le HTML" };

  const raw = match[1].trim();
  // Certaines pages référencent un autre hébergeur (iframe, pub) que la recette exclut.
  const reject = recipeRegExp(source?.rejectPattern);
  if (reject?.test(raw)) {
    return { success: false, error: "Lien ambigu (autre hébergeur référencé dans la page)" };
  }
  return { success: true, videoUrl: raw };
}

/** og:video, <source>, <video>. */
function parseMetaOg(html, source) {
  let match = html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i);
  if (!match) match = html.match(/<source[^>]+src=["']([^"']+)["']/i);
  if (!match) match = html.match(/<video[^>]+src=["']([^"']+)["']/i);
  if (!match) match = html.match(/var\s+video_source\s*=\s*["']([^"']+)["']/);
  if (!match) {
    const fallback = recipeRegExp(source?.mediaPattern);
    const found = fallback && html.match(fallback);
    if (found) match = [found[0], found[0]];
  }
  if (!match) {
    match = html.match(/data-video-url=["']([^"']+)["']|data-src=["']([^"']+\.mp4[^"']*)["']/i);
    if (match) match = [match[0], match[1] || match[2]];
  }
  if (!match?.[1]) return { success: false, error: "URL vidéo non trouvée dans le HTML" };

  let videoUrl = match[1].trim().replace(/\\/g, "");
  if (!videoUrl.startsWith("http")) videoUrl = `https:${videoUrl}`;
  return { success: true, videoUrl };
}

/** `player.src([{ src: … }])`, souvent en chemin relatif. */
function parsePlayerSrc(html, source) {
  let match = html.match(/player\.src\s*\(\s*\[\s*\{\s*src:\s*["']([^"']+)["']/);
  if (!match) {
    const relative = html.match(/src:\s*["'](\/[^"']+\.mp4)["']/);
    if (relative) match = relative;
  }
  if (!match?.[1]) return { success: false, error: "URL vidéo non trouvée dans le HTML" };

  let videoUrl = match[1].trim();
  if (!videoUrl.startsWith("http")) {
    // Sans base absolue fournie par la recette, un chemin relatif est inexploitable.
    const base = source?.mediaBase;
    if (!base) return { success: false, error: "Base média inconnue pour cette source" };
    videoUrl = videoUrl.startsWith("/") ? `${base}${videoUrl}` : `${base}/${videoUrl}`;
  }
  return { success: true, videoUrl };
}

/** `"hls":"…"` dans un blob JSON. */
function parseHlsJson(html) {
  const match = html.match(/"hls":"([^"]+)"/);
  if (match?.[1]) return { success: true, videoUrl: match[1].replace(/\\\//g, "/") };
  return { success: false, error: "Flux HLS non trouvé (incompatible/privé)" };
}

/**
 * Lien recollé par le lecteur : `…innerHTML = "/stream" + ''+ ('xcdbideo?id=…').substring(1).substring(2);`.
 * `ideoolink` est un leurre (jeton faux) ; `robotlink` est le bon, `botlink` le double et
 * sert de secours (vérifié sur 8 pages au 2026-10-25). Évalué à la main, littéraux et `.substring(n)` seulement —
 * jamais le JavaScript distant.
 */
function parseSplitLink(html) {
  const last = (re) => [...html.matchAll(re)].at(-1)?.[1];
  const expr =
    last(/getElementById\(\s*['"]robotlink['"]\s*\)\.innerHTML\s*=\s*([^;\n]+);/g) ||
    last(/getElementById\(\s*['"]botlink['"]\s*\)\.innerHTML\s*=\s*([^;\n]+);/g);
  if (!expr) {
    const removed = /video not found/i.test(html);
    return { success: false, error: removed ? "Vidéo supprimée par l'hébergeur" : "Lien du lecteur introuvable" };
  }

  let link = "";
  const parts = /\(\s*(['"])(.*?)\1\s*\)((?:\.substring\(\s*\d+\s*\))*)|(['"])(.*?)\4/g;
  for (const m of expr.matchAll(parts)) {
    if (m[4]) {
      link += m[5];
      continue;
    }
    let value = m[2];
    for (const [, n] of m[3].matchAll(/\.substring\(\s*(\d+)\s*\)/g)) value = value.substring(Number(n));
    link += value;
  }

  link = link.replace(/^\/+/, "");
  if (!/\/get_video\?id=/.test(link)) return { success: false, error: "Lien du lecteur illisible" };
  return { success: true, videoUrl: `https://${link}` };
}

/** P.A.C.K.E.R. de Dean Edwards, décompacté sans exécuter le JavaScript distant. */
export function unpackDeanEdwards(source) {
  if (!source || typeof source !== "string" || source.length > 2_000_000) return null;

  const packed = source.match(
    /eval\(function\(p,a,c,k,e,(?:d|r)\)\{[\s\S]*?\}\(\s*'((?:\\.|[^'])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'])*)'\.split\('\|'\)/
  );
  if (!packed) return null;

  const radix = Number(packed[2]);
  const count = Number(packed[3]);
  if (!Number.isInteger(radix) || radix < 2 || radix > 36) return null;
  if (!Number.isInteger(count) || count < 0 || count > 10_000) return null;

  const words = packed[4].split("|");
  let decoded = packed[1];
  for (let index = count - 1; index >= 0; index--) {
    const replacement = words[index];
    if (!replacement) continue;
    const token = index.toString(radix);
    decoded = decoded.replace(
      new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"),
      () => replacement
    );
  }
  return decoded;
}

function decodeEmbeddedText(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/\\u0026/gi, "&")
    .replace(/\\x26/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/\\(["'\\])/g, "$1");
}

function findEmbeddedMediaUrl(source) {
  const text = decodeEmbeddedText(source);
  const file = text.match(
    /(?:file|src)\s*:\s*["'](https?:\/\/[^"'\\\s<>]+\.(?:m3u8|mp4)[^"'\\\s<>]*)["']/i
  );
  const generic = text.match(/https?:\/\/[^"'\\\s<>]+\.(?:m3u8|mp4)[^"'\\\s<>]*/i);
  const raw = file?.[1] || generic?.[0];
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** JWPlayer/XFileSharing, compactés ou non. */
export function parsePackedJwPlayer(html) {
  const direct = findEmbeddedMediaUrl(html);
  if (direct) return { success: true, videoUrl: direct };

  const unpacked = unpackDeanEdwards(html);
  const packedUrl = findEmbeddedMediaUrl(unpacked);
  if (packedUrl) return { success: true, videoUrl: packedUrl };

  return { success: false, error: "Flux HLS/MP4 non trouvé dans le lecteur" };
}

/** @param {string} [sourceKey] clé opaque (`s1`…), déduite de l'URL si absente */
export function extractFromHtml(html, embedUrl, sourceKey) {
  if (!html || typeof html !== "string") return { success: false, error: "HTML invalide" };

  const key = sourceKey || detectSourceKey(embedUrl || "");
  const source = getSource(key);
  if (!source) return { success: false, error: "Source non reconnue" };

  switch (source.strategy) {
    case "jw-sources":
      return parseJwSources(html, source);
    case "meta-og":
      return parseMetaOg(html, source);
    case "player-src":
      return parsePlayerSrc(html, source);
    case "hls-json":
      return parseHlsJson(html);
    case "packed-jw":
      return parsePackedJwPlayer(html);
    case "split-link":
      return parseSplitLink(html);
    default:
      return { success: false, error: "Stratégie d'extraction inconnue" };
  }
}

/**
 * Un hébergeur `exclusive` ne sert jamais son média pour un autre embed : un flux qui ne
 * correspond pas signale un mauvais match.
 */
export function isExtractedVideoUrlConsistentWithEmbed(embedUrl, videoUrl) {
  if (!embedUrl || !videoUrl) return false;
  const embedKey = detectSourceKey(embedUrl);
  const videoKey = detectSourceKey(videoUrl);
  if (!embedKey || !videoKey) return true; // CDN tiers : rien à conclure
  if (embedKey === videoKey) return true;
  if (getSource(videoKey)?.exclusive || getSource(embedKey)?.exclusive) return false;
  return true;
}
