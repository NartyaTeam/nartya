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
const { mintHandle, resolveHandle, clearHandles } = await import(
  "../electron/utils/stream-handles.js"
);
const { transformPlaylist } = await import("../electron/utils/hls-playlist.js");

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

test("sans recette, le client ne reconnaît ni n'autorise aucun hébergeur", async () => {
  const { resetRecipe, detectSourceKey, isAllowedEmbedHost } = await import(
    "../electron/utils/source-recipe.js"
  );
  const { validateEmbedUrl } = await import("../electron/utils/url-validator.js");
  resetRecipe();

  // Sans recette, le client ne reconnaît aucun hébergeur.
  assert.equal(detectSourceKey(EMBED), null);
  assert.equal(isAllowedEmbedHost("ansembed.net"), false);
  assert.equal(validateEmbedUrl(EMBED).valid, false);
});

test("la recette rend au client de quoi joindre et parser les hébergeurs", { skip: sansApi }, async () => {
  const { buildSourceRecipe } = await loadApiModule("sources.js");
  const { setRecipe, detectSourceKey, isAllowedEmbedHost } = await import(
    "../electron/utils/source-recipe.js"
  );
  const { getProviderConfig, canonicalizeUrl, getMediaReferer } = await import(
    "../electron/utils/provider-fetch.js"
  );

  const recipe = buildSourceRecipe();
  // Indexée par clé opaque : le nom interne ne sort jamais de l'API.
  assert.deepEqual(Object.keys(recipe.sources).sort(), [
    "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8",
  ]);
  assert.ok(!JSON.stringify(Object.keys(recipe.sources)).includes("ansembed"));

  setRecipe(recipe);
  assert.equal(detectSourceKey(EMBED), "s1");
  assert.equal(isAllowedEmbedHost("ansembed.net"), true);
  assert.equal(isAllowedEmbedHost("ansembed.net.evil.test"), false);
  assert.ok(getProviderConfig("s1").headers.Referer);

  // Hôte canonique et Referer des MP4.
  assert.equal(
    canonicalizeUrl("https://vidmoly.to/w/abc", "s2"),
    "https://vidmoly.biz/w/abc"
  );
  assert.equal(
    getMediaReferer("https://video.sibnet.ru/v/xx/123456.mp4", "s5"),
    "https://video.sibnet.ru/shell.php?videoid=123456"
  );
  assert.equal(getMediaReferer("https://cdn.example.test/a.mp4", "s1"), null);
});

test("une poignée traduit l'URL sans la révéler, et se déduplique", () => {
  clearHandles();
  const cible = { url: "https://cdn.example.test/master.m3u8", provider: "ansembed" };
  const handle = mintHandle(cible);

  assert.ok(!handle.includes("example.test"));
  assert.equal(resolveHandle(handle).url, cible.url);
  assert.equal(mintHandle(cible), handle, "même cible → même poignée (seek, rejeu)");
  assert.equal(resolveHandle("poignée-inventée"), null);
});

test("la playlist HLS réécrite ne contient que des poignées", () => {
  clearHandles();
  const playlist = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=AUDIO,URI="https://cdn.example.test/audio/fr.m3u8"',
    "#EXTINF:4.0,",
    "https://cdn.example.test/seg/001.ts",
    "#EXTINF:4.0,",
    "seg/002.ts",
  ].join("\n");

  const out = transformPlaylist(
    playlist,
    "https://cdn.example.test/master.m3u8",
    "http://127.0.0.1:9/video/proxy",
    { mint: mintHandle, provider: "ansembed", tokenSuffix: "&t=secret" }
  );

  assert.ok(!out.includes("cdn.example.test"), "aucune URL de CDN ne doit subsister");
  assert.ok(!out.includes("ansembed"), "le nom de l'hébergeur ne doit pas subsister");
  assert.ok(!out.includes("?url="), "plus de forme en clair");
  assert.equal((out.match(/\?h=[\w-]+&t=secret/g) || []).length, 3, "audio + 2 segments, jeton propagé");

  const handles = [...out.matchAll(/\?h=([\w-]+)/g)].map((m) => m[1]);
  assert.equal(
    resolveHandle(handles[2]).url,
    "https://cdn.example.test/seg/002.ts"
  );
});
