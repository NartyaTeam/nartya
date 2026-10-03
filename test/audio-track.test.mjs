/** Cas de référence : un master où le français est 7ᵉ sur 8 pistes, toutes DEFAULT=NO. */
import assert from "node:assert/strict";
import test from "node:test";
import { findPreferredAudioIndex } from "../src/utils/audioTrack.js";

// Deux GROUP-ID : « surround » en tête, puis « stéréo ».
const MASTER_TRACKS = [
  { group: "ec3", lang: "de", name: "German 5.1" },
  { group: "ec3", lang: "en", name: "English 5.1" },
  { group: "aac", lang: "de", name: "German stereo" },
  { group: "aac", lang: "en", name: "English stereo" },
  { group: "aac", lang: "en", name: "English AD" },
  { group: "aac", lang: "es", name: "Spanish stereo" },
  { group: "aac", lang: "fr", name: "French stereo" },
  { group: "aac", lang: "it", name: "Italian stereo" },
  { group: "aac", lang: "pt", name: "Portuguese stereo" },
  { group: "aac", lang: "ja", name: "Japanese stereo" },
];
const PREFERRED = { index: 6, lang: "fr", name: "French stereo" };

test("master mono-groupe : la VF est trouvée là où le serveur l'annonce", () => {
  assert.equal(findPreferredAudioIndex(MASTER_TRACKS, PREFERRED), 6);
});

test("master multi-groupes : l'index serveur ne s'applique plus, la langue si", () => {
  // Level courant sur le groupe « aac » : les pistes 5.1 ont disparu, les index ont glissé de 2.
  const group = MASTER_TRACKS.filter((t) => t.group === "aac");
  const index = findPreferredAudioIndex(group, PREFERRED);
  assert.equal(group[index].lang, "fr", "piste française");
  assert.notEqual(index, PREFERRED.index, "l'index brut ne convient plus");
  assert.equal(group[PREFERRED.index]?.name, "Portuguese stereo", "témoin du bug corrigé");
});

test("les variantes d'étiquette de langue sont acceptées", () => {
  const tracks = [{ lang: "de" }, { lang: "fr-FR" }];
  assert.equal(findPreferredAudioIndex(tracks, { lang: "fr" }), 1, "fr-FR");
  assert.equal(findPreferredAudioIndex([{ lang: "de" }, { lang: "fra" }], { lang: "fr" }), 1, "fra");
  assert.equal(findPreferredAudioIndex([{ lang: "de" }, { lang: "FR" }], { lang: "fr" }), 1, "casse");
});

test("repli sur le nom quand la langue n'est pas étiquetée", () => {
  const tracks = [{ name: "German" }, { name: "French stereo" }];
  assert.equal(findPreferredAudioIndex(tracks, PREFERRED), 1);
});

test("aucune piste française dans le groupe : on ne force rien", () => {
  // Forcer l'index serveur basculerait l'utilisateur en allemand sans raison.
  const germanOnly = [{ lang: "de", name: "German 5.1" }, { lang: "en", name: "English" }];
  assert.equal(findPreferredAudioIndex(germanOnly, PREFERRED), -1);
});

test("index seul (serveur sans détail de pistes) : repli conservé", () => {
  assert.equal(findPreferredAudioIndex(MASTER_TRACKS, { index: 2 }), 2);
  assert.equal(findPreferredAudioIndex(MASTER_TRACKS, { index: 99 }), -1, "hors bornes");
});

test("entrées vides : jamais d'exception, jamais de sélection", () => {
  assert.equal(findPreferredAudioIndex([], PREFERRED), -1);
  assert.equal(findPreferredAudioIndex(null, PREFERRED), -1);
  assert.equal(findPreferredAudioIndex(MASTER_TRACKS, null), -1);
  assert.equal(findPreferredAudioIndex([{}, {}], PREFERRED), -1);
});
