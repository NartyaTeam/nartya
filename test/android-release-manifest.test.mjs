import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  buildAndroidReleaseManifest,
  normalizeAndroidBaseUrl,
  normalizeReleaseVersion,
  readAndroidVersion,
} from "../scripts/gen-android-release-manifest.mjs";

test("Android possède un versionnage produit indépendant du desktop", () => {
  assert.deepEqual(readAndroidVersion(), {
    versionName: "1.1.0",
    versionCode: 12806,
  });
});

test("le manifeste Android lie une APK versionnée à son SHA-256", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nartya-android-manifest-"));
  try {
    const apkPath = join(directory, "Nartya-1.0.0-android.apk");
    const content = Buffer.from("apk-release-signee");
    await writeFile(apkPath, content);

    const manifest = await buildAndroidReleaseManifest({
      apkPath,
      version: "v1.0.0",
      baseUrl: "https://nartya.app/dl/android",
      releasedAt: "2026-08-21T10:00:00.000Z",
    });

    assert.deepEqual(manifest, {
      schemaVersion: 1,
      platform: "android",
      latest: "1.0.0",
      minSupported: "0.0.0",
      message: null,
      downloadUrl: "https://nartya.app/dl/android/Nartya-1.0.0-android.apk",
      sha256: createHash("sha256").update(content).digest("hex"),
      size: content.length,
      releasedAt: "2026-08-21T10:00:00.000Z",
      changelog: [],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("les versions flottantes et les URL non HTTPS sont refusées", () => {
  assert.equal(normalizeReleaseVersion("v1.0.0"), "1.0.0");
  assert.throws(() => normalizeReleaseVersion("main"), /version Android invalide/);
  assert.equal(
    normalizeAndroidBaseUrl("https://nartya.app/dl/android"),
    "https://nartya.app/dl/android/"
  );
  assert.throws(() => normalizeAndroidBaseUrl("http://nartya.app/android"), /HTTPS/);
});
