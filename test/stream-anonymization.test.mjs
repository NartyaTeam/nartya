/** Aucune URL d'hébergeur ne doit atteindre le renderer ou le lecteur. */
import assert from "node:assert/strict";
import test from "node:test";
import { loadApiModule, API_ABSENTE } from "./helpers/api-repo.mjs";

process.env.NARTYA_STREAM_KEY = "a".repeat(64); // clé fixe : jetons reproductibles

// Moitié API du contrat : « skipped » sans le dépôt API.
const jetons = await loadApiModule("stream-token.js");
const tableSources = await loadApiModule("sources.js");
const sansApi = jetons && tableSources ? false : API_ABSENTE;

const { sealStreamUrl, openStreamToken } = jetons || {};
const { detectProvider, providerMeta, isPlayableProvider, normalizeEmbedUrl } =
  tableSources || {};

const EMBED = "https://ansembed.net/embed-abc.html";

test("un jeton scellé ne laisse rien fuir et se descelle à l'identique", { skip: sansApi }, () => {
  const token = sealStreamUrl(EMBED, "ansembed");

  assert.ok(!token.includes("ansembed"));
  assert.ok(!/[.:/]/.test(token), "le jeton doit rester une chaîne opaque url-safe");
  assert.deepEqual(openStreamToken(token), { url: EMBED, provider: "ansembed" });

  // IV aléatoire : deux scellements de la même URL diffèrent.
  assert.notEqual(token, sealStreamUrl(EMBED, "ansembed"));
});

test("un jeton altéré, tronqué ou inventé est rejeté", { skip: sansApi }, () => {
  const token = sealStreamUrl(EMBED, "ansembed");
  assert.equal(openStreamToken(token.slice(0, -2) + "ZZ"), null);
  assert.equal(openStreamToken(token.slice(0, 20)), null);
  assert.equal(openStreamToken("bGppKhtjgMClT20s1GK04NtlZmUydLbzc"), null);
  assert.equal(openStreamToken(""), null);
});

test("un jeton expiré est rejeté comme un jeton invalide", { skip: sansApi }, async () => {
  process.env.NARTYA_STREAM_TTL_MS = "1";
  // La TTL est lue au chargement du module.
  const { sealStreamUrl: sealCourt, openStreamToken: ouvrirCourt } =
    await loadApiModule("stream-token.js?ttl=court");
  const token = sealCourt(EMBED, "ansembed");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(ouvrirCourt(token), null);
  delete process.env.NARTYA_STREAM_TTL_MS;
});

test("la table des sources reste neutre et écarte les hébergeurs désactivés", { skip: sansApi }, () => {
  assert.equal(detectProvider(EMBED), "ansembed");
  assert.equal(detectProvider("https://example.test/embed"), null);
  assert.equal(isPlayableProvider("ansembed"), true);
  assert.equal(isPlayableProvider("oneupload"), false, "extraction en échec à 100 %");

  const meta = providerMeta("ansembed");
  assert.equal(meta.label, "Source A");
  assert.equal(meta.recommended, true);
  for (const key of ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]) {
    assert.ok(key.startsWith("s"), "les clés publiques ne nomment pas l'hébergeur");
  }

  assert.equal(
    normalizeEmbedUrl("https://vidmoly.to/w/a"),
    "https://vidmoly.biz/w/a",
    "normalisation faite côté serveur depuis que le client ne voit plus l'URL"
  );
});

test("la recette est indexée par clé opaque : aucun nom d'hébergeur n'en sort", { skip: sansApi }, () => {
  const recipe = tableSources.buildSourceRecipe();
  const keys = Object.keys(recipe.sources);
  assert.ok(keys.length > 0);
  assert.ok(keys.every((key) => /^s\d+$/.test(key)), `clés non opaques : ${keys.join(", ")}`);
  assert.ok(!JSON.stringify(Object.keys(recipe.sources)).includes("ansembed"));
});
