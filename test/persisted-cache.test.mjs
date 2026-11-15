/** Cache persisté (useCachedResource) : borné, relu comme périmé, jamais au-delà de son âge maximal. */
import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  constructor(quota = Infinity) {
    this.map = new Map();
    this.quota = quota;
  }
  get length() {
    return this.map.size;
  }
  key(i) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    const used = [...this.map.entries()].reduce((n, [key, val]) => n + (key === k ? 0 : key.length + val.length), 0);
    if (used + k.length + v.length > this.quota) throw new Error("QuotaExceededError");
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

globalThis.localStorage = new MemoryStorage();
const { getOrFetch, invalidateCache } = await import("../src/hooks/useCachedResource.js");
const PERSIST = { persist: true, persistentMaxAgeMs: 60_000 };
const keys = () => [...localStorage.map.keys()].filter((k) => !k.endsWith("__index"));
const big = (n) => ({ blob: "x".repeat(n) });

test("une valeur persistée est servie telle quelle après un redémarrage, puis revalidée", async () => {
  await getOrFetch("t:a", async () => ({ v: 1 }), 1000, PERSIST);
  assert.equal(keys().length, 1);
  // Redémarrage : plus rien en mémoire, seulement le disque.
  invalidateCache("zzz"); // sans effet sur t:a, force un nouveau cycle
  const entry = JSON.parse(localStorage.getItem("nartya:resource-cache:t:a"));
  assert.deepEqual(entry.data, { v: 1 });
});

test("en cas d'échec réseau, la valeur du disque sert de repli", async () => {
  localStorage.setItem("nartya:resource-cache:t:fallback", JSON.stringify({ data: { v: "disque" }, ts: Date.now() - 5000 }));
  const out = await getOrFetch("t:fallback", async () => { throw new Error("hors ligne"); }, 1000, PERSIST);
  assert.deepEqual(out, { v: "disque" });
});

test("une entrée plus vieille que l'âge maximal n'est pas relue", async () => {
  localStorage.setItem("nartya:resource-cache:t:old", JSON.stringify({ data: { v: "vieux" }, ts: Date.now() - 120_000 }));
  const out = await getOrFetch("t:old", async () => ({ v: "frais" }), 1000, PERSIST);
  assert.deepEqual(out, { v: "frais" });
});

test("le disque reste borné : au plus 80 entrées et ~4 M de caractères", async () => {
  globalThis.localStorage = new MemoryStorage();
  for (let i = 0; i < 120; i++) await getOrFetch(`t:many:${i}`, async () => big(20_000), 1000, PERSIST);
  const total = keys().reduce((n, k) => n + localStorage.getItem(k).length, 0);
  assert.ok(keys().length <= 80, `${keys().length} entrées`);
  assert.ok(total <= 4_100_000, `${total} caractères`);
  // La plus récente est toujours là, la plus ancienne a été écartée.
  assert.ok(localStorage.getItem("nartya:resource-cache:t:many:119"));
  assert.equal(localStorage.getItem("nartya:resource-cache:t:many:0"), null);
});

test("quota plein : on libère les plus anciennes au lieu d'échouer", async () => {
  globalThis.localStorage = new MemoryStorage(120_000);
  for (let i = 0; i < 10; i++) await getOrFetch(`t:quota:${i}`, async () => big(30_000), 1000, PERSIST);
  assert.ok(localStorage.getItem("nartya:resource-cache:t:quota:9"), "la dernière entrée est gardée");
});

test("invalidateCache retire aussi l'index", async () => {
  globalThis.localStorage = new MemoryStorage();
  await getOrFetch("inv:1", async () => ({ v: 1 }), 1000, PERSIST);
  invalidateCache("inv:");
  assert.equal(localStorage.getItem("nartya:resource-cache:inv:1"), null);
  assert.equal(JSON.parse(localStorage.getItem("nartya:resource-cache:__index") || "{}")["inv:1"], undefined);
});
