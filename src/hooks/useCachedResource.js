import { useEffect, useState } from "react";

/** « Stale-while-revalidate », partagé entre les montages. */
const store = new Map();
const inflight = new Map();
const MAX_CACHE_ENTRIES = 100;
let cacheGeneration = 0;
const PERSIST_PREFIX = "nartya:resource-cache:";

function writeCache(key, data) {
  // Réinsérer la clé la place en fin de Map : l'éviction retire les plus anciennes.
  store.delete(key);
  store.set(key, { data, ts: Date.now() });
  while (store.size > MAX_CACHE_ENTRIES) {
    store.delete(store.keys().next().value);
  }
}

function readPersisted(key, maxAgeMs, trust = false) {
  if (!key || typeof localStorage === "undefined") return null;
  try {
    const saved = JSON.parse(localStorage.getItem(`${PERSIST_PREFIX}${key}`));
    if (!saved?.data || !saved.ts || Date.now() - saved.ts > maxAgeMs) return null;
    // Valeur lue sur disque : servie tout de suite mais marquée périmée.
    return { data: saved.data, ts: trust ? saved.ts : 0 };
  } catch {
    return null;
  }
}

// Le disque ne doit pas grossir sans fin : un index (clé → date, taille) permet d'écarter les
// plus anciennes entrées. Les listes d'épisodes pèsent jusqu'à ~120 Ko.
const INDEX_KEY = `${PERSIST_PREFIX}__index`;
const MAX_PERSISTED_ENTRIES = 80;
const MAX_PERSISTED_CHARS = 4_000_000;

function readIndex() {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY)) || {};
  } catch {
    return {};
  }
}

function writeIndex(index) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // l'index se reconstruit au prochain enregistrement
  }
}

/** Retire les plus anciennes entrées jusqu'à tenir dans les bornes ; `keep` n'est jamais retirée. */
function pruneIndex(index, keep) {
  const byAge = Object.entries(index).sort((a, b) => a[1].t - b[1].t);
  let total = byAge.reduce((sum, [, entry]) => sum + entry.n, 0);
  let count = byAge.length;
  for (const [key, entry] of byAge) {
    if (count <= MAX_PERSISTED_ENTRIES && total <= MAX_PERSISTED_CHARS) break;
    if (key === keep) continue;
    try {
      localStorage.removeItem(`${PERSIST_PREFIX}${key}`);
    } catch {
      // best-effort
    }
    delete index[key];
    total -= entry.n;
    count -= 1;
  }
}

function writePersisted(key, data) {
  if (!key || typeof localStorage === "undefined") return;
  const raw = JSON.stringify({ data, ts: Date.now() });
  const index = readIndex();
  index[key] = { t: Date.now(), n: raw.length };
  pruneIndex(index, key);
  try {
    localStorage.setItem(`${PERSIST_PREFIX}${key}`, raw);
  } catch {
    // Quota plein : on libère la moitié des entrées les plus anciennes, puis on retente une fois.
    const byAge = Object.entries(index)
      .filter(([k]) => k !== key)
      .sort((a, b) => a[1].t - b[1].t);
    for (const [old] of byAge.slice(0, Math.ceil(byAge.length / 2))) {
      try {
        localStorage.removeItem(`${PERSIST_PREFIX}${old}`);
      } catch {
        // best-effort
      }
      delete index[old];
    }
    try {
      localStorage.setItem(`${PERSIST_PREFIX}${key}`, raw);
    } catch {
      delete index[key]; // le cache mémoire suffit
    }
  }
  writeIndex(index);
}

function removePersisted(prefix) {
  if (!prefix || typeof localStorage === "undefined") return;
  try {
    const storagePrefix = `${PERSIST_PREFIX}${prefix}`;
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(storagePrefix)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
    const index = readIndex();
    for (const key of Object.keys(index)) if (key.startsWith(prefix)) delete index[key];
    writeIndex(index);
  } catch {
    // best-effort
  }
}

