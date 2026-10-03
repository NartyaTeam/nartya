#!/usr/bin/env node
/**
 * Manifeste de release iOS et source SideStore/AltStore.
 *
 * - `ios-release.json` : politique de version lue par l'API, même forme que le manifeste
 *   Android (`platform: "ios"` obligatoire).
 * - `source.json` : source au format AltStore, qui fait apparaître les mises à jour dans
 *   l'app de sideload.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SITE_URL } from "../src/config/instance.js";
import { normalizeAndroidBaseUrl, normalizeReleaseVersion, sha256File } from "./gen-android-release-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANGELOG_MAX_VERSIONS = 15;
const DEFAULT_BASE_URL = `${SITE_URL}/dl/ios/`;
const DEFAULT_VERSION_FILE = "ios/version.json";
export const BUNDLE_ID = "com.nartya.app";
export const MIN_OS_VERSION = "15.0";

export function readIosVersion(path = DEFAULT_VERSION_FILE) {
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  const versionName = normalizeReleaseVersion(metadata.versionName);
  const buildNumber = Number(metadata.buildNumber);
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 1 || buildNumber > 2100000000) {
    throw new Error(`buildNumber iOS invalide: ${metadata.buildNumber}`);
  }
  return { versionName, buildNumber };
}

/** Un journal illisible ne bloque pas la publication de l'IPA. */
export async function readIosChangelog() {
  try {
    const mod = await import(pathToFileURL(join(__dirname, "../src/data/changelog.ios.js")));
    if (Array.isArray(mod.IOS_CHANGELOG)) return mod.IOS_CHANGELOG.slice(0, CHANGELOG_MAX_VERSIONS);
  } catch (e) {
    console.warn(`⚠️ changelog iOS non embarqué (${e.message})`);
  }
  return [];
}

export async function buildIosReleaseManifest({
  ipaPath,
  version,
  buildNumber,
  baseUrl = DEFAULT_BASE_URL,
  releasedAt = new Date().toISOString(),
  changelog = [],
}) {
  if (!ipaPath || !String(ipaPath).toLowerCase().endsWith(".ipa")) throw new Error("un fichier IPA est requis");
  const stats = statSync(ipaPath);
  if (!stats.isFile() || stats.size === 0) throw new Error("l'IPA est vide ou introuvable");
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 1) throw new Error("buildNumber iOS requis");
  return {
    schemaVersion: 1,
    platform: "ios",
    latest: normalizeReleaseVersion(version),
    buildNumber,
    minSupported: "0.0.0",
    message: null,
    downloadUrl: new URL(encodeURIComponent(basename(ipaPath)), normalizeAndroidBaseUrl(baseUrl)).toString(),
    sha256: await sha256File(ipaPath),
    size: stats.size,
    releasedAt,
    changelog,
  };
}

const TYPE_PREFIX = { new: "Nouveau", improved: "Amélioré", fixed: "Corrigé" };

/** Texte simple : les apps de sideload n'affichent pas de Markdown. */
export function versionNotes(changelog, version) {
  const entry = (changelog || []).find((item) => item.version === version);
  const items = (entry?.items || []).filter((item) => !item.premiumOnly);
  if (!items.length) return `Nartya ${version}`;
  return items.map((item) => `• ${TYPE_PREFIX[item.type] ? `${TYPE_PREFIX[item.type]} : ` : ""}${item.text}`).join("\n");
}

/** `previous` = source en ligne : ses versions sont conservées derrière la nouvelle. */
export function buildSideStoreSource(manifest, { previous = null, iconURL, website = SITE_URL } = {}) {
  if (manifest?.platform !== "ios") throw new Error("manifeste iOS attendu");
  const current = {
    version: manifest.latest,
    buildVersion: String(manifest.buildNumber),
    date: manifest.releasedAt,
    localizedDescription: versionNotes(manifest.changelog, manifest.latest),
    downloadURL: manifest.downloadUrl,
    size: manifest.size,
    minOSVersion: MIN_OS_VERSION,
  };
  const older = (previous?.apps?.find((app) => app.bundleIdentifier === BUNDLE_ID)?.versions || [])
    .filter((item) => item.version !== current.version)
    .slice(0, 9);
  const versions = [current, ...older];
  return {
    name: "Nartya",
    identifier: "app.nartya.source",
    subtitle: "Anime en streaming, VF et VOSTFR",
    website,
    iconURL,
    tintColor: "#FF4A2D",
    apps: [
      {
        name: "Nartya",
        bundleIdentifier: BUNDLE_ID,
        developerName: "Nartya",
        subtitle: "Anime en streaming, VF et VOSTFR",
        localizedDescription:
          "Regarde tes animes en VF et VOSTFR, reprends là où tu t'étais arrêté, lis les scans et télécharge tes épisodes pour les voir hors ligne.",
        iconURL,
        tintColor: "#FF4A2D",
        category: "entertainment",
        // Encore lus par d'anciennes versions de SideStore (sources v1).
        version: current.version,
        versionDate: current.date,
        versionDescription: current.localizedDescription,
        downloadURL: current.downloadURL,
        size: current.size,
        versions,
        // IPA non signée : rien à déclarer. AltStore refuse l'installation si cette liste diffère de l'IPA.
        appPermissions: { entitlements: [], privacy: {} },
      },
    ],
    news: [],
  };
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const [ipaPath, ...args] = process.argv.slice(2);
  if (!ipaPath) {
    console.error("usage: gen-ios-release-manifest.mjs <ipa> [--version x.y.z] [--base-url https://…/] [--out fichier]");
    process.exitCode = 1;
    return;
  }
  const local = readIosVersion();
  const version = flag(args, "--version") || local.versionName;
  const out = flag(args, "--out") || join(dirname(ipaPath), "ios-release.json");
  const manifest = await buildIosReleaseManifest({
    ipaPath,
    version,
    buildNumber: local.buildNumber,
    baseUrl: flag(args, "--base-url") || DEFAULT_BASE_URL,
    changelog: await readIosChangelog(),
  });
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`✅ manifeste iOS v${manifest.latest} (build ${manifest.buildNumber}) → ${out}`);
  console.log(`   SHA-256 ${manifest.sha256}`);

  // Cette seule version : la publication y ajoute celles déjà en ligne.
  const sourceOut = flag(args, "--source-out");
  if (sourceOut) {
    const baseUrl = normalizeAndroidBaseUrl(flag(args, "--base-url") || DEFAULT_BASE_URL);
    const source = buildSideStoreSource(manifest, { iconURL: new URL("icon.png", baseUrl).toString() });
    writeFileSync(sourceOut, `${JSON.stringify(source, null, 2)}\n`);
    console.log(`✅ source SideStore → ${sourceOut}`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
