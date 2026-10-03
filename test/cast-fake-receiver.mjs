/**
 * Faux Chromecast : annonce `_googlecast._tcp` en mDNS, répond au protocole Cast, puis va
 * chercher la vidéo comme une TV. Requiert openssl.
 * node test/cast-fake-receiver.mjs [--mode=complete|split|ptr-only] [--name="TV de test"]
 * [--port=8010] [--ip=192.168.1.20] [--no-fetch] [--reject-mp4]
 * `split` : un paquet par enregistrement ; `ptr-only` : le nom seul ; `--reject-mp4` : vidéo
 * récupérée mais refusée.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import mdns from "multicast-dns";
import castv2 from "castv2";
import { localAddressFor } from "../electron/utils/lan-address.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  })
);
const MODE = args.mode || "complete";
const PORT = Number(args.port) || 8010;
const IP = args.ip || localAddressFor("192.168.1.1");
const FRIENDLY = args.name || `TV de test (${MODE})`;

const SERVICE = "_googlecast._tcp.local";
const uuid = crypto.randomBytes(16).toString("hex");
const INSTANCE = `Fake-Chromecast-${uuid}.${SERVICE}`;
const TARGET = `${uuid}.local`;

const NS = {
  connection: "urn:x-cast:com.google.cast.tp.connection",
  heartbeat: "urn:x-cast:com.google.cast.tp.heartbeat",
  receiver: "urn:x-cast:com.google.cast.receiver",
  media: "urn:x-cast:com.google.cast.media",
};

// mDNS

const records = {
  PTR: { name: SERVICE, type: "PTR", ttl: 120, data: INSTANCE },
  TXT: { name: INSTANCE, type: "TXT", ttl: 120, data: [`id=${uuid}`, "md=Chromecast", `fn=${FRIENDLY}`, "ca=4101"] },
  SRV: { name: INSTANCE, type: "SRV", ttl: 120, data: { port: PORT, target: TARGET, priority: 0, weight: 0 } },
  A: { name: TARGET, type: "A", ttl: 120, data: IP },
};

const responder = mdns();
responder.on("query", (query, rinfo) => {
  // Question depuis un autre port que 5353 : réponse unicast (RFC 6762 §6.7).
  const to = rinfo.port === 5353 ? undefined : { port: rinfo.port, address: rinfo.address };
  const reply = (answers, additionals = []) =>
    responder.respond({ id: query.id, questions: to ? query.questions : [], answers, additionals }, to);

  for (const q of query.questions || []) {
    const name = String(q.name).toLowerCase();
    if (name === SERVICE && (q.type === "PTR" || q.type === "ANY")) {
      console.log(`[mDNS] question PTR de ${rinfo.address}:${rinfo.port} → réponse ${MODE}`);
      if (MODE === "complete") reply([records.PTR], [records.TXT, records.SRV, records.A]);
      else if (MODE === "split") {
        reply([records.PTR]);
        setTimeout(() => reply([records.TXT]), 80);
        setTimeout(() => reply([records.SRV]), 160);
        setTimeout(() => reply([records.A]), 240);
      } else reply([records.PTR]);
    } else if (name === INSTANCE.toLowerCase() && (q.type === "SRV" || q.type === "TXT")) {
      console.log(`[mDNS] relance ${q.type} de ${rinfo.address}`);
      reply([records[q.type]]);
    } else if (name === TARGET && q.type === "A") {
      console.log(`[mDNS] relance A de ${rinfo.address}`);
      reply([records.A]);
    }
  }
});

// Protocole Cast

/** Sinon celui livré avec Git pour Windows. */
function findOpenssl() {
  const candidates = ["openssl"];
  for (const root of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs")]) {
    if (!root) continue;
    candidates.push(path.join(root, "Git", "usr", "bin", "openssl.exe"), path.join(root, "Git", "mingw64", "bin", "openssl.exe"));
  }
  for (const bin of candidates) {
    try {
      execFileSync(bin, ["version"], { stdio: "ignore" });
      return bin;
    } catch {
    }
  }
  console.error("openssl introuvable : installe Git pour Windows (il le fournit) ou ajoute openssl au PATH.");
  process.exit(1);
}

const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-cast-"));
execFileSync(findOpenssl(), [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=fake-cast",
  "-keyout", path.join(certDir, "key.pem"), "-out", path.join(certDir, "cert.pem"),
], { stdio: "ignore" });

const server = new castv2.Server({
  key: fs.readFileSync(path.join(certDir, "key.pem")),
  cert: fs.readFileSync(path.join(certDir, "cert.pem")),
});

const APP = {
  appId: "CC1AD845",
  displayName: "Default Media Receiver",
  sessionId: "fake-session",
  transportId: "fake-transport",
  namespaces: [{ name: NS.media }],
};
let launched = false;
let media = null;
let playerState = "IDLE";
let volume = { level: 1, muted: false };

// Comme une vraie TV : la position avance sans diffusion de statut.
const DURATION = 1440;
let clockAt = Date.now();
const position = () => {
  if (!media) return 0;
  const t = media.currentTime + (playerState === "PLAYING" ? (Date.now() - clockAt) / 1000 : 0);
  return Math.min(DURATION, t);
};
const setPosition = (t) => {
  if (media) media.currentTime = Math.max(0, Math.min(DURATION, Number(t) || 0));
  clockAt = Date.now();
};

