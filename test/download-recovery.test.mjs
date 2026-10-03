import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecoveryPayload,
  findDownloadEpisode,
} from "../src/utils/downloadRecovery.js";

test("findDownloadEpisode accepte les numéros episode et number", () => {
  const episodes = [{ number: 1 }, { episode: "2" }];
  assert.equal(findDownloadEpisode(episodes, 2), episodes[1]);
  assert.equal(findDownloadEpisode(episodes, 3), null);
});

test("buildRecoveryPayload ne restaure jamais une URL vidéo persistée", () => {
  const payload = buildRecoveryPayload(
    {
      id: "anime::s1::1::vostfr",
      slug: "anime",
      seasonId: "s1",
      ep: 1,
      lang: "vostfr",
      directUrl: "https://example.invalid/video.mp4",
      provider: "source-temporaire",
      sourcePreference: "s4",
      maxHeight: 1080,
    },
    "poignee-opaque",
  );

  assert.equal(payload.handle, "poignee-opaque");
  assert.equal(payload.sourcePreference, "s4");
  assert.equal(payload.maxHeight, 1080);
  assert.equal("directUrl" in payload, false);
  assert.equal("provider" in payload, false);
});

test("buildRecoveryPayload refuse une entrée sans identité récupérable", () => {
  assert.equal(buildRecoveryPayload({ id: "x", slug: "anime" }, "handle"), null);
  assert.equal(buildRecoveryPayload({ id: "x", slug: "anime", seasonId: "s1" }, ""), null);
});
