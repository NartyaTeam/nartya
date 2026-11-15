import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPlayableSources,
  getPrioritizedSources,
  sourceOptionLabel,
  sourceSelectOptions,
} from "../src/utils/videoSourceUtils.js";

test("les sources scellées sont triées par rang et libellées sans nommer l'hébergeur", () => {
  // Jeton opaque, libellé neutre, rang.
  const sources = {
    eps1: { id: "jeton-d", key: "s4", label: "Source D", rank: 45 },
    eps2: { id: "jeton-a", key: "s1", label: "Source A", rank: 10, recommended: true },
  };

  assert.equal(hasPlayableSources(sources), true);
  assert.equal(hasPlayableSources({}), false);
  // Une réponse d'API antérieure (URL en clair) n'est plus lisible.
  assert.equal(hasPlayableSources({ eps1: "https://ansembed.net/embed-a.html" }), false);

  // Rang croissant = essayé en premier.
  assert.deepEqual(getPrioritizedSources(sources).map((s) => s.key), ["eps2", "eps1"]);
  assert.equal(sourceOptionLabel(getPrioritizedSources(sources)[0]), "Source A ★");
  assert.equal(sourceOptionLabel(getPrioritizedSources(sources)[1]), "Source D");
  assert.deepEqual(sourceSelectOptions(getPrioritizedSources(sources)), [
    { value: "auto", label: "Source auto" },
    { value: "eps2", label: "Source A ★" },
    { value: "eps1", label: "Source D" },
  ]);

  // La source prioritaire du réglage passe devant le rang.
  assert.deepEqual(
    getPrioritizedSources(sources, "auto", "s4").map((s) => s.key),
    ["eps1", "eps2"]
  );
});

test("une source disqualifiée en lecture laisse la place aux suivantes", () => {
  const sources = {
    eps1: { id: "jeton-a", key: "s1", label: "Source A", rank: 10 },
    eps2: { id: "jeton-d", key: "s4", label: "Source D", rank: 45 },
  };

  // Auto : la source en échec disparaît, l'autre reste jouable.
  const auto = getPrioritizedSources(sources, "auto", null, { excludeKeys: ["eps1"] });
  assert.deepEqual(auto.map((s) => s.key), ["eps2"]);

  // Manuel : une source morte ne condamne pas l'épisode.
  const manual = getPrioritizedSources(sources, "eps1", null, { excludeKeys: ["eps1"] });
  assert.deepEqual(manual.map((s) => s.key), ["eps2"]);

  // Source manuelle absente du catalogue : rien.
  assert.deepEqual(getPrioritizedSources(sources, "inconnue"), []);

  assert.deepEqual(
    getPrioritizedSources(sources, "auto", null, { excludeKeys: ["eps1", "eps2"] }),
    []
  );
});
