import assert from "node:assert/strict";
import test from "node:test";
import { mapLimit } from "../src/lib/mapLimit.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("jamais plus de `limit` appels en cours", async () => {
  let running = 0;
  let peak = 0;
  await mapLimit(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
    running++;
    peak = Math.max(peak, running);
    await wait(5);
    running--;
  });
  assert.equal(peak, 3);
});

test("les résultats gardent l'ordre des éléments", async () => {
  const out = await mapLimit([30, 5, 15, 1], 2, async (ms, i) => {
    await wait(ms);
    return `${i}:${ms}`;
  });
  assert.deepEqual(out, ["0:30", "1:5", "2:15", "3:1"]);
});

test("tous les éléments sont traités une seule fois", async () => {
  const seen = [];
  await mapLimit([1, 2, 3, 4, 5], 2, async (n) => void seen.push(n));
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5]);
});

test("liste vide, limite plus grande que la liste, limite invalide", async () => {
  assert.deepEqual(await mapLimit([], 3, async () => 1), []);
  assert.deepEqual(await mapLimit([1, 2], 10, async (n) => n * 2), [2, 4]);
  assert.deepEqual(await mapLimit([1, 2], 0, async (n) => n), [1, 2]);
  assert.deepEqual(await mapLimit(new Set([7, 8]), 2, async (n) => n), [7, 8]);
});

test("une erreur rejette le tout, comme Promise.all", async () => {
  await assert.rejects(
    mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    }),
    /boom/
  );
});
