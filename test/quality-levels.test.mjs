import assert from "node:assert/strict";
import test from "node:test";
import {
  pickFixedQualityLevel,
  pickHighestLevel,
  pickLevelForHeight,
} from "../src/utils/qualityLevels.js";

const levels = [
  { height: 360, bitrate: 500_000 },
  { height: 1080, bitrate: 4_000_000 },
  { height: 720, bitrate: 2_000_000 },
  { height: 1080, bitrate: 6_000_000 },
];

test("Anime4K Max choisit la meilleure résolution puis le meilleur débit", () => {
  assert.equal(pickHighestLevel(levels), 3);
  assert.equal(pickFixedQualityLevel(levels, "max"), 3);
});

test("une cible Anime4K choisit la meilleure variante sans la dépasser", () => {
  assert.equal(pickFixedQualityLevel(levels, "720"), 2);
  assert.equal(pickFixedQualityLevel(levels, "540"), 0);
});

test("une cible sous toutes les variantes retombe sur la plus basse", () => {
  assert.equal(pickLevelForHeight(levels, 240), 0);
});

test("une préférence invalide retombe sur Max et une liste vide reste sûre", () => {
  assert.equal(pickFixedQualityLevel(levels, "inconnue"), 3);
  assert.equal(pickFixedQualityLevel([], "max"), -1);
});
