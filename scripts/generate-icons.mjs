/** Depuis `public/icon.png` (1024×1024). Usage : `npm run icons` */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import png2icons from "png2icons";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "public", "icon.png");
const ICO = path.join(root, "public", "icon.ico");
const ICNS = path.join(root, "public", "icon.icns");

if (!fs.existsSync(SRC)) {
  console.error(`✗ Source introuvable : ${SRC}`);
  process.exit(1);
}

const input = fs.readFileSync(SRC);

const ico = png2icons.createICO(input, png2icons.BICUBIC, 0, false);
if (!ico) {
  console.error("✗ Échec génération .ico");
  process.exit(1);
}
fs.writeFileSync(ICO, ico);
console.log(`✓ ${path.relative(root, ICO)} (${(ico.length / 1024).toFixed(0)} Ko)`);

const icns = png2icons.createICNS(input, png2icons.BICUBIC, 0);
if (!icns) {
  console.error("✗ Échec génération .icns");
  process.exit(1);
}
fs.writeFileSync(ICNS, icns);
console.log(`✓ ${path.relative(root, ICNS)} (${(icns.length / 1024).toFixed(0)} Ko)`);

console.log("Icônes générées.");
