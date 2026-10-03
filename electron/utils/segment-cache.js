/** Les segments sont immuables : les garder évite un aller-retour CDN lors des seeks. */

const SEGMENT_CACHE_MAX_BYTES = 80 * 1024 * 1024;
const SEGMENT_CACHE_TTL_MS    = 60 * 60 * 1000;
const SEGMENT_MAX_CACHEABLE   = 6 * 1024 * 1024; // au-delà, pas de cache

let _segCacheUsed = 0;
/** @type {Map<string, {buf: Buffer, ct: string, ts: number}>} LRU */
const _segCache = new Map();

export function isSegmentUrl(url) {
  const path = (url.split('?')[0] || '').toLowerCase();
  return (
    path.endsWith('.ts') ||
    path.endsWith('.m4s') ||
    path.endsWith('.aac') ||
    (path.endsWith('.mp4') && !path.includes('/embed') && !path.includes('shell.php'))
  );
}

export function getCachedSegment(url) {
  const entry = _segCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.ts > SEGMENT_CACHE_TTL_MS) {
    _segCacheUsed -= entry.buf.length;
    _segCache.delete(url);
    return null;
  }
  _segCache.delete(url);
  _segCache.set(url, entry);
  return entry;
}

function putCachedSegment(url, buf, contentType) {
  if (buf.length > SEGMENT_MAX_CACHEABLE) return;
  while (_segCacheUsed + buf.length > SEGMENT_CACHE_MAX_BYTES && _segCache.size > 0) {
    const [oldKey, oldVal] = _segCache.entries().next().value;
    _segCacheUsed -= oldVal.buf.length;
    _segCache.delete(oldKey);
  }
  _segCache.set(url, { buf, ct: contentType || 'video/mp2t', ts: Date.now() });
  _segCacheUsed += buf.length;
}

/**
 * Chaque chunk part au lecteur dès réception, une copie s'accumule pour le cache. Jamais un
 * segment incomplet : hls.js abandonne souvent une requête en route, et un segment tronqué
 * peut perdre sa piste audio.
 */
export async function streamAndCacheSegment(req, res, response, url, contentType) {
  const upstreamLength = response.headers.get("Content-Length");
  const attendu = upstreamLength ? Number(upstreamLength) : null;
  res.writeHead(200, {
    "Content-Type": contentType || "video/mp2t",
    ...(upstreamLength ? { "Content-Length": upstreamLength } : {}),
    "Cache-Control": "public, max-age=3600, immutable",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  });

  const chunks = [];
  let totalSize = 0;
  let recus = 0;
  let cacheable = true;

  try {
    for await (const chunk of response.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      recus += buf.length;
      // Backpressure.
      if (!res.write(buf)) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
      if (cacheable) {
        totalSize += buf.length;
        if (totalSize > SEGMENT_MAX_CACHEABLE) {
          cacheable = false;
          chunks.length = 0;
        } else {
          chunks.push(buf);
        }
      }
    }
    res.end();
    // Exactement la taille annoncée, client toujours là. Sans `Content-Length`, on s'abstient.
    const complet = attendu !== null && recus === attendu && !req.destroyed;
    if (cacheable && complet && chunks.length > 0) {
      putCachedSegment(url, Buffer.concat(chunks), contentType);
    } else if (cacheable && !complet) {
      // Fréquent au démarrage et sur les seeks.
      console.warn(
        `[LocalProxy] segment non mis en cache — incomplet ` +
          `(${recus}/${attendu ?? "?"} octets${req.destroyed ? ", client parti" : ""})`
      );
    }
  } catch (streamErr) {
    // Le statut ne peut plus changer : on coupe.
    console.warn("[LocalProxy] Stream segment interrompu:", streamErr.message);
    res.destroy(streamErr);
  }
}
