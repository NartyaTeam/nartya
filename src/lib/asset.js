/**
 * Relative à index.html : en `file://` (Electron packagé), un chemin absolu pointerait vers
 * la racine du disque.
 */
export function asset(name) {
  return `${import.meta.env.BASE_URL}${String(name).replace(/^\/+/, "")}`;
}
