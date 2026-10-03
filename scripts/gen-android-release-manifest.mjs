#!/usr/bin/env node
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SITE_URL } from "../src/config/instance.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANGELOG_MAX_VERSIONS = 15;

const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;
const HTTPS = "https:";
const DEFAULT_BASE_URL = `${SITE_URL}/dl/android/`;
const DEFAULT_MIN_SUPPORTED = "0.0.0";
const DEFAULT_VERSION_FILE = "android/version.json";

export function normalizeReleaseVersion(value) {
  const version = String(value || "").trim().replace(/^v/, "");
  if (!RELEASE_VERSION.test(version)) {
    throw new Error(`version Android invalide: ${value || "(vide)"}`);
  }
  return version;
}

export function normalizeAndroidBaseUrl(value = DEFAULT_BASE_URL) {
  const parsed = new URL(String(value || DEFAULT_BASE_URL));
  if (parsed.protocol !== HTTPS) throw new Error("l'URL Android doit utiliser HTTPS");
  if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function readAndroidVersion(path = DEFAULT_VERSION_FILE) {
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  const versionName = normalizeReleaseVersion(metadata.versionName);
  const versionCode = Number(metadata.versionCode);
  if (!Number.isSafeInteger(versionCode) || versionCode < 12800 || versionCode > 2100000000) {
    throw new Error(`versionCode Android invalide: ${metadata.versionCode}`);
  }
  return { versionName, versionCode };
}

export async function sha256File(path) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/** Embarqué tel quel. Un journal illisible n'empêche pas de publier l'APK. */
export async function readMobileChangelog() {
  try {
    const mod = await import(pathToFileURL(join(__dirname, "../src/data/changelog.mobile.js")));
    if (Array.isArray(mod.MOBILE_CHANGELOG)) {
      return mod.MOBILE_CHANGELOG.slice(0, CHANGELOG_MAX_VERSIONS);
    }
  } catch (e) {
    console.warn(`⚠️ changelog Android non embarqué (${e.message})`);
  }
  return [];
}

export async function buildAndroidReleaseManifest({
  apkPath,
  version,
  baseUrl = DEFAULT_BASE_URL,
  releasedAt = new Date().toISOString(),
  changelog = [],
}) {
  if (!apkPath || !String(apkPath).toLowerCase().endsWith(".apk")) {
    throw new Error("un fichier APK est requis");
  }
  const file = basename(apkPath);
  const normalizedVersion = normalizeReleaseVersion(version);
  const normalizedBaseUrl = normalizeAndroidBaseUrl(baseUrl);
  const stats = statSync(apkPath);
  if (!stats.isFile() || stats.size === 0) throw new Error("l'APK est vide ou introuvable");

  return {
    schemaVersion: 1,
    platform: "android",
    latest: normalizedVersion,
    minSupported: DEFAULT_MIN_SUPPORTED,
    message: null,
    downloadUrl: new URL(encodeURIComponent(file), normalizedBaseUrl).toString(),
    sha256: await sha256File(apkPath),
    size: stats.size,
    releasedAt,
    changelog,
  };
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const [apkPath, ...args] = process.argv.slice(2);
  if (!apkPath) {
    console.error(
      "usage: gen-android-release-manifest.mjs <apk> [--version x.y.z] [--base-url https://…/] [--out fichier]"
    );
    process.exitCode = 1;
    return;
  }

  const version = flag(args, "--version") || readAndroidVersion().versionName;
  const out = flag(args, "--out") || join(dirname(apkPath), "android-release.json");
  const manifest = await buildAndroidReleaseManifest({
    apkPath,
    version,
    baseUrl: flag(args, "--base-url") || DEFAULT_BASE_URL,
    changelog: await readMobileChangelog(),
  });
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `✅ manifeste Android v${manifest.latest} → ${out} (${manifest.changelog.length} entrée(s) de changelog)`
  );
  console.log(`   SHA-256 ${manifest.sha256}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
