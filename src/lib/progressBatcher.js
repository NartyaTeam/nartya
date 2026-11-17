/**
 * Regroupe les écritures de progression : la dernière position d'un épisode remplace les
 * précédentes encore en attente, et tout part en un seul envoi (par lots) plutôt qu'une requête
 * par sauvegarde. Les envois sont en série : une position plus ancienne ne peut pas arriver
 * après une plus récente.
 *
 * `send(entries)` renvoie true si le lot est enregistré. `onSettled(entries, ok)` suit chaque lot.
 */
export function createProgressBatcher({ send, onSettled = () => {}, delayMs = 1000, chunkSize = 50 }) {
  const queue = new Map();
  let timer = null;
  let timerAt = Infinity;
  let chain = Promise.resolve();

  const drain = () => {
    clearTimeout(timer);
    timer = null;
    timerAt = Infinity;
    if (queue.size === 0) return chain;
    const entries = [...queue.values()];
    queue.clear();
    chain = chain.then(async () => {
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        let ok = false;
        try {
          ok = !!(await send(chunk));
        } catch {
          ok = false;
        }
        onSettled(chunk, ok);
      }
    });
    return chain;
  };

  return {
    /** `delay` plus court = envoi plus tôt (fermeture de page) ; un envoi déjà prévu plus tôt est conservé. */
    add(key, entry, { delay = delayMs } = {}) {
      queue.set(key, entry);
      const at = Date.now() + delay;
      if (timer !== null && timerAt <= at) return;
      clearTimeout(timer);
      timerAt = at;
      timer = setTimeout(drain, delay);
    },
    /** Envoie tout de suite ; résolu quand les lots sont partis. */
    flush: drain,
    get size() {
      return queue.size;
    },
  };
}
