import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, isUsableVersion } from "../src/lib/semver.js";
import {
  DEFAULT_UPDATE_PAGE,
  policyAppliesTo,
  safeUpdateUrl,
  updateTargetForPlatform,
} from "../src/lib/appUpdate.js";

test("les versions se comparent par nombre, jamais par ordre alphabétique", () => {
  // En chaînes, "1.9.0" passerait pour plus récent que "1.19.0".
  assert.ok(compareVersions("1.9.0", "1.19.0") < 0);
  assert.ok(compareVersions("1.19.0", "1.9.0") > 0);
  assert.ok(compareVersions("1.21.0", "1.3.0") > 0);
  assert.ok(compareVersions("2.0.0", "1.99.99") > 0);
});

test("égalité, préfixe v et composantes manquantes", () => {
  assert.equal(compareVersions("1.22.0", "1.22.0"), 0);
  assert.equal(compareVersions("v1.22.0", "1.22.0"), 0);
  assert.equal(compareVersions("1.22", "1.22.0"), 0, "1.22 == 1.22.0");
  assert.ok(compareVersions("1.22.1", "1.22") > 0);
});

test("une version illisible ne peut pas déclencher de blocage", () => {
  // Le plancher n'est évalué que si les deux versions sont exploitables.
  assert.equal(isUsableVersion("1.22.0"), true);
  assert.equal(isUsableVersion("v1.22"), true);
  assert.equal(isUsableVersion(""), false);
  assert.equal(isUsableVersion(null), false);
  assert.equal(isUsableVersion("dev"), false);
  assert.equal(isUsableVersion("1.22.0-beta"), false);
});

test("le plancher par défaut (0.0.0) ne bloque personne", () => {
  for (const v of ["1.12.1", "1.21.0", "0.0.1"]) {
    assert.ok(compareVersions(v, "0.0.0") >= 0, v);
  }
});

test("le contrôle de version utilise un canal distinct sur Android", () => {
  assert.equal(updateTargetForPlatform({ name: "capacitor-android" }), "android");
  assert.equal(updateTargetForPlatform({ name: "electron" }), "desktop");
  assert.equal(updateTargetForPlatform(null), "desktop");
  assert.equal(updateTargetForPlatform({ name: "capacitor-ios" }), "ios");
});

test("l'iPhone n'applique jamais une politique qui ne se déclare pas iOS", () => {
  // Une API qui ne connaît pas iOS renvoie la politique desktop.
  const desktopPolicy = { minSupported: "1.29.0", latest: "1.29.1" };
  assert.equal(policyAppliesTo("ios", desktopPolicy), false);
  assert.equal(policyAppliesTo("ios", { ...desktopPolicy, platform: "android" }), false);
  assert.equal(policyAppliesTo("ios", { ...desktopPolicy, platform: "ios" }), true);
  assert.equal(policyAppliesTo("ios", null), false);
  assert.equal(policyAppliesTo("desktop", desktopPolicy), true);
  assert.equal(policyAppliesTo("android", desktopPolicy), true);
});

test("une URL de mise à jour non HTTPS retombe sur la page officielle", () => {
  assert.equal(safeUpdateUrl("https://nartya.app/nartya.apk"), "https://nartya.app/nartya.apk");
  assert.equal(safeUpdateUrl("intent://installer"), DEFAULT_UPDATE_PAGE);
  assert.equal(safeUpdateUrl("javascript:alert(1)"), DEFAULT_UPDATE_PAGE);
  assert.equal(safeUpdateUrl(null), DEFAULT_UPDATE_PAGE);
});
