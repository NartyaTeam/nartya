/**
 * Installeurs de la coque Tauri (Windows, macOS, Linux selon la machine qui exécute le script).
 *   node scripts/tauri-bundle.mjs
 * Prépare ffmpeg (livré avec l'app), lance `tauri build` avec la surcharge de bundle de la
 * plateforme, puis copie les installeurs sous le nom que le Hub attend
 * (`Nartya-<version>-win.exe`, `-mac-<arch>.dmg`, `-linux-<arch>.AppImage|.deb`) dans
 * release/tauri/, avec leur empreinte SHA-256.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const path = (p) => new URL(p, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PLATFORMS = {
  win32: { conf: "windows", ffmpeg: "ffmpeg.exe", label: "win" },
  darwin: { conf: "macos", ffmpeg: "ffmpeg", label: "mac" },
  linux: { conf: "linux", ffmpeg: "ffmpeg", label: "linux" },
};
const target = PLATFORMS[process.platform];
if (!target) {
  console.error(`[bundle] plateforme non gérée : ${process.platform}`);
  process.exit(1);
}
const arch = process.arch === "arm64" ? "arm64" : "x64";

const { version } = JSON.parse(readFileSync(path("package.json"), "utf8"));
const conf = JSON.parse(readFileSync(path("src-tauri/tauri.conf.json"), "utf8"));
if (conf.version !== version) {
  console.error(`[bundle] version incohérente : package.json ${version}, tauri.conf.json ${conf.version}`);
  process.exit(1);
}

const ffmpeg = path(`node_modules/ffmpeg-static/${target.ffmpeg}`);
if (!existsSync(ffmpeg)) {
  console.error("[bundle] ffmpeg introuvable : lance `npm ci` d'abord.");
  process.exit(1);
}
mkdirSync(path("src-tauri/resources"), { recursive: true });
const shipped = path(`src-tauri/resources/${target.ffmpeg}`);
copyFileSync(ffmpeg, shipped);
if (process.platform !== "win32") chmodSync(shipped, 0o755);

// Surcharge commune + surcharge de la plateforme, fusionnées (une seule --config).
const merge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] ? merge(out[k], v) : v;
  }
  return out;
};
const readConf = (name) => JSON.parse(readFileSync(path(`src-tauri/${name}`), "utf8"));
const merged = merge(readConf("tauri.bundle.conf.json"), readConf(`tauri.bundle.${target.conf}.conf.json`));
// Fichier généré à côté des autres surcharges (ignoré par git), comme avant.
writeFileSync(path("src-tauri/tauri.bundle.merged.conf.json"), JSON.stringify(merged));

const build = spawnSync("npx", ["tauri", "build", "--config", "src-tauri/tauri.bundle.merged.conf.json"], {
  stdio: "inherit",
  shell: true,
  cwd: path("."),
});
if (build.status !== 0) process.exit(build.status ?? 1);

const wanted = {
  win32: [{ dir: "nsis", ext: ".exe", out: `Nartya-${version}-win.exe` }],
  darwin: [{ dir: "dmg", ext: ".dmg", out: `Nartya-${version}-mac-${arch}.dmg` }],
  linux: [
    { dir: "appimage", ext: ".AppImage", out: `Nartya-${version}-linux-${arch}.AppImage` },
    { dir: "deb", ext: ".deb", out: `Nartya-${version}-linux-${arch}.deb` },
  ],
}[process.platform];

mkdirSync(path("release/tauri"), { recursive: true });
for (const w of wanted) {
  const dir = path(`target/release/bundle/${w.dir}`);
  // Le dossier garde les installeurs des versions précédentes : on ne prend que celui de cette version.
  const found = existsSync(dir) && readdirSync(dir).find((f) => f.endsWith(w.ext) && f.includes(`_${version}_`));
  if (!found) {
    console.error(`[bundle] installeur de la ${version} introuvable dans ${dir} (*_${version}_*${w.ext})`);
    process.exit(1);
  }
  const out = path(`release/tauri/${w.out}`);
  copyFileSync(join(dir, found), out);
  const bytes = readFileSync(out);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(`${out}.sha256`, `${sha256}  ${w.out}\n`);
  console.log(`[bundle] ${out}\n[bundle] ${(bytes.length / 1048576).toFixed(1)} Mo, sha256 ${sha256}`);
}

// Le Hub installe l'app Mac depuis un zip du .app (il ne sait pas monter un .dmg).
if (process.platform === "darwin") {
  const appDir = path("target/release/bundle/macos");
  const app = existsSync(appDir) && readdirSync(appDir).find((f) => f.endsWith(".app"));
  if (!app) {
    console.error(`[bundle] .app introuvable dans ${appDir}`);
    process.exit(1);
  }
  const name = `Nartya-${version}-mac-${arch}.zip`;
  const out = path(`release/tauri/${name}`);
  // ditto garde les liens symboliques et les droits du bundle, contrairement à un zip classique.
  const zip = spawnSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", join(appDir, app), out], {
    stdio: "inherit",
  });
  if (zip.status !== 0) process.exit(zip.status ?? 1);
  const bytes = readFileSync(out);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(`${out}.sha256`, `${sha256}  ${name}\n`);
  console.log(`[bundle] ${out}\n[bundle] ${(bytes.length / 1048576).toFixed(1)} Mo, sha256 ${sha256}`);
}