function fetchShared(key, fetcher, { persist = false, fallback } = {}) {
  if (inflight.has(key)) return inflight.get(key);
  const generation = cacheGeneration;
  const request = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      if (generation === cacheGeneration) {
        writeCache(key, data);
        if (persist) writePersisted(key, data);
      }
      return data;
    })
    .catch((error) => {
      if (fallback !== undefined) return fallback;
      throw error;
    })
    .finally(() => {
      if (inflight.get(key) === request) inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}

const listeners = new Set();
const keyedListeners = new Map();

/** Force les hooks montés à recharger (retour de connexion). */
export function revalidateAll() {
  cacheGeneration += 1;
  store.clear();
  inflight.clear();
  for (const fn of listeners) fn();
}

export function invalidateCache(prefix) {
  if (!prefix) return;
  cacheGeneration += 1;
  const affected = [];
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      affected.push(key);
    }
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
  for (const [key, callbacks] of keyedListeners) {
    if (key.startsWith(prefix) || affected.includes(key)) {
      for (const fn of callbacks) fn();
    }
  }
  removePersisted(prefix);
}

/** Le prochain montage sert l'ancienne valeur puis revalide. */
export function expireCache(prefix) {
  if (!prefix) return;
  for (const [key, entry] of store) {
    if (key.startsWith(prefix)) store.set(key, { ...entry, ts: 0 });
  }
}

/**
 * Relit tout de suite cette clé, sans vider l'écran : la valeur connue reste affichée, la fraîche
 * la remplace à son arrivée. Pour une donnée servie « incomplète » par le serveur.
 */
export function revalidateKey(key) {
  if (!key) return;
  const entry = store.get(key);
  if (entry) store.set(key, { ...entry, ts: 0 });
  for (const fn of keyedListeners.get(key) || []) fn();
}

/** Même cache, hors composant. */
export async function getOrFetch(key, fetcher, ttlMs = 5 * 60 * 1000, options = {}) {
  if (!key) return fetcher();
  const persist = options.persist === true;
  const persistentMaxAgeMs = options.persistentMaxAgeMs || 7 * 24 * 60 * 60 * 1000;
  const entry = store.get(key) || (persist ? readPersisted(key, persistentMaxAgeMs, options.trustPersisted === true) : null);
  if (entry && !store.has(key)) store.set(key, entry);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return fetchShared(key, fetcher, { persist, fallback: entry?.data });
}

export function useCachedResource(key, fetcher, ttlMs = 5 * 60 * 1000, options = {}) {
  const persist = options.persist === true;
  const persistentMaxAgeMs = options.persistentMaxAgeMs || 7 * 24 * 60 * 60 * 1000;
  const cached = key
    ? store.get(key) || (persist ? readPersisted(key, persistentMaxAgeMs, options.trustPersisted === true) : null)
    : null;
  if (key && cached && !store.has(key)) store.set(key, cached);
  const [data, setData] = useState(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    listeners.add(bump);
    if (key) {
      if (!keyedListeners.has(key)) keyedListeners.set(key, new Set());
      keyedListeners.get(key).add(bump);
    }
    return () => {
      listeners.delete(bump);
      if (key) {
        keyedListeners.get(key)?.delete(bump);
        if (!keyedListeners.get(key)?.size) keyedListeners.delete(key);
      }
    };
  }, [key]);

  useEffect(() => {
    if (!key) {
      setData(null);
      setLoading(false);
      return;
    }
    let alive = true;
    const entry = store.get(key) || (persist ? readPersisted(key, persistentMaxAgeMs, options.trustPersisted === true) : null);
    if (entry && !store.has(key)) store.set(key, entry);

    if (entry) {
      setData(entry.data);
      setLoading(false);
    } else {
      setData(null);
      setLoading(true);
      setError(false);
    }

    const fresh = entry && Date.now() - entry.ts < ttlMs;
    if (!fresh) {
      fetchShared(key, fetcher, { persist, fallback: entry?.data })
        .then((d) => {
          if (!alive) return;
          setData(d);
          setLoading(false);
          setError(false);
        })
        .catch(() => {
          if (!alive) return;
          if (!entry) setError(true);
          setLoading(false);
        });
    }

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, persist, persistentMaxAgeMs]);

  return { data, loading, error };
}
