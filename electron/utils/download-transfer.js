import fs from "fs";
import fsp from "fs/promises";
import { fetchFromProvider } from "./provider-fetch.js";

// node-fetch n'interrompt pas un corps figé.
export const SEGMENT_STALL_MS = 20_000;
export const SEGMENT_MAX_ATTEMPTS = 3;

export function createStallGuard(body, ms) {
  let timer = null;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => body.destroy(new Error("Segment bloqué (stall)")), ms);
  };
  const clear = () => clearTimeout(timer);
  return { arm, clear };
}

async function downloadToFileOnce(url, dest, provider, controller) {
  const res = await fetchFromProvider(url, { provider, signal: controller.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const tmp = dest + ".part";
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    let stall = null;
    // Réarmé à chaque octet reçu.
    const arm = () => {
      clearTimeout(stall);
      stall = setTimeout(() => res.body.destroy(new Error("Segment bloqué (stall)")), SEGMENT_STALL_MS);
    };
    const clear = () => clearTimeout(stall);
    arm();
    res.body.on("data", (c) => {
      bytes += c.length;
      arm();
    });
    res.body.on("error", (e) => { clear(); reject(e); });
    out.on("error", (e) => { clear(); reject(e); });
    out.on("finish", () => { clear(); resolve(); });
    res.body.pipe(out);
  });
  await fsp.rename(tmp, dest);
  return bytes;
}

/** Atomique via .part, avec retries sur erreur transitoire. Renvoie le nombre d'octets. */
export async function downloadToFile(url, dest, provider, controller) {
  let lastErr;
  for (let attempt = 1; attempt <= SEGMENT_MAX_ATTEMPTS; attempt++) {
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await downloadToFileOnce(url, dest, provider, controller);
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
