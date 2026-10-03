/** Plages `Range` en parallèle si l'hôte les accepte, sinon mono-flux. */

import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { fetchFromProvider } from "./provider-fetch.js";
import { createStallGuard, SEGMENT_STALL_MS, SEGMENT_MAX_ATTEMPTS } from "./download-transfer.js";

// Les hébergeurs brident chaque connexion : découper en plages multiplie le débit.
const MP4_CONNECTIONS = 4;
// En dessous, le parallélisme ne vaut pas son surcoût.
const MP4_MIN_PARALLEL_BYTES = 8 * 1024 * 1024;

async function downloadMp4SingleOnce(dir, directUrl, provider, controller, onProgress) {
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, "video.mp4");
  const tmp = dest + ".part";

  const res = await fetchFromProvider(directUrl, { provider, signal: controller.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;
  let lastEmit = 0;

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    const guard = createStallGuard(res.body, SEGMENT_STALL_MS);
    guard.arm();
    res.body.on("data", (chunk) => {
      guard.arm();
      received += chunk.length;
      const now = Date.now();
      if (now - lastEmit > 400) {
        lastEmit = now;
        onProgress({
          percent: total ? (received / total) * 100 : 0,
          sizeBytes: received,
        });
      }
    });
    res.body.on("error", (e) => { guard.clear(); reject(e); });
    out.on("error", (e) => { guard.clear(); reject(e); });
    out.on("finish", () => { guard.clear(); resolve(); });
    res.body.pipe(out);
  });

  await fsp.rename(tmp, dest);
  return { file: "video.mp4", sizeBytes: received || total };
}

/** Repli sans `Range`, avec retries sur incident transitoire. */
async function downloadMp4Single(dir, directUrl, provider, controller, onProgress) {
  let lastErr;
  for (let attempt = 1; attempt <= SEGMENT_MAX_ATTEMPTS; attempt++) {
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await downloadMp4SingleOnce(dir, directUrl, provider, controller, onProgress);
    } catch (err) {
      if (controller.signal.aborted) throw err;
      lastErr = err;
      if (attempt < SEGMENT_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }
  throw lastErr;
}

/**
 * Plages écrites à leur position dans un fichier pré-alloué.
 * @param {number} total taille du fichier
 */
async function downloadMp4Parallel(dir, directUrl, provider, controller, total, onProgress) {
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, "video.mp4");
  const tmp = dest + ".part";

  const init = await fsp.open(tmp, "w");
  try {
    await init.truncate(total);
  } finally {
    await init.close();
  }

  const parts = Math.max(
    1,
    Math.min(MP4_CONNECTIONS, Math.ceil(total / MP4_MIN_PARALLEL_BYTES))
  );
  const chunkSize = Math.ceil(total / parts);
  let lastEmit = 0;
  // Par plage : sur un retry, elle repart de zéro au lieu de dépasser 100 %.
  const partProgress = new Array(parts).fill(0);
  const totalReceived = () => partProgress.reduce((a, b) => a + b, 0);
  // Une plage en échec définitif fait taire les autres, qui réécraseraient le statut d'erreur.
  let stopped = false;

  const downloadPartOnce = async (index, start, end) => {
    partProgress[index] = 0;
    const res = await fetchFromProvider(directUrl, {
      provider,
      rangeHeader: `bytes=${start}-${end}`,
      signal: controller.signal,
    });
    // Pas de 206 : le serveur ignore `Range`.
    if (res.status !== 206) throw new Error(`Range non honoré (HTTP ${res.status})`);

    const fh = await fsp.open(tmp, "r+");
    let pos = start;
    try {
      const guard = createStallGuard(res.body, SEGMENT_STALL_MS);
      guard.arm();
      await new Promise((resolve, reject) => {
        res.body.on("data", (chunk) => {
          guard.arm();
          if (stopped) {
            res.body.destroy(new DOMException("Aborted", "AbortError"));
            return;
          }
          // Suspendue le temps d'écrire, ce qui garantit l'ordre des écritures.
          res.body.pause();
          fh.write(chunk, 0, chunk.length, pos)
            .then(({ bytesWritten }) => {
              pos += bytesWritten;
              partProgress[index] += bytesWritten;
              const now = Date.now();
              if (!stopped && now - lastEmit > 400) {
                lastEmit = now;
                onProgress({
                  percent: (totalReceived() / total) * 100,
                  sizeBytes: totalReceived(),
                });
              }
              res.body.resume();
            })
            .catch(reject);
        });
        res.body.on("error", (e) => { guard.clear(); reject(e); });
        res.body.on("end", () => { guard.clear(); resolve(); });
      });
    } finally {
      await fh.close();
    }
  };

  const downloadPart = async (index) => {
    const start = index * chunkSize;
    if (start >= total) return;
    const end = Math.min(start + chunkSize - 1, total - 1);
    let lastErr;
    for (let attempt = 1; attempt <= SEGMENT_MAX_ATTEMPTS; attempt++) {
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (stopped) return;
      try {
        return await downloadPartOnce(index, start, end);
      } catch (err) {
        if (controller.signal.aborted) throw err;
        lastErr = err;
        if (attempt < SEGMENT_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
    stopped = true;
    throw lastErr;
  };

  await Promise.all(Array.from({ length: parts }, (_, i) => downloadPart(i)));
  if (stopped) throw new Error("Téléchargement parallèle interrompu");

  await fsp.rename(tmp, dest);
  return { file: "video.mp4", sizeBytes: total };
}

export async function downloadMp4(dir, directUrl, provider, controller, onProgress) {
  let total = 0;
  let acceptsRange = false;

  try {
    const probe = await fetchFromProvider(directUrl, {
      provider,
      rangeHeader: "bytes=0-1",
      signal: controller.signal,
    });
    if (probe.status === 206) {
      // Content-Range: bytes 0-1/123456
      const cr = probe.headers.get("content-range");
      const m = cr && cr.match(/\/(\d+)\s*$/);
      if (m) {
        total = parseInt(m[1], 10);
        acceptsRange = true;
      }
    }
    probe.body?.destroy?.();
  } catch (err) {
    if (controller.signal.aborted) throw err;
    // Sonde en échec : mono-flux.
  }

  if (acceptsRange && total > MP4_MIN_PARALLEL_BYTES) {
    try {
      return await downloadMp4Parallel(dir, directUrl, provider, controller, total, onProgress);
    } catch (err) {
      if (controller.signal.aborted) throw err;
      // Échec du parallèle : mono-flux.
    }
  }

  return downloadMp4Single(dir, directUrl, provider, controller, onProgress);
}
