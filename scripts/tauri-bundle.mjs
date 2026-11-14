/**
 * Installeur Windows de la coque Tauri.
 *   node scripts/tauri-bundle.mjs
 * Prépare ffmpeg (livré à côté de l'exe), lance `tauri build` avec la surcharge de bundle, puis
 * copie l'installeur sous le nom que le Hub attend (`Nartya-<version>-win.exe`) dans
 * release/tauri/, avec son empreinte SHA-256.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const path = (p) => new URL(p, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const { version } = JSON.parse(readFileSync(path("package.json"), "utf8"));
const conf = JSON.parse(readFileSync(path("src-tauri/tauri.conf.json"), "utf8"));
if (conf.version !== version) {
  console.error(`[bundle] version incohérente : package.json ${version}, tauri.conf.json ${conf.version}`);
  process.exit(1);
}

const ffmpeg = path("node_modules/ffmpeg-static/ffmpeg.exe");
if (!existsSync(ffmpeg)) {
  console.error("[bundle] ffmpeg introuvable : lance `npm ci` d'abord.");
  process.exit(1);
}
mkdirSync(path("src-tauri/resources"), { recursive: true });
copyFileSync(ffmpeg, path("src-tauri/resources/ffmpeg.exe"));

const build = spawnSync("npx", ["tauri", "build", "--config", "src-tauri/tauri.bundle.conf.json"], {
  stdio: "inherit",
  shell: true,
  cwd: path("."),
});
if (build.status !== 0) process.exit(build.status ?? 1);

const built = path(`target/release/bundle/nsis/Nartya_${version}_x64-setup.exe`);
if (!existsSync(built)) {
  console.error(`[bundle] installeur attendu introuvable : ${built}`);
  process.exit(1);
}
mkdirSync(path("release/tauri"), { recursive: true });
const out = path(`release/tauri/Nartya-${version}-win.exe`);
copyFileSync(built, out);
const bytes = readFileSync(out);
const sha256 = createHash("sha256").update(bytes).digest("hex");
writeFileSync(`${out}.sha256`, `${sha256}  Nartya-${version}-win.exe\n`);
console.log(`[bundle] ${out}\n[bundle] ${(bytes.length / 1048576).toFixed(1)} Mo, sha256 ${sha256}`);
