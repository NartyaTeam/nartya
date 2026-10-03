import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  BUNDLE_ID,
  buildIosReleaseManifest,
  buildSideStoreSource,
  readIosVersion,
  versionNotes,
} from "../scripts/gen-ios-release-manifest.mjs";

async function withIpa(run) {
  const directory = await mkdtemp(join(tmpdir(), "nartya-ios-manifest-"));
  try {
    const ipaPath = join(directory, "Nartya-1.0.0-ios.ipa");
    const content = Buffer.from("ipa-non-signee");
    await writeFile(ipaPath, content);
    await run(ipaPath, content);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("iOS possède un versionnage produit indépendant du desktop et d'Android", () => {
  const { versionName, buildNumber } = readIosVersion();
  assert.match(versionName, /^\d+\.\d+\.\d+$/);
  assert.ok(Number.isSafeInteger(buildNumber) && buildNumber >= 1);
});

test("le manifeste iOS se déclare iOS et lie l'IPA à son SHA-256", async () => {
  await withIpa(async (ipaPath, content) => {
    const manifest = await buildIosReleaseManifest({
      ipaPath,
      version: "v1.0.0",
      buildNumber: 3,
      baseUrl: "https://nartya.app/dl/ios",
      releasedAt: "2026-09-29T10:00:00.000Z",
    });
    assert.deepEqual(manifest, {
      schemaVersion: 1,
      // Sans ce marqueur, l'app iOS ignore la politique.
      platform: "ios",
      latest: "1.0.0",
      buildNumber: 3,
      minSupported: "0.0.0",
      message: null,
      downloadUrl: "https://nartya.app/dl/ios/Nartya-1.0.0-ios.ipa",
      sha256: createHash("sha256").update(content).digest("hex"),
      size: content.length,
      releasedAt: "2026-09-29T10:00:00.000Z",
      changelog: [],
    });
  });
});

test("un fichier qui n'est pas une IPA est refusé", async () => {
  await assert.rejects(
    buildIosReleaseManifest({ ipaPath: "Nartya.apk", version: "1.0.0", buildNumber: 1 }),
    /IPA/,
  );
});

test("la source SideStore décrit la bonne app et garde les versions précédentes", async () => {
  await withIpa(async (ipaPath) => {
    const manifest = await buildIosReleaseManifest({
      ipaPath,
      version: "1.0.1",
      buildNumber: 2,
      releasedAt: "2026-10-01T10:00:00.000Z",
      changelog: [
        {
          version: "1.0.1",
          items: [
            { type: "fixed", text: "Lecture plus stable." },
            { type: "new", text: "Réservé Premium.", premiumOnly: true },
          ],
        },
      ],
    });
    const previous = {
      apps: [{ bundleIdentifier: BUNDLE_ID, versions: [{ version: "1.0.0" }, { version: "1.0.1" }] }],
    };
    const source = buildSideStoreSource(manifest, { previous, iconURL: "https://nartya.app/dl/ios/icon.png" });
    const [app] = source.apps;

    assert.equal(app.bundleIdentifier, "com.nartya.app");
    assert.deepEqual(app.appPermissions, { entitlements: [], privacy: {} });
    assert.deepEqual(
      app.versions.map((item) => item.version),
      ["1.0.1", "1.0.0"],
      "la nouvelle version en tête, jamais en double",
    );
    assert.equal(app.versions[0].downloadURL, "https://nartya.app/dl/ios/Nartya-1.0.0-ios.ipa");
    assert.equal(app.versions[0].buildVersion, "2");
    assert.equal(app.version, "1.0.1", "champs historiques pour les anciennes versions de SideStore");
    assert.equal(app.versions[0].localizedDescription, "• Corrigé : Lecture plus stable.");
  });
});

test("les notes de version n'exposent jamais une ligne Premium", () => {
  assert.equal(versionNotes([], "2.0.0"), "Nartya 2.0.0");
  assert.equal(
    versionNotes([{ version: "2.0.0", items: [{ type: "new", text: "Secret", premiumOnly: true }] }], "2.0.0"),
    "Nartya 2.0.0",
  );
});

test("seul un manifeste iOS peut produire une source SideStore", () => {
  assert.throws(() => buildSideStoreSource({ platform: "android" }), /iOS/);
});
