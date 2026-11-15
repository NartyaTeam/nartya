/** src/shared face aux cas communs (test/fixtures/extract-cases.json), les mêmes que le cœur Rust. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  detectSourceKey,
  isAllowedEmbedHost,
  resetRecipe,
  setRecipe,
} from "../src/shared/sourceRecipe.js";
import {
  extractFromHtml,
  isExtractedVideoUrlConsistentWithEmbed,
  unpackDeanEdwards,
} from "../src/shared/videoExtract.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/extract-cases.json", import.meta.url), "utf8"),
);
setRecipe(fixture.recipe);

for (const c of fixture.extract) {
  test(`extraction : ${c.name}`, () => {
    const result = extractFromHtml(c.html, c.embed, c.source ?? undefined);
    if (c.ok !== undefined) {
      assert.equal(result.success, true, result.error);
      assert.equal(result.videoUrl, c.ok);
      return;
    }
    assert.equal(result.success, false, "une erreur était attendue");
    if (c.error !== undefined) assert.equal(result.error, c.error);
    if (c.errorContains !== undefined) assert.ok(result.error.includes(c.errorContains), result.error);
  });
}

test("cohérence embed / média", () => {
  for (const c of fixture.consistency) {
    assert.equal(
      isExtractedVideoUrlConsistentWithEmbed(c.embed, c.video),
      c.expected,
      `${c.embed} → ${c.video}`,
    );
  }
});

test("détection de la source par l'URL", () => {
  for (const c of fixture.detect) assert.equal(detectSourceKey(c.url), c.key, c.url);
});

test("allowlist des hôtes d'embed", () => {
  for (const c of fixture.allowedHosts) assert.equal(isAllowedEmbedHost(c.host), c.allowed, c.host);
});

test("dépaquetage Dean Edwards", () => {
  for (const c of fixture.unpack) assert.equal(unpackDeanEdwards(c.packed), c.expected, c.name);
});

test("sans recette, rien n'est reconnu ni autorisé", () => {
  resetRecipe();
  assert.equal(detectSourceKey("https://jw.test/e"), null);
  assert.equal(isAllowedEmbedHost("jw.test"), false);
  setRecipe(fixture.recipe);
});
