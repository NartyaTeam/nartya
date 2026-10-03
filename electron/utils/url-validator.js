/**
 * Allowlist d'hôtes pour les pages d'embed (tirée de la recette) ; IP privées ou réservées
 * refusées pour les CDN.
 */

import { isIP } from "net";
import path from "path";
import { dohLookup } from "./doh-resolver.js";
import { isAllowedEmbedHost } from "./source-recipe.js";

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
  /^fe80:/i,
];

function isPrivateIP(ip) {
  if (!ip) return true;
  return PRIVATE_IP_RANGES.some((r) => r.test(ip));
}

/** Valider et requêter doivent voir la même adresse. */
function dnsLookup(hostname) {
  return new Promise((resolve, reject) => {
    dohLookup(hostname, { family: 0, all: true }, (err, addresses) => {
      if (err) return reject(err);
      resolve(addresses);
    });
  });
}

/** @returns {{ valid: boolean, error?: string }} */
export function validateEmbedUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Protocole non autorisé" };
    }
    const hostname = parsed.hostname.toLowerCase();
    // Sans recette, aucun hôte n'est autorisé.
    if (!isAllowedEmbedHost(hostname)) {
      return { valid: false, error: `Hostname non autorisé : ${hostname}` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "URL invalide" };
  }
}

/** @returns {Promise<{ valid: boolean, error?: string }>} */
export async function validateExternalUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Protocole non autorisé" };
    }

    const hostname = parsed.hostname;

    if (isIP(hostname)) {
      if (isPrivateIP(hostname)) {
        return { valid: false, error: "IP privée/réservée interdite" };
      }
      return { valid: true };
    }

    const addresses = await dnsLookup(hostname);
    for (const entry of addresses) {
      if (isPrivateIP(entry.address)) {
        return {
          valid: false,
          error: `Le hostname ${hostname} résout vers une IP privée (${entry.address})`,
        };
      }
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message || "Erreur de validation URL" };
  }
}

/** Évite le piège du préfixe sans séparateur (base/ vs base2/). */
export function isPathSafe(filePath, baseDir) {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir) + path.sep;
  return (
    resolvedPath.startsWith(resolvedBase) ||
    resolvedPath === resolvedBase.slice(0, -1)
  );
}

/** `startsWith("http")` laisserait passer `httpxyz:`. */
export function isHttpUrl(urlString) {
  if (typeof urlString !== "string") return false;
  try {
    const protocol = new URL(urlString).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
