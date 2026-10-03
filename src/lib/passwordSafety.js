/**
 * k-anonymat : seuls les 5 premiers caractères du SHA-1 partent, la comparaison est locale.
 * Toute panne renvoie `null` et laisse passer l'inscription.
 */

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";

async function sha1Hex(text) {
  const buf = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** @returns {Promise<number|null>} 0 = jamais vu, >0 = compromis, null = vérification impossible. */
export async function countPasswordLeaks(password) {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const res = await fetch(HIBP_RANGE_URL + prefix, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return null;

    for (const line of (await res.text()).split("\n")) {
      const [s, count] = line.trim().split(":");
      // Les entrées de bourrage (`Add-Padding`) ont un compte à 0.
      if (s === suffix) return parseInt(count, 10) || 0;
    }
    return 0;
  } catch (e) {
    console.warn("[hibp] vérification impossible:", e?.message || e);
    return null;
  }
}
