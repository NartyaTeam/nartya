import assert from "node:assert/strict";
import test from "node:test";
import { createProgressBatcher } from "../src/lib/progressBatcher.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function harness(options = {}) {
  const sent = [];
  const settled = [];
  const batcher = createProgressBatcher({
    delayMs: 20,
    send: async (entries) => {
      sent.push(entries.map((e) => e.key));
      return options.ok ?? true;
    },
    onSettled: (entries, ok) => settled.push({ keys: entries.map((e) => e.key), ok }),
    ...options,
  });
  return { batcher, sent, settled };
}

test("des sauvegardes rapprochées partent en une seule requête", async () => {
  const { batcher, sent } = harness();
  batcher.add("a", { key: "a", v: 1 });
  batcher.add("b", { key: "b", v: 1 });
  batcher.add("c", { key: "c", v: 1 });
  await wait(60);
  assert.deepEqual(sent, [["a", "b", "c"]]);
});

test("la dernière position d'un épisode remplace les précédentes", async () => {
  const entries = [];
  const batcher = createProgressBatcher({
    delayMs: 20,
    send: async (batch) => (entries.push(...batch), true),
  });
  batcher.add("a", { key: "a", v: 1 });
  batcher.add("a", { key: "a", v: 2 });
  batcher.add("a", { key: "a", v: 3 });
  await wait(60);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].v, 3);
});

test("un envoi urgent avance l'échéance, jamais l'inverse", async () => {
  const { batcher, sent } = harness({ delayMs: 200 });
  batcher.add("a", { key: "a" });
  batcher.add("b", { key: "b" }, { delay: 10 });
  await wait(60);
  assert.deepEqual(sent, [["a", "b"]]);

  const second = harness({ delayMs: 200 });
  second.batcher.add("a", { key: "a" }, { delay: 10 });
  second.batcher.add("b", { key: "b" }, { delay: 200 });
  await wait(60);
  assert.deepEqual(second.sent, [["a", "b"]]);
});

test("flush envoie tout de suite et attend la fin", async () => {
  const { batcher, sent } = harness({ delayMs: 10_000 });
  batcher.add("a", { key: "a" });
  await batcher.flush();
  assert.deepEqual(sent, [["a"]]);
  assert.equal(batcher.size, 0);
});

test("les gros lots sont découpés", async () => {
  const { batcher, sent } = harness({ chunkSize: 2 });
  for (const k of ["a", "b", "c", "d", "e"]) batcher.add(k, { key: k });
  await batcher.flush();
  assert.deepEqual(sent, [["a", "b"], ["c", "d"], ["e"]]);
});

test("un échec est signalé sans bloquer les envois suivants", async () => {
  const { batcher, settled } = harness({ ok: false });
  batcher.add("a", { key: "a" });
  await batcher.flush();
  batcher.add("b", { key: "b" });
  await batcher.flush();
  assert.deepEqual(settled, [
    { keys: ["a"], ok: false },
    { keys: ["b"], ok: false },
  ]);
});

test("une erreur levée par l'envoi compte comme un échec", async () => {
  const settled = [];
  const batcher = createProgressBatcher({
    send: async () => {
      throw new Error("réseau");
    },
    onSettled: (entries, ok) => settled.push(ok),
  });
  batcher.add("a", { key: "a" });
  await batcher.flush();
  assert.deepEqual(settled, [false]);
});

test("les envois sont en série : un lot plus récent ne double pas un lot en cours", async () => {
  const order = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const batcher = createProgressBatcher({
    send: async (entries) => {
      order.push(`start:${entries[0].v}`);
      if (entries[0].v === 1) await gate;
      order.push(`end:${entries[0].v}`);
      return true;
    },
  });
  batcher.add("a", { key: "a", v: 1 });
  const first = batcher.flush();
  batcher.add("a", { key: "a", v: 2 });
  const second = batcher.flush();
  await wait(20);
  assert.deepEqual(order, ["start:1"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["start:1", "end:1", "start:2", "end:2"]);
});
