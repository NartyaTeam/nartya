/** Module pur, testable sous Node. */

/**
 * Mono-plage : « bytes=100-199 », « bytes=100- », « bytes=-500 ».
 * @returns {{start:number,end:number}|null} bornes inclusives
 */
export function parseByteRange(rangeHeader, totalSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || "").trim());
  if (!match || !Number.isFinite(totalSize) || totalSize <= 0) return null;

  const [, rawStart, rawEnd] = match;
  let start;
  let end;
  if (rawStart === "") {
    // Les N derniers octets.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? totalSize - 1 : Math.min(Number(rawEnd), totalSize - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= totalSize) return null;
  return { start, end };
}

/**
 * Pour un hôte qui ignore `Range` et répond 200 : découpe sans bufferiser, coût proportionnel
 * à l'offset.
 */
export function sliceUpstream(upstream, start, end) {
  return {
    destroy: () => {
      try {
        upstream.destroy?.();
      } catch (_) {}
    },
    async *[Symbol.asyncIterator]() {
      let offset = 0; // position dans le fichier complet
      for await (const chunk of upstream) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const chunkStart = offset;
        offset += buf.length;
        if (offset <= start) continue;
        const from = Math.max(0, start - chunkStart);
        const to = Math.min(buf.length, end - chunkStart + 1);
        if (to > from) yield buf.subarray(from, to);
        if (offset > end) break;
      }
    },
  };
}
