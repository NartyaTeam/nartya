/**
 * Le lecteur reçoit `/video/proxy?h=<poignée>`, sans extension : le marqueur `kind=hls`
 * qualifie le flux.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { isHlsUrl } from "../src/utils/hlsDetect.js";

test("une poignée qualifiée hls est reconnue, une poignée nue ne l'est pas", () => {
  assert.equal(isHlsUrl("http://127.0.0.1:5000/video/proxy?h=abc123&kind=hls"), true);
  // Sans le marqueur, rien dans l'URL ne dit que c'est du HLS.
  assert.equal(isHlsUrl("http://127.0.0.1:5000/video/proxy?h=abc123"), false);
});

test("les formes historiques restent reconnues", () => {
  assert.equal(
    isHlsUrl("http://127.0.0.1:5000/video/proxy?url=https%3A%2F%2Fcdn.test%2Fmaster.m3u8"),
    true
  );
  assert.equal(isHlsUrl("https://cdn.test/master.m3u8"), true);
  assert.equal(isHlsUrl("https://cdn.test/video.mp4"), false);
});

test("entrées vides : jamais d'exception", () => {
  for (const v of [null, undefined, "", 42, {}]) assert.equal(isHlsUrl(v), false);
});
