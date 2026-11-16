/** Tous les adaptateurs de plateforme exposent le même contrat (src/platform/contract.js). */
import assert from "node:assert/strict";
import test from "node:test";
import { OPTIONAL_CAPABILITIES, PLATFORM_SHAPE } from "../src/platform/contract.js";
import { capacitorLazyPlatform } from "../src/platform/capacitorLazy.js";
import { tauriPlatform } from "../src/platform/tauri.js";
import { webPlatform } from "../src/platform/web.js";

const adapters = { web: webPlatform, tauri: tauriPlatform, capacitor: capacitorLazyPlatform };

for (const [label, platform] of Object.entries(adapters)) {
  test(`${label} : toutes les clés du contrat, de la bonne nature`, () => {
    for (const [key, kind] of Object.entries(PLATFORM_SHAPE)) {
      assert.ok(key in platform, `clé absente : ${key}`);
      if (kind === "fn") assert.equal(typeof platform[key], "function", `${key} doit être une fonction`);
    }
  });

  test(`${label} : aucune clé hors contrat`, () => {
    const known = new Set([...Object.keys(PLATFORM_SHAPE), ...OPTIONAL_CAPABILITIES]);
    const unknown = Object.keys(platform).filter((key) => !known.has(key));
    assert.deepEqual(unknown, [], "à déclarer dans contract.js (PLATFORM_SHAPE ou OPTIONAL_CAPABILITIES)");
  });
}

test("les capacités optionnelles n'ont pas de valeur par défaut", () => {
  // Leur présence dit ce que la plateforme sait faire : le web n'en déclare aucune.
  for (const key of OPTIONAL_CAPABILITIES) assert.ok(!(key in webPlatform), key);
});

test("le bureau déclare ses modules natifs, le mobile et le web non", () => {
  for (const key of ["downloads", "session", "cast", "party", "hub", "discord"]) {
    assert.ok(tauriPlatform[key], `tauri.${key}`);
    assert.equal(webPlatform[key], null, `web.${key}`);
  }
  assert.ok(capacitorLazyPlatform.downloads);
  assert.equal(capacitorLazyPlatform.session, null);
  assert.equal(capacitorLazyPlatform.party, null);
});
