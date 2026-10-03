/** Ne jamais comparer en chaînes : "1.9.0" > "1.19.0" en lexicographique. */

/** « v1.22.0-beta.2 » → [1, 22, 0, 2]. */
function parseVersion(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split(/[.\-+]/)
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
}

/** @returns {number} <0 si a < b, 0 si égales, >0 si a > b */
export function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const diff = (va[i] ?? 0) - (vb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function isUsableVersion(value) {
  return /^v?\d+(\.\d+)*$/i.test(String(value || "").trim());
}
