/**
 * Certains FAI bloquent des domaines au niveau DNS : résolution via Cloudflare (IP littérale),
 * avec repli sur le système. Seule la résolution passe par Cloudflare, le TLS est direct.
 */
import http from "http";
import https from "https";
import net from "net";
import dns from "dns";
import nodeFetch from "node-fetch";

const DOH_ENDPOINTS = [
  "https://1.1.1.1/dns-query",
  "https://1.0.0.1/dns-query",
];
const CACHE_TTL_MS = 5 * 60 * 1000; // les TTL DNS réels sont ignorés
const DOH_TIMEOUT_MS = 5000;

/** @type {Map<string, {addrs: {address:string,family:number}[], expires:number}>} */
const _cache = new Map();
/** @type {Map<string, Promise<{address:string,family:number}[]>>} dédup en vol */
const _inflight = new Map();

/** A = 1, AAAA = 28 */
async function queryDoh(hostname, type) {
  const rrType = type === "AAAA" ? 28 : 1;
  for (const ep of DOH_ENDPOINTS) {
    try {
      const res = await nodeFetch(
        `${ep}?name=${encodeURIComponent(hostname)}&type=${type}`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(DOH_TIMEOUT_MS),
        }
      );
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const answers = (data?.Answer || []).filter((a) => a.type === rrType);
      const addrs = answers
        .map((a) => a.data)
        .filter((ip) => net.isIP(ip) === (rrType === 28 ? 6 : 4));
      if (addrs.length) return addrs;
    } catch {
    }
  }
  return [];
}

async function resolveHost(hostname, family) {
  const key = `${hostname}|${family}`;
  const cached = _cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.addrs;
  if (_inflight.has(key)) return _inflight.get(key);

  const p = (async () => {
    let addrs = [];
    // AAAA d'abord si IPv6 est demandé, sinon A avec AAAA en repli.
    if (family === 6) {
      addrs = (await queryDoh(hostname, "AAAA")).map((a) => ({ address: a, family: 6 }));
    } else {
      addrs = (await queryDoh(hostname, "A")).map((a) => ({ address: a, family: 4 }));
      if (addrs.length === 0 && family !== 4) {
        addrs = (await queryDoh(hostname, "AAAA")).map((a) => ({ address: a, family: 6 }));
      }
    }
    if (addrs.length) {
      const entry = { addrs, expires: Date.now() + CACHE_TTL_MS };
      _cache.set(key, entry);
      // Une réponse IPv4 sert aussi la demande « indifférent ».
      if (addrs[0].family === 4) {
        _cache.set(`${hostname}|0`, entry);
        _cache.set(`${hostname}|4`, entry);
      }
    }
    return addrs;
  })().finally(() => _inflight.delete(key));

  _inflight.set(key, p);
  return p;
}

/** Même signature que `dns.lookup`, pour l'option `lookup` d'un socket. */
export function dohLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  options = options || {};

  const literal = net.isIP(hostname);
  if (literal) {
    const family = literal;
    if (options.all) return callback(null, [{ address: hostname, family }]);
    return callback(null, hostname, family);
  }

  resolveHost(hostname, options.family || 0)
    .then((addrs) => {
      if (!addrs || addrs.length === 0) {
        // DoH muet : résolveur système.
        return dns.lookup(hostname, options, callback);
      }
      if (options.all) return callback(null, addrs);
      return callback(null, addrs[0].address, addrs[0].family);
    })
    .catch(() => dns.lookup(hostname, options, callback));
}

// `createConnection` est le point fiable où `lookup` atteint net/tls.connect.

export function createDohHttpsAgent(opts = {}) {
  return new (class extends https.Agent {
    createConnection(options, callback) {
      return super.createConnection({ ...options, lookup: dohLookup }, callback);
    }
  })(opts);
}

export function createDohHttpAgent(opts = {}) {
  return new (class extends http.Agent {
    createConnection(options, callback) {
      return super.createConnection({ ...options, lookup: dohLookup }, callback);
    }
  })(opts);
}
