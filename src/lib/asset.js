/**
 * Relative à index.html : en `file://` (ancienne coque packagée), un chemin absolu pointerait vers
 * la racine du disque.
 */
export function asset(name) {
  return `${import.meta.env.BASE_URL}${String(name).replace(/^\/+/, "")}`;
}
