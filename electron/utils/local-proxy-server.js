/** Flux distants (par poignée) et fichiers téléchargés. Toute requête porte le jeton `t`. */

import http from "http";
import crypto from "crypto";
import { URL } from "url";
import { transformPlaylist } from "./hls-playlist.js";
import { parseByteRange, sliceUpstream } from "./byte-range.js";
import {
  buildProviderRequest,
  fetchChecked,
  fetchCheckedWithRetry,
  providerAgent,
} from "./provider-fetch.js";
import { detectSourceKey } from "./source-recipe.js";
import { mintHandle, resolveHandle } from "./stream-handles.js";
import { localAddressFor } from "./lan-address.js";
import { getCachedSegment, isSegmentUrl, streamAndCacheSegment } from "./segment-cache.js";
import { pipeWithReadAhead } from "./read-ahead.js";
import { serveLocalFile } from "./local-file-server.js";

/** Les logs sont joints aux rapports de bug : une URL complète porterait des jetons signés. */
function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "hôte inconnu";
  }
}

/** `node-fetch` compose ses messages avec l'URL complète. */
function safeErr(error) {
  const message = error?.message || String(error);
  return message.replace(/https?:\/\/[^\s"')]+/gi, (url) => safeHost(url));
}

// Cf. read-ahead.js.
const MP4_READAHEAD_BYTES = 24 * 1024 * 1024;

// Courte : une URL signée périmée se re-résout toute seule.
const SIGNED_URL_TTL_MS = 10 * 60 * 1000;

// Servie seulement si le lecteur la réclame aussitôt.
const WARM_PLAYLIST_TTL_MS = 30 * 1000;

class LocalProxyServer {
  constructor() {
    this.server = null;
    this.port = null;
    this.token = null;
    // Ouvert sur le réseau local pendant un cast.
    this.castServer = null;
    this.castPort = null;
    this.castToken = null;
    // IP distante → dernière requête (diagnostic pare-feu).
    this.lanRequests = new Map();
    // URL d'origine → { url signée, ts }
    this._signedUrls = new Map();
    // poignée → { pending: Promise<{text,url}|null>, ts }
    this._warmPlaylists = new Map();
  }

  async _handleRequest(req, res, { lan = false } = {}) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Content-Length": "0",
      });
      res.end();
      return;
    }

    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    const reqUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);

    if (lan) {
      this.lanRequests.set(String(req.socket.remoteAddress || "").replace(/^::ffff:/, ""), Date.now());
    }

    if (!this._checkToken(reqUrl.searchParams.get("t"), lan ? this.castToken : this.token)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Jeton invalide" }));
      return;
    }

    if (reqUrl.pathname === "/local") {
      serveLocalFile(reqUrl, req, res, {
        origin: this._publicOrigin(req),
        tokenSuffix: this._tokenSuffix(reqUrl),
      });
      return;
    }

    try {
      await this._handleProxyRequest(req, res);
    } catch (error) {
      console.error("[LocalProxy] Erreur:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    }
  }

  _checkToken(given, expected) {
    if (!expected || typeof given !== "string") return false;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /** Celle par laquelle le client nous a joints. Host n'est cru que si son port est l'un des nôtres. */
  _publicOrigin(req) {
    const host = req.headers.host;
    if (host) {
      const port = Number(host.split(":").pop());
      if (port === this.port || (this.castPort && port === this.castPort)) {
        return `http://${host}`;
      }
    }
    return `http://127.0.0.1:${this.port}`;
  }

  _tokenSuffix(reqUrl) {
    return `&t=${encodeURIComponent(reqUrl.searchParams.get("t"))}`;
  }

  async start() {
    this.token = crypto.randomBytes(24).toString("base64url");
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handleRequest(req, res));

      this.server.listen(0, "127.0.0.1", () => {
        this.port = this.server.address().port;
        console.log(
          `✅ [LocalProxy] Serveur proxy local démarré sur le port ${this.port}`
        );
        resolve(this.port);
      });

      this.server.on("error", (error) => {
        console.error("❌ [LocalProxy] Erreur serveur:", error);
        reject(error);
      });
    });
  }

  /** Listener LAN (0.0.0.0) protégé par jeton, le temps d'un cast. */
  async startCastServer() {
    if (this.castServer && this.castPort) return;

    this.castToken = crypto.randomBytes(24).toString("base64url");
    await new Promise((resolve, reject) => {
      this.castServer = http.createServer((req, res) => this._handleRequest(req, res, { lan: true }));
      this.castServer.listen(0, "0.0.0.0", () => {
        this.castPort = this.castServer.address().port;
        console.log(`[Cast] Serveur LAN démarré sur le port ${this.castPort}`);
        resolve();
      });
      this.castServer.on("error", reject);
    });
  }

  lastLanRequestFrom(ip) {
    return this.lanRequests.get(ip) || 0;
  }

  stopCastServer() {
    if (!this.castServer) return;
    this.castServer.close();
    this.castServer = null;
    this.castPort = null;
    this.castToken = null;
    console.log("[Cast] Serveur LAN arrêté");
  }

  /**
   * Certains hôtes redirigent vers une URL signée dont la première requête ignore `Range` : on
   * résout la chaîne une fois en consommant ce premier appel.
   * @returns {Promise<string|null>} null sans redirection
   */
  async _signedUrlFor(originalUrl, headers) {
    const cached = this._signedUrls.get(originalUrl);
    if (cached && Date.now() - cached.ts < SIGNED_URL_TTL_MS) return cached.url;

    let url;
    try {
      const head = await fetchChecked(originalUrl, {
        method: "HEAD",
        headers,
        agent: providerAgent,
        signal: AbortSignal.timeout(15_000),
      });
      head.body?.destroy?.();
      url = head.url;
      if (!url || url === originalUrl) return null;

      const primer = await fetchChecked(url, {
        method: "GET",
        headers: { ...headers, Range: "bytes=0-1" },
        agent: providerAgent,
        signal: AbortSignal.timeout(15_000),
      });
      primer.body?.destroy?.();
    } catch (e) {
      console.warn("[LocalProxy] Résolution d'URL signée a échoué:", safeErr(e));
      return null;
    }

    this._signedUrls.set(originalUrl, { url, ts: Date.now() });
    if (this._signedUrls.size > 32) {
      this._signedUrls.delete(this._signedUrls.keys().next().value);
    }
    return url;
  }

  /** Le lecteur la demande dans la seconde : la connexion au CDN est déjà ouverte. */
  warmUp(handle) {
    const target = resolveHandle(handle);
    if (!target || this._warmPlaylists.has(handle)) return;

    const provider =
      (target.provider && target.provider !== "unknown" ? target.provider : null) ||
      detectSourceKey(target.url);
    const { url, headers } = buildProviderRequest(target.url, provider);
    if (target.referer) headers.Referer = target.referer;
    if (target.origin) headers.Origin = target.origin;

    const pending = fetchCheckedWithRetry(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    })
      .then(async (response) => {
        if (!response.ok) {
          response.body?.destroy?.();
          return null;
        }
        return { text: await response.text(), url: response.url || url };
      })
      .catch(() => null);

    this._warmPlaylists.set(handle, { pending, ts: Date.now() });
    if (this._warmPlaylists.size > 16) {
      this._warmPlaylists.delete(this._warmPlaylists.keys().next().value);
    }
  }

  /** Servie une fois ; null si absente ou périmée. */
  async _takeWarmPlaylist(handle) {
    const entry = this._warmPlaylists.get(handle);
    if (!entry) return null;
    this._warmPlaylists.delete(handle);
    if (Date.now() - entry.ts > WARM_PLAYLIST_TTL_MS) return null;
    return entry.pending;
  }

  _sendPlaylist(req, res, reqUrl, target, provider, content, baseUrl) {
    const transformedPlaylist = transformPlaylist(
      content,
      baseUrl,
      `${this._publicOrigin(req)}/video/proxy`,
      {
        mint: mintHandle,
        provider,
        referer: target.referer,
        origin: target.origin,
        tokenSuffix: this._tokenSuffix(reqUrl),
      }
    );

    res.writeHead(200, {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
    });
    res.end(transformedPlaylist);
  }

  async _handleProxyRequest(req, res) {
    const reqUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
    const handle = reqUrl.searchParams.get("h");
    const target = handle ? resolveHandle(handle) : null;
    if (!target) {
      // Poignée évincée ou session redémarrée : le lecteur doit relancer une résolution.
      res.writeHead(handle ? 410 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Lien de lecture expiré" }));
      return;
    }

    const provider =
      (target.provider && target.provider !== "unknown" ? target.provider : null) ||
      detectSourceKey(target.url);
    const logTarget = `poignée ${handle} (${provider || "?"})`;

    const rangeHeader = req.headers.range;
    if (!rangeHeader && isSegmentUrl(target.url)) {
      const cached = getCachedSegment(target.url);
      if (cached) {
        res.writeHead(200, {
          "Content-Type": cached.ct,
          "Content-Length": String(cached.buf.length),
          "Cache-Control": "public, max-age=3600, immutable",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "X-Proxy-Cache": "HIT",
        });
        res.end(cached.buf);
        return;
      }
    }

    const { url: decodedUrl, headers: requestHeaders } = buildProviderRequest(target.url, provider, {
      rangeHeader,
    });
    if (target.referer) requestHeaders.Referer = target.referer;
    if (target.origin) requestHeaders.Origin = target.origin;

    const fetchOptions = { method: "GET", headers: requestHeaders };

    const warm = rangeHeader ? null : await this._takeWarmPlaylist(handle);
    if (warm) {
      this._sendPlaylist(req, res, reqUrl, target, provider, warm.text, warm.url);
      return;
    }

    try {
      let response = await fetchCheckedWithRetry(decodedUrl, fetchOptions);

      if (rangeHeader && response.status === 200) {
        const signed = await this._signedUrlFor(decodedUrl, requestHeaders);
        if (signed && signed !== decodedUrl) {
          try {
            const retry = await fetchCheckedWithRetry(signed, fetchOptions);
            if (retry.status === 206) {
              response.body?.destroy?.();
              response = retry;
            } else {
              retry.body?.destroy?.();
            }
          } catch (e) {
            console.warn("[LocalProxy] Range sur URL signée a échoué:", safeErr(e));
          }
        }
      }

      if (!response.ok) {
        console.warn(
          `[LocalProxy] HTTP ${response.status} ${response.statusText} ` +
            `(provider=${provider || "unknown"}) ${logTarget}`
        );
        res.writeHead(response.status, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: `Erreur HTTP ${response.status}: ${response.statusText}`,
          })
        );
        return;
      }

      const contentType = response.headers.get("Content-Type") || "";

      const isPlaylist =
        contentType.includes("application/vnd.apple.mpegurl") ||
        contentType.includes("application/x-mpegURL") ||
        decodedUrl.includes(".m3u8");

      if (isPlaylist) {
        this._sendPlaylist(
          req,
          res,
          reqUrl,
          target,
          provider,
          await response.text(),
          response.url || decodedUrl
        );
      } else if (!rangeHeader && isSegmentUrl(decodedUrl)) {
        await streamAndCacheSegment(req, res, response, decodedUrl, contentType);
      } else {
        // Streaming normal (Range, ressources diverses)
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");

        if (contentType) res.setHeader("Content-Type", contentType);

        const isVideoSegment = decodedUrl.includes(".ts") || decodedUrl.includes(".m4s")
          || decodedUrl.includes(".mp4") || contentType.includes("video/");
        if (isVideoSegment) {
          res.setHeader("Cache-Control", "public, max-age=3600, immutable");
        }

        // Tronqué aux bornes demandées si l'hôte a ignoré `Range`.
        let bodyStream = response.body;

        if (rangeHeader && response.status === 206) {
          const contentRange = response.headers.get("Content-Range");
          const contentLength = response.headers.get("Content-Length");
          res.statusCode = 206;
          if (contentRange) res.setHeader("Content-Range", contentRange);
          if (contentLength) res.setHeader("Content-Length", contentLength);
          res.setHeader("Accept-Ranges", "bytes");
        } else if (rangeHeader && response.status === 200) {
          const totalSize = Number(response.headers.get("Content-Length"));
          const wanted = parseByteRange(rangeHeader, totalSize);
          if (wanted) {
            bodyStream = sliceUpstream(response.body, wanted.start, wanted.end);
            res.statusCode = 206;
            res.setHeader("Content-Range", `bytes ${wanted.start}-${wanted.end}/${totalSize}`);
            res.setHeader("Content-Length", String(wanted.end - wanted.start + 1));
            res.setHeader("Accept-Ranges", "bytes");
            if (wanted.start > 0) {
              console.warn(
                `[LocalProxy] Range ignoré par l'hôte (provider=${provider || "unknown"}) — ` +
                  `${(wanted.start / 1e6).toFixed(1)} Mo téléchargés puis jetés pour servir ` +
                  `${wanted.start}-${wanted.end}`
              );
            }
          } else {
            // `Accept-Ranges: none` dit au lecteur que le seek n'est pas supporté.
            const contentLength = response.headers.get("Content-Length");
            if (contentLength) res.setHeader("Content-Length", contentLength);
            res.setHeader("Accept-Ranges", "none");
          }
        } else {
          const contentLength = response.headers.get("Content-Length");
          if (contentLength) res.setHeader("Content-Length", contentLength);
          res.setHeader("Accept-Ranges", "bytes");
        }

        try {
          await pipeWithReadAhead(bodyStream, res, MP4_READAHEAD_BYTES);
        } catch (streamErr) {
          console.warn("[LocalProxy] Stream interrompu:", streamErr.message);
          if (!res.headersSent && !res.writableEnded) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: streamErr.message }));
          } else {
            res.destroy(streamErr);
          }
        }
      }
    } catch (error) {
      const blocked = error?.code === "URL_BLOCKED";
      if (blocked) console.warn(`[LocalProxy] ${safeErr(error)} (${logTarget})`);
      else console.error("[LocalProxy] Erreur lors du proxy:", safeErr(error));
      if (!res.headersSent) {
        res.writeHead(blocked ? 403 : 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    }
  }

  stop() {
    this.stopCastServer();
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = null;
      console.log("[LocalProxy] Serveur arrêté");
    }
  }

  /** null si le proxy n'a pas démarré. */
  playbackUrl(handle, isHls) {
    if (!this.port) return null;
    const kind = isHls ? "&kind=hls" : "";
    return `http://127.0.0.1:${this.port}/video/proxy?h=${handle}${kind}&t=${this.token}`;
  }

  localFileUrl(id, rel = "video.mp4") {
    if (!this.port || !id) return null;
    const params = new URLSearchParams({ id, path: rel, t: this.token });
    return `http://127.0.0.1:${this.port}/local?${params}`;
  }

  /**
   * Carte du même sous-réseau, port du listener LAN, jeton de cast.
   * @returns {Promise<string|null>}
   */
  async toCastUrl(localUrl, deviceIp) {
    if (!localUrl || typeof localUrl !== "string" || !this.port) return null;
    let u;
    try {
      u = new URL(localUrl);
    } catch {
      return null;
    }
    // Uniquement ce qui sort de notre proxy loopback.
    if (u.port !== String(this.port) || !["127.0.0.1", "localhost"].includes(u.hostname)) {
      return null;
    }
    if (u.pathname !== "/video/proxy" && u.pathname !== "/local") return null;
    if (!this._checkToken(u.searchParams.get("t"), this.token)) return null;

    await this.startCastServer();
    u.hostname = localAddressFor(deviceIp);
    u.port = String(this.castPort);
    u.searchParams.set("t", this.castToken);
    return u.toString();
  }
}

const localProxyServer = new LocalProxyServer();
export default localProxyServer;
