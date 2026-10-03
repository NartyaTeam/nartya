/**
 * Segments, clé AES-128 et init fMP4, puis une `playlist.m3u8` locale aux URI relatives,
 * fusionnée en `video.mp4` par ffmpeg.
 */

import path from "path";
import fsp from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { fetchFromProvider } from "./provider-fetch.js";
import { downloadToFile } from "./download-transfer.js";

const execFileAsync = promisify(execFile);

// Sous le maxSockets de l'agent, et sans déclencher le throttling des CDN.
const HLS_SEGMENT_CONCURRENCY = 8;

// Remux sans réencodage : la marge couvre un gros fichier sur disque lent.
const REMUX_TIMEOUT_MS = 10 * 60_000;

function resolveUri(uri, baseUrl) {
  try {
    return new URL(uri, baseUrl).toString();
  } catch {
    return uri;
  }
}

/** #EXT-X-KEY, #EXT-X-MAP. */
function parseAttrUri(line) {
  const m = line.match(/URI="([^"]+)"/);
  return m ? m[1] : null;
}

function segExt(uri) {
  const p = (uri.split("?")[0] || "").toLowerCase();
  if (p.endsWith(".m4s")) return ".m4s";
  if (p.endsWith(".mp4")) return ".mp4";
  if (p.endsWith(".aac")) return ".aac";
  return ".ts";
}

/** URL finale, après redirections. */
async function fetchPlaylist(url, provider, controller) {
  const res = await fetchFromProvider(url, { provider, signal: controller.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return { text, baseUrl: res.url || url };
}

/** La meilleure dont la résolution est ≤ maxHeight, sinon la plus basse. */
function pickBestVariant(masterText, baseUrl, maxHeight = Infinity) {
  const lines = masterText.split(/\r?\n/);
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
    const bwM = lines[i].match(/BANDWIDTH=(\d+)/);
    const resM = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
    const bw = bwM ? parseInt(bwM[1], 10) : 0;
    const height = resM ? parseInt(resM[1], 10) : 0;
    let j = i + 1;
    while (j < lines.length && (lines[j].trim() === "" || lines[j].startsWith("#"))) j++;
    const uri = lines[j]?.trim();
    if (uri) variants.push({ uri: resolveUri(uri, baseUrl), bw, height });
  }
  if (!variants.length) return null;

  const summary = variants
    .map((v) => `${v.height || "?"}p/${Math.round(v.bw / 1000)}k`)
    .join(", ");

  let chosen;
  if (!Number.isFinite(maxHeight)) {
    // « Max » : plus haut débit.
    chosen = variants.reduce((a, b) => (b.bw > a.bw ? b : a));
  } else {
    const underCap = variants.filter((v) => v.height && v.height <= maxHeight);
    if (underCap.length) {
      chosen = underCap.reduce((a, b) => (b.bw > a.bw ? b : a));
    } else {
      // Aucune sous le plafond : plus basse résolution connue, à défaut plus bas débit.
      const withHeight = variants.filter((v) => v.height);
      chosen = withHeight.length
        ? withHeight.reduce((a, b) => (b.height < a.height ? b : a))
        : variants.reduce((a, b) => (b.bw < a.bw ? b : a));
    }
  }

  console.log(
    `[Downloads] Master : [${summary}] | cible ${
      Number.isFinite(maxHeight) ? maxHeight + "p" : "max"
    } → choisi ${chosen.height || "?"}p/${Math.round(chosen.bw / 1000)}k`
  );
  return chosen.uri;
}

/**
 * ffmpeg gère le déchiffrement AES-128 et l'init fMP4. `-bsf:a aac_adtstoasc`, requis pour
 * la plupart des .ts, échoue sur d'autres : on retente sans.
 * @returns {Promise<number>} taille du fichier fusionné
 */
async function remuxHlsToMp4(dir, controller, ffmpegPath) {
  const out = path.join(dir, "video.mp4");
  const tmp = out + ".part";
  const baseArgs = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-allowed_extensions",
    "ALL",
    "-i",
    "playlist.m3u8",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    // ffmpeg déduit le conteneur de l'extension, et « .part » ne lui dit rien.
    "-f",
    "mp4",
  ];
  const run = (args) =>
    execFileAsync(ffmpegPath, args, {
      cwd: dir, // chemins relatifs
      timeout: REMUX_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
      signal: controller.signal,
    });

  try {
    await run([...baseArgs, "-bsf:a", "aac_adtstoasc", "video.mp4.part"]);
  } catch (err) {
    if (controller.signal.aborted) throw err;
    await run([...baseArgs, "video.mp4.part"]);
  }

  await fsp.rename(tmp, out);
  const stat = await fsp.stat(out);
  return stat.size;
}

