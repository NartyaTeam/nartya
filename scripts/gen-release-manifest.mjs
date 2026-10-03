#!/usr/bin/env node
/**
 * Génère `manifest.json`, que le hub lit pour connaître la dernière version d'une app et
 * l'installeur à télécharger par plateforme, avec son sha256. Le changelog
 * (`src/data/changelog.js`) y est embarqué, tronqué aux 15 versions les plus récentes.
 *
 * Usage : node scripts/gen-release-manifest.mjs <dir> [--version x.y.z] [--out chemin]
 *   <dir> : dossier contenant les artefacts electron-builder (installeurs + latest*.yml).
 */
import { readdirSync, statSync, readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { join, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANGELOG_MAX_VERSIONS = 15;

const dir = process.argv[2];
if (!dir) {
  console.error("usage: gen-release-manifest.mjs <dir> [--version x.y.z] [--out chemin]");
  process.exit(1);
}
const args = process.argv.slice(3);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const version = flag("--version") || JSON.parse(readFileSync("package.json", "utf8")).version;
const out = flag("--out") || join(dir, "manifest.json");

const INSTALLER_EXT = new Set([".exe", ".dmg", ".zip", ".appimage", ".deb"]);

function targetOf(name) {
  const n = name.toLowerCase();
  const arch = n.includes("arm64") ? "arm64" : "x64";
  if (n.includes("-win")) return { platform: "win32", arch: "x64" };
  if (n.includes("-mac")) return { platform: "darwin", arch };
  if (n.includes("-linux")) return { platform: "linux", arch };
  return { platform: "unknown", arch };
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

const files = [];
for (const name of readdirSync(dir)) {
  const ext = extname(name).toLowerCase();
  if (!INSTALLER_EXT.has(ext)) continue;
  const full = join(dir, name);
  const { platform, arch } = targetOf(name);
  files.push({
    name,
    platform,
    arch,
    ext: ext.slice(1),
    size: statSync(full).size,
    sha256: await sha256(full),
  });
}
files.sort((a, b) => a.name.localeCompare(b.name));

if (files.length === 0) {
  console.error(`❌ aucun installeur trouvé dans ${dir}`);
  process.exit(1);
}

// Un changelog illisible n'empêche pas de publier les binaires.
let changelog = [];
try {
  const mod = await import(pathToFileURL(join(__dirname, "../src/data/changelog.js")));
  if (Array.isArray(mod.CHANGELOG)) changelog = mod.CHANGELOG.slice(0, CHANGELOG_MAX_VERSIONS);
} catch (e) {
  console.warn(`⚠️ changelog non embarqué (${e.message})`);
}

const manifest = {
  app: "anime",
  version,
  releasedAt: new Date().toISOString(),
  files,
  changelog,
};
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `✅ manifest.json → ${out} (${files.length} fichiers, v${version}, ${changelog.length} entrée(s) de changelog)`
);
