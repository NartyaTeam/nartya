import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import fetch from "node-fetch";
import { createStallGuard, SEGMENT_STALL_MS, SEGMENT_MAX_ATTEMPTS } from "./download-transfer.js";

const SCAN_PAGE_CONCURRENCY = 6;

/**
 * Sans la garde anti-SSRF de `fetchFromProvider` : `url` vient de notre API (cf.
 * `isTrustedScanBase`), sur localhost en dev.
 */
async function downloadScanPageOnce(url, dest, controller) {
  const res = await fetch(url, { signal: controller.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const tmp = dest + ".part";
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    const guard = createStallGuard(res.body, SEGMENT_STALL_MS);
    guard.arm();
    res.body.on("data", (c) => {
      bytes += c.length;
      guard.arm();
    });
    res.body.on("error", (e) => { guard.clear(); reject(e); });
    out.on("error", (e) => { guard.clear(); reject(e); });
    out.on("finish", () => { guard.clear(); resolve(); });
    res.body.pipe(out);
  });
  await fsp.rename(tmp, dest);
  return bytes;
}

async function downloadScanPage(url, dest, controller) {
  let lastErr;
  for (let attempt = 1; attempt <= SEGMENT_MAX_ATTEMPTS; attempt++) {
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await downloadScanPageOnce(url, dest, controller);
    } catch (err) {
      if (controller.signal.aborted) throw err;
      lastErr = err;
      if (attempt < SEGMENT_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastErr;
}

/** Une page déjà sur disque est sautée : un téléchargement interrompu reprend. */
export async function downloadScanChapter(item, dir, controller, onProgress) {
  await fsp.mkdir(dir, { recursive: true });

  const total = item.pages;
  if (!total) throw new Error("Chapitre sans page");

  let received = 0;
  let done = 0;
  let lastEmit = 0;
  let cursor = 0;
  let stopped = false;

  const worker = async () => {
    while (true) {
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (stopped) return;
      const page = ++cursor;
      if (page > total) return;
      const dest = path.join(dir, `p${String(page).padStart(3, "0")}.jpg`);
      try {
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
          received += fs.statSync(dest).size;
        } else {
          const url = `${item.imageBase}/${encodeURIComponent(item.oeuvre)}/${item.folder}/${page}.jpg`;
          // Pas de `received += await …` : la somme serait lue avant l'attente et les pages parallèles
          // s'écraseraient.
          const bytes = await downloadScanPage(url, dest, controller);
          received += bytes;
        }
      } catch (err) {
        stopped = true;
        throw err;
      }
      if (stopped) return;
      done++;
      const now = Date.now();
      if (now - lastEmit > 400 || done === total) {
        lastEmit = now;
        onProgress({ percent: (done / total) * 100, sizeBytes: received });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SCAN_PAGE_CONCURRENCY, total) }, worker));
  if (stopped) throw new Error("Téléchargement du chapitre interrompu");

  return { file: null, sizeBytes: received };
}