async function cleanupHlsArtifacts(dir) {
  const keep = new Set(["video.mp4", "cover.jpg", "thumb.jpg"]);
  let entries;
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((name) => !keep.has(name))
      .map((name) => fsp.rm(path.join(dir, name), { force: true }).catch(() => {}))
  );
}

/**
 * @param {number} [opts.maxHeight] plafond de résolution
 * @param {string|null} opts.ffmpegPath sans ffmpeg, pas de fusion en .mp4
 * @param {() => void} opts.onProcessingDone fin de la fusion, réussie ou non
 */
export async function downloadHls(
  dir,
  directUrl,
  provider,
  controller,
  { maxHeight = Infinity, ffmpegPath, onProgress, onProcessingDone, label }
) {
  await fsp.mkdir(dir, { recursive: true });

  // 1. Playlist (master → variante selon la qualité visée)
  let { text, baseUrl } = await fetchPlaylist(directUrl, provider, controller);
  if (/#EXT-X-STREAM-INF/i.test(text)) {
    const variant = pickBestVariant(text, baseUrl, maxHeight);
    if (variant) ({ text, baseUrl } = await fetchPlaylist(variant, provider, controller));
  } else {
    // Pas de master : une seule qualité.
    console.log(
      `[Downloads] Playlist déjà à variante unique (pas de master) → qualité imposée par la source. cible=${
        Number.isFinite(maxHeight) ? maxHeight + "p" : "max"
      }`
    );
  }

  // 2. Segments, clé et init ; la playlist locale se construit en parallèle
  const lines = text.split(/\r?\n/);
  const segments = [];
  const outLines = [];
  let keyUrl = null;
  let mapUrl = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#EXT-X-KEY")) {
      const uri = parseAttrUri(line);
      if (uri && !/METHOD=NONE/i.test(line)) {
        keyUrl = resolveUri(uri, baseUrl);
        outLines.push(raw.replace(/URI="[^"]+"/, 'URI="key.bin"'));
      } else {
        outLines.push(raw);
      }
      continue;
    }
    if (line.startsWith("#EXT-X-MAP")) {
      const uri = parseAttrUri(line);
      if (uri) {
        mapUrl = resolveUri(uri, baseUrl);
        outLines.push(raw.replace(/URI="[^"]+"/, 'URI="init.mp4"'));
      } else {
        outLines.push(raw);
      }
      continue;
    }
    if (line === "" || line.startsWith("#")) {
      outLines.push(raw);
      continue;
    }
    const name = `seg${String(segments.length).padStart(5, "0")}${segExt(line)}`;
    segments.push({ url: resolveUri(line, baseUrl), name });
    outLines.push(name);
  }

  if (!segments.length) throw new Error("Playlist HLS sans segment");

  // 3. Clé et init
  if (keyUrl) await downloadToFile(keyUrl, path.join(dir, "key.bin"), provider, controller);
  if (mapUrl) await downloadToFile(mapUrl, path.join(dir, "init.mp4"), provider, controller);

  // 4. Segments, en concurrence bornée
  const total = segments.length;
  let received = 0;
  let done = 0;
  let lastEmit = 0;
  let cursor = 0;
  // Un segment en échec définitif arrête les autres, qui réécraseraient le statut d'erreur.
  let stopped = false;

  const worker = async () => {
    while (true) {
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (stopped) return;
      const i = cursor++;
      if (i >= total) return;
      const seg = segments[i];
      let bytes;
      try {
        bytes = await downloadToFile(seg.url, path.join(dir, seg.name), provider, controller);
      } catch (err) {
        stopped = true;
        throw err;
      }
      if (stopped) return;
      received += bytes;
      done++;
      const now = Date.now();
      if (now - lastEmit > 400 || done === total) {
        lastEmit = now;
        onProgress({
          percent: (done / total) * 100,
          sizeBytes: received,
        });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(HLS_SEGMENT_CONCURRENCY, total) }, worker)
  );

  // 5. Playlist locale
  await fsp.writeFile(path.join(dir, "playlist.m3u8"), outLines.join("\n"));

  // 6. Fusion : un confort. Sans ffmpeg ou en cas d'échec, playlist et segments restent
  // lisibles par hls.js.
  if (ffmpegPath) {
    onProgress({ percent: 99, processing: true });
    try {
      const sizeBytes = await remuxHlsToMp4(dir, controller, ffmpegPath);
      await cleanupHlsArtifacts(dir);
      return { file: "video.mp4", sizeBytes };
    } catch (err) {
      if (controller.signal.aborted) throw err;
      console.error(
        `[Downloads] Fusion ffmpeg échouée pour ${label}, repli sur playlist+segments :`,
        err?.message || err
      );
    } finally {
      onProcessingDone();
    }
  }
  return { file: "playlist.m3u8", sizeBytes: received };
}
