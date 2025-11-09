#!/usr/bin/env node

/**
 * Script pour vérifier que les fichiers de release sont prêts
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const distDir = path.join(__dirname, "dist");

console.log("🔍 Vérification des fichiers de release...\n");

// Vérifier que le dossier dist existe
if (!fs.existsSync(distDir)) {
  console.error("❌ Le dossier dist/ n'existe pas");
  console.log('   Lancez "pnpm run build" d\'abord');
  process.exit(1);
}

// Lire latest.yml
const latestYmlPath = path.join(distDir, "latest.yml");
if (!fs.existsSync(latestYmlPath)) {
  console.error("❌ latest.yml introuvable dans dist/");
  process.exit(1);
}

const latestYml = yaml.load(fs.readFileSync(latestYmlPath, "utf8"));
console.log("✅ latest.yml trouvé");
console.log(`   Version: ${latestYml.version}`);
console.log(`   Fichier: ${latestYml.path}`);

// Vérifier que le fichier .exe existe
const exePath = path.join(distDir, latestYml.path);
if (!fs.existsSync(exePath)) {
  console.error(`❌ ${latestYml.path} introuvable dans dist/`);
  process.exit(1);
}

console.log(`✅ ${latestYml.path} trouvé`);

// Vérifier la taille
const exeStats = fs.statSync(exePath);
const exeSizeMB = (exeStats.size / 1024 / 1024).toFixed(2);
console.log(`   Taille: ${exeSizeMB} MB`);

// Vérifier le blockmap (optionnel)
const blockmapPath = exePath + ".blockmap";
if (fs.existsSync(blockmapPath)) {
  console.log(`✅ ${path.basename(blockmapPath)} trouvé (optionnel)`);
} else {
  console.log(
    `⚠️  ${path.basename(blockmapPath)} non trouvé (optionnel, mais recommandé)`
  );
}

console.log("\n📦 Fichiers à uploader sur GitHub:");
console.log(`   1. ${latestYml.path}`);
console.log(`   2. latest.yml`);
if (fs.existsSync(blockmapPath)) {
  console.log(`   3. ${path.basename(blockmapPath)} (optionnel)`);
}

console.log("\n✅ Tout est prêt pour la release!");
console.log("\n🚀 Prochaines étapes:");
console.log(
  "   1. Allez sur GitHub: https://github.com/votre-username/nartya/releases"
);
console.log(`   2. Créez une release avec le tag v${latestYml.version}`);
console.log("   3. Uploadez les fichiers listés ci-dessus");
console.log("   4. Publiez la release!");
