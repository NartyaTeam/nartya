/**
 * Comme `Promise.all(items.map(fn))`, mais au plus `limit` appels en cours à la fois : une liste
 * de 60 animes ne devient plus 60 requêtes simultanées. Les résultats gardent l'ordre des éléments.
 * Une erreur de `fn` rejette le tout, comme `Promise.all` ; l'appelant qui veut continuer attrape
 * dans `fn`.
 */
export async function mapLimit(items, limit, fn) {
  const list = Array.from(items);
  const results = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
    }
  };
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, list.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

/**
 * Listes d'épisodes demandées en lot (historique, profil) : l'API limite le débit par IP, et une
 * rafale de dizaines de requêtes d'un coup était refusée.
 */
export const EPISODES_FETCH_CONCURRENCY = 3;
