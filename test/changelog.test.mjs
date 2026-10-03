import assert from "node:assert/strict";
import test from "node:test";
import {
  changelogTargetForPlatform,
  filterChangelog,
  getChangelog,
  getUnreadChangelog,
} from "../src/lib/changelog.js";

const SAMPLE = [
  {
    version: "2.0.0",
    items: [
      { type: "new", text: "Commun" },
      { type: "new", text: "Premium", premiumOnly: true },
    ],
  },
  {
    version: "1.0.0",
    items: [{ type: "fixed", text: "Ancienne version" }],
  },
];

test("le filtre retire les éléments Premium inaccessibles", () => {
  const entries = filterChangelog(SAMPLE, {
    currentVersion: "2.0.0",
    isPremium: false,
  });

  assert.deepEqual(
    entries.map((entry) => entry.version),
    ["2.0.0", "1.0.0"],
  );
  assert.deepEqual(entries[0].items.map((item) => item.text), ["Commun"]);
});

test("Android et desktop utilisent deux journaux et deux versions réellement séparés", () => {
  const android = getChangelog({ target: "android", currentVersion: "1.0.0" });
  const desktop = getChangelog({ target: "desktop", currentVersion: "1.26.0" });
  const androidText = android.flatMap((entry) => entry.items.map((item) => item.text)).join(" ");
  const desktopText = desktop.flatMap((entry) => entry.items.map((item) => item.text)).join(" ");

  assert.match(androidText, /journal des nouveautés/i);
  assert.doesNotMatch(androidText, /Anime4K|fenêtre de Nartya|Nartya Hub/i);
  assert.doesNotMatch(desktopText, /journal des nouveautés/i);
});

test("chaque installation lit son propre journal (desktop, Android, iOS)", () => {
  assert.equal(changelogTargetForPlatform({ isMobile: false, os: "darwin" }), "desktop");
  assert.equal(changelogTargetForPlatform({ isMobile: true, os: "android" }), "android");
  assert.equal(changelogTargetForPlatform({ isMobile: true, os: "ios" }), "ios");
  assert.equal(changelogTargetForPlatform(null), "desktop");

  const ios = getChangelog({ target: "ios", currentVersion: "1.0.0" });
  const iosText = ios.flatMap((entry) => entry.items.map((item) => item.text)).join(" ");
  // Jamais de nouveauté Android (APK) ni desktop affichée sur iPhone.
  assert.doesNotMatch(iosText, /APK|Xiaomi|Anime4K|Nartya Hub/i);
});

test("le filtre ne montre jamais une version plus récente que l'APK", () => {
  const entries = filterChangelog(SAMPLE, {
    currentVersion: "1.4.0",
  });
  assert.deepEqual(entries.map((entry) => entry.version), ["1.0.0"]);
});

test("une nouveauté n'est signalée qu'après une version déjà vue", () => {
  const entries = filterChangelog(SAMPLE, { currentVersion: "2.0.0" });
  assert.equal(getUnreadChangelog(entries, null).length, 0);
  assert.deepEqual(
    getUnreadChangelog(entries, "1.0.0").map((entry) => entry.version),
    ["2.0.0"],
  );
  assert.equal(getUnreadChangelog(entries, "2.0.0").length, 0);
});
