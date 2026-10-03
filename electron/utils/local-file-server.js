/** Épisodes téléchargés, servis par le proxy local sous `/local`. */

import fs from "fs";
import { resolveLocalFile } from "./download-manager.js";

const LOCAL_MIME = {
  ".mp4": "video/mp4",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".m4s": "video/iso.segment",
  ".jpg": "image/jpeg",
};

/** `origin` suit l'interface d'appel : 127.0.0.1 pour l'app, IP LAN pour un Chromecast. */
function rewriteLocalPlaylist(content, id, origin, tokenSuffix = "") {
  const base = `${origin}/local?id=${encodeURIComponent(id)}&path=`;
  return content
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (t === "") return line;
      if (t.startsWith("#")) {
        return line.replace(
          /URI="([^"]+)"/g,
          (_m, uri) => `URI="${base}${encodeURIComponent(uri)}${tokenSuffix}"`
        );
      }
      return `${base}${encodeURIComponent(t)}${tokenSuffix}`;
    })
    .join("\n");
}

/** Range est indispensable au seek. */
export function serveLocalFile(reqUrl, req, res, { origin, tokenSuffix }) {
  const id = reqUrl.searchParams.get("id");
  const rel = reqUrl.searchParams.get("path") || "video.mp4";
  const abs = resolveLocalFile(id, rel);
  if (!abs) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Fichier introuvable" }));
    return;
  }

  const stat = fs.statSync(abs);
  const ext = abs.slice(abs.lastIndexOf(".")).toLowerCase();
  const contentType = LOCAL_MIME[ext] || "application/octet-stream";
  const range = req.headers.range;

  // Réécrite à la volée : le port n'est connu qu'à l'exécution.
  if (ext === ".m3u8") {
    const rewritten = rewriteLocalPlaylist(fs.readFileSync(abs, "utf8"), id, origin, tokenSuffix);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": Buffer.byteLength(rewritten),
      "Access-Control-Allow-Origin": "*",
    });
    res.end(rewritten);
    return;
  }

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (start >= stat.size || end >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Type": contentType,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(abs, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(abs).pipe(res);
  }
}
