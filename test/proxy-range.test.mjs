/** Hôtes qui ignorent l'en-tête `Range`. Hors réseau. */
import assert from "node:assert/strict";
import test from "node:test";
import { parseByteRange, sliceUpstream } from "../electron/utils/byte-range.js";

test("parseByteRange couvre les trois formes émises par les lecteurs", () => {
  assert.deepEqual(parseByteRange("bytes=0-", 1000), { start: 0, end: 999 });
  assert.deepEqual(parseByteRange("bytes=100-199", 1000), { start: 100, end: 199 });
  assert.deepEqual(parseByteRange("bytes=-500", 1000), { start: 500, end: 999 });
  // Fin au-delà du fichier : bornée à la taille réelle.
  assert.deepEqual(parseByteRange("bytes=900-5000", 1000), { start: 900, end: 999 });
});

test("parseByteRange rejette ce qu'on ne sait pas servir", () => {
  assert.equal(parseByteRange("bytes=1000-", 1000), null, "début hors fichier");
  assert.equal(parseByteRange("bytes=200-100", 1000), null, "bornes inversées");
  assert.equal(parseByteRange("bytes=0-99,200-299", 1000), null, "plages multiples");
  assert.equal(parseByteRange("bytes=0-", NaN), null, "taille inconnue");
  assert.equal(parseByteRange("", 1000), null);
});

/** Le fichier complet, en morceaux irréguliers. */
function fakeUpstream(buffer, chunkSize) {
  return {
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < buffer.length; i += chunkSize) {
        yield buffer.subarray(i, Math.min(buffer.length, i + chunkSize));
      }
    },
  };
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const FILE = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

test("sliceUpstream rend exactement la plage demandée", async () => {
  for (const chunkSize of [1, 7, 64, 333, 1000, 4096]) {
    const out = await collect(sliceUpstream(fakeUpstream(FILE, chunkSize), 250, 749));
    assert.equal(out.length, 500, `taille (chunk=${chunkSize})`);
    assert.ok(out.equals(FILE.subarray(250, 750)), `contenu (chunk=${chunkSize})`);
  }
});

test("sliceUpstream gère les bornes du fichier", async () => {
  const head = await collect(sliceUpstream(fakeUpstream(FILE, 128), 0, 0));
  assert.ok(head.equals(FILE.subarray(0, 1)), "premier octet seul");

  const tail = await collect(sliceUpstream(fakeUpstream(FILE, 128), 999, 999));
  assert.ok(tail.equals(FILE.subarray(999)), "dernier octet seul");

  const whole = await collect(sliceUpstream(fakeUpstream(FILE, 128), 0, 999));
  assert.ok(whole.equals(FILE), "fichier entier");
});

test("sliceUpstream cesse de lire dès la plage complète", async () => {
  // On ne télécharge pas la queue du fichier après la plage demandée.
  let produced = 0;
  const counting = {
    destroy() {},
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < FILE.length; i += 100) {
        produced += 100;
        yield FILE.subarray(i, i + 100);
      }
    },
  };
  const out = await collect(sliceUpstream(counting, 0, 149));
  assert.equal(out.length, 150);
  assert.equal(produced, 200, "lecture arrêtée au 2ᵉ morceau, pas au 10ᵉ");
});
