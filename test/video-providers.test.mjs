import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPlayableSources,
  getPrioritizedSources,
  sourceOptionLabel,
  sourceSelectOptions,
} from "../src/utils/videoSourceUtils.js";
import {
  extractFromHtml,
  parsePackedJwPlayer,
  unpackDeanEdwards,
} from "../electron/utils/video-extract.js";
import { validateEmbedUrl } from "../electron/utils/url-validator.js";
import {
  detectProvider as detectElectronProvider,
  getProviderConfig,
} from "../electron/utils/provider-fetch.js";
import { setRecipe } from "../electron/utils/source-recipe.js";
import { loadApiModule, API_ABSENTE } from "./helpers/api-repo.mjs";

// Sans recette, le client ne détecte aucun hébergeur. Sans le dépôt API, « skipped ».
const tableSources = await loadApiModule("sources.js");
const sansApi = tableSources ? false : API_ABSENTE;
if (tableSources) setRecipe(tableSources.buildSourceRecipe());

const PACKED_HLS =
  "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}" +
  "('0().1({2:[{3:\"4\"}]});',36,5,'jwplayer|setup|sources|file|https://cdn.example.test/video/master.m3u8?token=ok'.split('|'),0,{}))";

test("la recette pilote détection, allowlist et en-têtes", { skip: sansApi }, () => {
  const expected = new Map([
    ["https://ansembed.net/embed-a.html", "s1"],
    ["https://smoothpre.com/embed/a", "s3"],
    ["https://movearnpre.com/embed/a", "s4"],
    ["https://oneupload.to/embed-a.html", "s8"],
  ]);

  for (const [url, key] of expected) {
    assert.equal(detectElectronProvider(url), key, `détection: ${key}`);
    assert.equal(validateEmbedUrl(url).valid, true, `allowlist: ${key}`);
    assert.equal(
      new URL(getProviderConfig(key).headers.Referer).hostname,
      new URL(url).hostname,
      `Referer: ${key}`
    );
  }
});

test("l'allowlist exige le hostname exact ou un sous-domaine", { skip: sansApi }, () => {
  assert.equal(validateEmbedUrl("https://cdn.movearnpre.com/embed/a").valid, true);
  assert.equal(validateEmbedUrl("https://movearnpre.com.evil.test/embed/a").valid, false);
  assert.equal(validateEmbedUrl("file:///etc/passwd").valid, false);
});

test("lecteur JWPlayer direct : extrait et décode un manifeste HLS", { skip: sansApi }, () => {
  const html =
    '<script>jwplayer("v").setup({sources:[{file:"https:\\/\\/cdn.example.test\\/master.m3u8?x=1\\u0026y=2"}]});</script>';
  const result = extractFromHtml(html, "https://ansembed.net/embed-a.html");
  assert.equal(result.success, true);
  assert.equal(result.videoUrl, "https://cdn.example.test/master.m3u8?x=1&y=2");
});

test("lecteur compacté : décompacte sans eval puis extrait le HLS", { skip: sansApi }, () => {
  const decoded = unpackDeanEdwards(PACKED_HLS);
  assert.match(decoded, /jwplayer\(\)\.setup/);
  assert.match(decoded, /master\.m3u8/);

  for (const provider of ["s3", "s4", "s8"]) {
    const result = extractFromHtml(PACKED_HLS, null, provider);
    assert.equal(result.success, true, provider);
    assert.equal(
      result.videoUrl,
      "https://cdn.example.test/video/master.m3u8?token=ok",
      provider
    );
  }
});

test("le parseur refuse le contenu sans média et les packers hors limites", () => {
  assert.equal(parsePackedJwPlayer("<html>aucune vidéo</html>").success, false);
  const invalid = PACKED_HLS.replace(",36,5,", ",62,5,");
  assert.equal(unpackDeanEdwards(invalid), null);
});

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
