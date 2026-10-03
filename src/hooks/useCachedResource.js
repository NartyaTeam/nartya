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

function readPersisted(key, maxAgeMs) {
  if (!key || typeof localStorage === "undefined") return null;
  try {
    const saved = JSON.parse(localStorage.getItem(`${PERSIST_PREFIX}${key}`));
    if (!saved?.data || !saved.ts || Date.now() - saved.ts > maxAgeMs) return null;
    // Valeur lue sur disque : servie tout de suite mais marquée périmée.
    return { data: saved.data, ts: 0 };
  } catch {
    return null;
  }
}

function writePersisted(key, data) {
  if (!key || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${PERSIST_PREFIX}${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // quota plein ou stockage indisponible : le cache mémoire suffit
  }
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

/** Même cache, hors composant. */
export async function getOrFetch(key, fetcher, ttlMs = 5 * 60 * 1000, options = {}) {
  if (!key) return fetcher();
  const persist = options.persist === true;
  const persistentMaxAgeMs = options.persistentMaxAgeMs || 7 * 24 * 60 * 60 * 1000;
  const entry = store.get(key) || (persist ? readPersisted(key, persistentMaxAgeMs) : null);
  if (entry && !store.has(key)) store.set(key, entry);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return fetchShared(key, fetcher, { persist, fallback: entry?.data });
}

export function useCachedResource(key, fetcher, ttlMs = 5 * 60 * 1000, options = {}) {
  const persist = options.persist === true;
  const persistentMaxAgeMs = options.persistentMaxAgeMs || 7 * 24 * 60 * 60 * 1000;
  const cached = key
    ? store.get(key) || (persist ? readPersisted(key, persistentMaxAgeMs) : null)
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
    const entry = store.get(key) || (persist ? readPersisted(key, persistentMaxAgeMs) : null);
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
