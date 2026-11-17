import assert from "node:assert/strict";
import test from "node:test";
import { CHANGELOG } from "../src/data/changelog.js";
import { MOBILE_CHANGELOG } from "../src/data/changelog.mobile.js";
import { IOS_CHANGELOG } from "../src/data/changelog.ios.js";

const TYPES = new Set(["new", "improved", "fixed"]);
const MAX_HIGHLIGHTS = 3;
const MAX_TITLE = 32;
const MAX_TEXT = 110;

/** Une entrée qui utilise le nouveau format (au moins un titre) doit le respecter en entier. */
const structured = (entry) => entry.items.some((item) => item.title);

for (const [name, log] of [
  ["desktop", CHANGELOG],
  ["android", MOBILE_CHANGELOG],
  ["ios", IOS_CHANGELOG],
]) {
  test(`journal ${name} : versions uniques, types connus, texte présent`, () => {
    const versions = log.map((entry) => entry.version);
    assert.equal(new Set(versions).size, versions.length);
    for (const entry of log) {
      for (const item of entry.items) {
        assert.ok(TYPES.has(item.type), `${entry.version} : type ${item.type}`);
        assert.ok(item.text || item.title, `${entry.version} : ligne vide`);
      }
    }
  });

  test(`journal ${name} : les entrées au nouveau format restent courtes et harmonieuses`, () => {
    for (const entry of log.filter(structured)) {
      const label = `${name} ${entry.version}`;
      const highlights = entry.items.filter((item) => item.highlight);
      assert.ok(highlights.length <= MAX_HIGHLIGHTS, `${label} : ${highlights.length} cartes à la une`);
      for (const item of entry.items) {
        assert.ok(item.title, `${label} : une ligne n'a pas de titre (${item.text})`);
        assert.ok(item.title.length <= MAX_TITLE, `${label} : titre trop long (${item.title})`);
        assert.ok((item.text || "").length <= MAX_TEXT, `${label} : texte trop long (${item.title})`);
      }
    }
  });
}
