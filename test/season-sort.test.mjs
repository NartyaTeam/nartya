import test from "node:test";
import assert from "node:assert/strict";
import { sortSeasonsForDisplay } from "../src/utils/seasonSort.js";

const ids = (list) => list.map((s) => s.id);

test("sortSeasonsForDisplay : sans sections, saisons puis films puis extras", () => {
  assert.deepEqual(ids(sortSeasonsForDisplay([{ id: "film" }, { id: "saison2" }, { id: "oav" }, { id: "saison1" }])), [
    "saison1",
    "saison2",
    "film",
    "oav",
  ]);
});

test("sortSeasonsForDisplay : avec sections, ordre de la fiche (ordre de visionnage), doublons retirés", () => {
  const fate = [
    { id: "saison4", group: "Trame principale" },
    { id: "saison1", group: "Trame principale" },
    { id: "film", group: "Trame principale" },
    { id: "saison3", group: "Spin-off et autres" },
    { id: "saison2", group: "Spin-off et autres" },
    { id: "saison1", group: "Spin-off et autres" },
  ];
  assert.deepEqual(ids(sortSeasonsForDisplay(fate)), ["saison4", "saison1", "film", "saison3", "saison2"]);
});
