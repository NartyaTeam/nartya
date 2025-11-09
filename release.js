#!/usr/bin/env node

/**
 * Script de release interactif pour Nartya
 * Usage: node release.js
 */

const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function exec(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'inherit' });
  } catch (error) {
    console.error(`❌ Erreur lors de l'exécution de: ${command}`);
    process.exit(1);
  }
}

async function main() {
  console.log('\n🚀 Assistant de Release Nartya\n');

  // Vérifier qu'on est sur main/master
  const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  if (branch !== 'main' && branch !== 'master') {
    console.log(`⚠️  Vous êtes sur la branche "${branch}"`);
    const continueAnyway = await question('Continuer quand même ? (y/N): ');
    if (continueAnyway.toLowerCase() !== 'y') {
      console.log('❌ Release annulée');
      process.exit(0);
    }
  }

  // Vérifier qu'il n'y a pas de changements non commités
  try {
    execSync('git diff-index --quiet HEAD --');
  } catch {
    console.log('⚠️  Vous avez des changements non commités');
    const commitNow = await question('Voulez-vous les commiter maintenant ? (y/N): ');
    if (commitNow.toLowerCase() === 'y') {
      const message = await question('Message de commit: ');
      exec('git add .');
      exec(`git commit -m "${message}"`);
    } else {
      console.log('❌ Veuillez commiter vos changements avant de continuer');
      process.exit(1);
    }
  }

  // Lire la version actuelle
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const currentVersion = packageJson.version;

  console.log(`\n📦 Version actuelle: ${currentVersion}\n`);

  // Demander le type de release
  console.log('Quel type de release ?');
  console.log('  1. Patch (bug fix)     - 1.0.0 → 1.0.1');
  console.log('  2. Minor (feature)     - 1.0.0 → 1.1.0');
  console.log('  3. Major (breaking)    - 1.0.0 → 2.0.0');
  console.log('  4. Annuler\n');

  const choice = await question('Votre choix (1-4): ');

  let versionType;
  switch (choice) {
    case '1':
      versionType = 'patch';
      break;
    case '2':
      versionType = 'minor';
      break;
    case '3':
      versionType = 'major';
      break;
    case '4':
      console.log('❌ Release annulée');
      process.exit(0);
    default:
      console.log('❌ Choix invalide');
      process.exit(1);
  }

  // Calculer la nouvelle version
  const [major, minor, patch] = currentVersion.split('.').map(n => parseInt(n.replace(/[^0-9]/g, '')));
  let newVersion;
  switch (versionType) {
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
  }

  console.log(`\n✨ Nouvelle version: ${newVersion}\n`);

  // Demander les notes de release
  console.log('📝 Notes de release (optionnel, Entrée pour passer):');
  const releaseNotes = await question('> ');

  // Confirmation finale
  console.log('\n📋 Résumé:');
  console.log(`   Version actuelle: ${currentVersion}`);
  console.log(`   Nouvelle version: ${newVersion}`);
  console.log(`   Type: ${versionType}`);
  if (releaseNotes) {
    console.log(`   Notes: ${releaseNotes}`);
  }
  console.log('');

  const confirm = await question('Confirmer la release ? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ Release annulée');
    process.exit(0);
  }

  console.log('\n🚀 Lancement de la release...\n');

  // Exécuter la release
  try {
    console.log('1️⃣ Mise à jour de la version...');
    exec(`npm version ${versionType} -m "chore: release v${newVersion}"`);

    console.log('\n2️⃣ Build de l\'application...');
    exec('npm run build');

    console.log('\n3️⃣ Push des changements...');
    exec('git push');
    exec('git push --tags');

    console.log('\n✅ Release terminée avec succès!\n');
    console.log('📦 Prochaines étapes:');
    console.log('   1. Allez sur GitHub: https://github.com/votre-username/nartya/releases');
    console.log('   2. Créez une nouvelle release avec le tag v' + newVersion);
    console.log('   3. Uploadez les fichiers depuis dist/:');
    console.log('      - Nartya Setup ' + newVersion + '.exe');
    console.log('      - latest.yml');
    console.log('      - Nartya Setup ' + newVersion + '.exe.blockmap');
    if (releaseNotes) {
      console.log('   4. Ajoutez les notes: ' + releaseNotes);
    }
    console.log('   5. Publiez la release!\n');

  } catch (error) {
    console.error('\n❌ Erreur lors de la release');
    console.error(error.message);
    process.exit(1);
  }

  rl.close();
}

main().catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});