const send = (clientId, from, to, ns, payload) => server.send(clientId, from, to, ns, JSON.stringify(payload));
const receiverStatus = (requestId) => ({
  type: "RECEIVER_STATUS",
  requestId,
  status: { applications: launched ? [APP] : [], volume },
});
const mediaStatus = (requestId) => ({
  type: "MEDIA_STATUS",
  requestId,
  status: media
    ? [{ mediaSessionId: 1, playerState, currentTime: position(), media: { contentId: media.contentId, duration: DURATION }, volume: { level: 1, muted: false } }]
    : [],
});

server.on("message", async (clientId, sourceId, destinationId, namespace, raw) => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (namespace === NS.heartbeat && data.type === "PING") {
    return send(clientId, destinationId, sourceId, NS.heartbeat, { type: "PONG" });
  }
  if (namespace === NS.receiver) {
    if (data.type === "LAUNCH") {
      console.log(`[Cast] LAUNCH ${data.appId}`);
      launched = true;
    }
    if (data.type === "STOP") launched = false;
    if (data.type === "SET_VOLUME") {
      volume = { ...volume, ...data.volume };
      console.log(`[Cast] volume ${Math.round(volume.level * 100)}%${volume.muted ? " (muet)" : ""}`);
    }
    return send(clientId, "receiver-0", sourceId, NS.receiver, receiverStatus(data.requestId));
  }
  if (namespace === NS.media) {
    if (data.type === "LOAD") {
      console.log(`[Cast] LOAD ${data.media?.contentType} à ${data.currentTime}s → ${data.media?.contentId}`);
      // TV qui ne peut pas joindre le PC (pare-feu).
      let ok = args["no-fetch"] ? false : await fetchLikeATv(data.media?.contentId);
      if (ok && args["reject-mp4"] && data.media?.contentType === "video/mp4") {
        console.log("  lecture refusée (--reject-mp4)");
        ok = false;
      }
      if (!ok) return send(clientId, APP.transportId, sourceId, NS.media, { type: "LOAD_FAILED", requestId: data.requestId });
      media = { contentId: data.media.contentId, currentTime: 0 };
      setPosition(data.currentTime);
      playerState = "PLAYING";
    } else if (data.type === "PAUSE") {
      setPosition(position());
      playerState = "PAUSED";
    } else if (data.type === "PLAY") {
      setPosition(position());
      playerState = "PLAYING";
    } else if (data.type === "SEEK" && media) {
      console.log(`[Cast] SEEK ${Math.round(data.currentTime)}s`);
      setPosition(data.currentTime);
    }
    return send(clientId, APP.transportId, sourceId, NS.media, mediaStatus(data.requestId));
  }
});

/**
 * Playlist → variante → premier segment. Un fichier n'est jamais lu en entier : le début,
 * puis une plage plus loin.
 */
async function fetchLikeATv(url, depth = 0) {
  const pad = "  ".repeat(depth + 1);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const type = res.headers.get("content-type") || "";
    const cors = res.headers.get("access-control-allow-origin");
    const size = Number(res.headers.get("content-length")) || 0;
    const reader = res.body.getReader();
    const { value: first = new Uint8Array() } = await reader.read();
    const head = Buffer.from(first).subarray(0, 64).toString();
    const isPlaylist = type.includes("mpegurl") || head.startsWith("#EXTM3U");

    if (!isPlaylist) {
      reader.cancel().catch(() => {});
      console.log(`${pad}GET ${res.status} ${type || "?"} ${size ? `${(size / 1e6).toFixed(1)} Mo` : "taille ?"}, CORS=${cors || "absent"}`);
      if (!res.ok) return false;
      if (depth === 0) return checkRange(url, size, pad);
      return true;
    }

    const chunks = [first];
    for (let r; !(r = await reader.read()).done; ) chunks.push(r.value);
    const body = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    console.log(`${pad}GET ${res.status} ${type || "?"} ${body.length} octets, CORS=${cors || "absent"}`);
    if (!res.ok) return false;
    if (depth >= 3) return true;
    const next = body.toString().split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
    if (!next) return true;
    return fetchLikeATv(new URL(next, url).toString(), depth + 1);
  } catch (e) {
    console.log(`${pad}ÉCHEC ${e.cause?.code || e.message}`);
    return false;
  }
}

/** Sans 206, la TV ne pourrait pas avancer dans la vidéo. */
async function checkRange(url, size, pad) {
  const from = size ? Math.floor(size / 2) : 1_000_000;
  try {
    const res = await fetch(url, { headers: { Range: `bytes=${from}-${from + 65535}` }, signal: AbortSignal.timeout(15_000) });
    res.body?.cancel().catch(() => {});
    const ok = res.status === 206;
    console.log(`${pad}Range ${from} → ${res.status} ${res.headers.get("content-range") || ""}${ok ? "" : " (seek impossible)"}`);
    return res.ok;
  } catch (e) {
    console.log(`${pad}Range ÉCHEC ${e.cause?.code || e.message}`);
    return false;
  }
}

// Une déconnexion brutale de l'app ne doit pas faire tomber le faux récepteur.
server.server.on("secureConnection", (socket) => socket.on("error", () => {}));
server.on("error", (e) => console.log("[Cast] erreur serveur :", e.message));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Faux Chromecast « ${FRIENDLY} » sur ${IP}:${PORT} (mode ${MODE}). Ctrl+C pour arrêter.`);
});
process.on("SIGINT", () => {
  responder.destroy();
  server.close();
  fs.rmSync(certDir, { recursive: true, force: true });
  process.exit(0);
});
