/** L'appareil va chercher la vidéo lui-même, sur le listener LAN du proxy local. */
import dgram from "dgram";
import tls from "tls";
import mdns from "multicast-dns";
import dnsPacket from "dns-packet";
import { Client, DefaultMediaReceiver } from "castv2-client";
import localProxyServer from "./local-proxy-server.js";
import { lanInterfaces, isPrivateIpv4, isVirtualNetworkAddress } from "./lan-address.js";
import { getFirewallStatus } from "./firewall-check.js";

const CAST_SERVICE = "_googlecast._tcp.local";
const MDNS_GROUP = "224.0.0.251";
const MDNS_PORT = 5353;
const DEFAULT_CAST_PORT = 8009;

const DEVICE_TTL_MS = 60_000;
const REQUERY_MS = 10_000;
const FOLLOW_UP_MIN_GAP_MS = 2_000;
// Sans nouvel appel ni session active, l'écoute est coupée.
const DISCOVERY_IDLE_MS = 3 * 60_000;
const CONNECT_TIMEOUT_MS = 8_000;
const LOAD_TIMEOUT_MS = 30_000;

let sendDevices = () => {};
let session = null;
let sendStatus = () => {};

// Découverte. Beaucoup d'appareils répartissent PTR, SRV, TXT et A sur plusieurs paquets :
// on garde chaque enregistrement, on redemande le manquant, et on retombe sur l'adresse source
// quand le A n'arrive pas.

let discovering = false;
let listener = null; // socket mDNS partagé (5353)
let querySockets = []; // un socket par carte réseau (RFC 6762 §6.7)
let requeryTimer = null;
let idleTimer = null;
let warmupTimers = [];

const records = {
  instances: new Map(),
  srv: new Map(),
  txt: new Map(),
  addresses: new Map(),
  lastFollowUp: new Map(),
};
const devices = new Map();
const diagnostics = { listenerError: null, interfaces: [], packets: 0, castAnswers: 0 };

const lower = (s) => String(s || "").toLowerCase();
const isCastName = (name) => lower(name).endsWith(`.${CAST_SERVICE}`);

function publicDevice(d) {
  return { id: d.id, name: d.name, host: d.host, manual: !!d.manual };
}

function pushDevices() {
  sendDevices([...devices.values()].map(publicDevice));
}

/** « Chromecast-Ultra-3f2a…c91 » → « Chromecast Ultra » quand le TXT `fn` manque. */
function prettyInstance(instance) {
  return instance
    .replace(/-[0-9a-f]{16,}$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function parseTxt(data) {
  const out = {};
  for (const entry of [].concat(data || [])) {
    const s = Buffer.isBuffer(entry) ? entry.toString() : String(entry);
    const eq = s.indexOf("=");
    if (eq > 0) out[s.slice(0, eq)] = s.slice(eq + 1);
  }
  return { id: out.id || null, fn: out.fn || null };
}

function ingest(packet, rinfo) {
  diagnostics.packets++;
  const all = [...(packet.answers || []), ...(packet.additionals || []), ...(packet.authorities || [])];
  const touched = new Set();
  const source = isPrivateIpv4(rinfo?.address) ? rinfo.address : null;
  let addressesChanged = false;

  for (const r of all) {
    const name = lower(r.name);
    if (r.type === "PTR" && name === CAST_SERVICE && isCastName(r.data)) {
      const key = lower(r.data);
      records.instances.set(key, { ...records.instances.get(key), name: r.data });
      touched.add(key);
    } else if (r.type === "SRV" && isCastName(name)) {
      records.srv.set(name, { target: lower(r.data?.target), port: r.data?.port || DEFAULT_CAST_PORT });
      touched.add(name);
    } else if (r.type === "TXT" && isCastName(name)) {
      records.txt.set(name, parseTxt(r.data));
      touched.add(name);
    } else if (r.type === "A" && typeof r.data === "string" && records.addresses.get(name) !== r.data) {
      records.addresses.set(name, r.data);
      addressesChanged = true;
    }
  }
  if (!touched.size && !addressesChanged) return;
  if (touched.size) diagnostics.castAnswers++;

  for (const key of touched) {
    const known = records.instances.get(key);
    // Une carte réelle l'emporte sur une carte virtuelle (WSL, VPN…).
    const keepKnown = known?.source && (!source || isVirtualNetworkAddress(source));
    records.instances.set(key, {
      name: known?.name || key,
      lastSeen: Date.now(),
      source: keepKnown ? known.source : source || known?.source || null,
    });
  }
  let changed = false;
  for (const key of records.instances.keys()) changed = resolveDevice(key) || changed;
  if (changed) pushDevices();
}

/** Dès qu'on sait le joindre. Vrai si modifié. */
function resolveDevice(key) {
  const instance = records.instances.get(key);
  const srv = records.srv.get(key);
  const txt = records.txt.get(key);
  const host = (srv && records.addresses.get(srv.target)) || instance.source;

  if (!srv || !txt || (srv && !records.addresses.get(srv.target))) followUp(key, srv);
  if (!host) return false;

  const previous = devices.get(key);
  const label = instance.name.slice(0, -(CAST_SERVICE.length + 1));
  const device = {
    id: key,
    name: txt?.fn || prettyInstance(label) || host,
    host,
    port: srv?.port || DEFAULT_CAST_PORT,
    lastSeen: instance.lastSeen,
  };
  devices.set(key, device);
  return (
    !previous ||
    previous.name !== device.name ||
    previous.host !== device.host ||
    previous.port !== device.port
  );
}

function followUp(key, srv) {
  const last = records.lastFollowUp.get(key) || 0;
  if (Date.now() - last < FOLLOW_UP_MIN_GAP_MS) return;
  records.lastFollowUp.set(key, Date.now());
  const name = records.instances.get(key)?.name || key;
  const questions = [
    { name, type: "SRV" },
    { name, type: "TXT" },
  ];
  if (srv?.target) questions.push({ name: srv.target, type: "A" });
  sendQuery(questions);
}

function sendQuery(questions) {
  const buf = dnsPacket.encode({ type: "query", id: 0, questions });
  for (const entry of querySockets) {
    if (entry.ready) entry.socket.send(buf, MDNS_PORT, MDNS_GROUP, () => {});
  }
  if (listener) {
    try {
      listener.query({ questions });
    } catch (_) {}
  }
}

const browse = () => sendQuery([{ name: CAST_SERVICE, type: "PTR" }]);

function reapStale() {
  const now = Date.now();
  let changed = false;
  for (const [key, d] of devices) {
    if (d.manual || session?.deviceId === key) continue;
    if (now - d.lastSeen > DEVICE_TTL_MS) {
      devices.delete(key);
      records.instances.delete(key);
      changed = true;
    }
  }
  if (changed) pushDevices();
}

function openQuerySockets() {
  diagnostics.interfaces = [];
  for (const iface of lanInterfaces()) {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    socket.on("message", (msg, rinfo) => {
      try {
        ingest(dnsPacket.decode(msg), rinfo);
      } catch (_) {}
    });
    socket.on("error", (e) => {
      diagnostics.interfaces.push({ name: iface.name, address: iface.address, error: e.code || e.message });
    });
    const entry = { socket, iface, ready: false };
    socket.bind(0, iface.address, () => {
      entry.ready = true;
      try {
        socket.setMulticastInterface(iface.address);
        socket.setMulticastTTL(255);
      } catch (_) {}
      diagnostics.interfaces.push({ name: iface.name, address: iface.address, error: null });
      socket.send(dnsPacket.encode({ type: "query", id: 0, questions: [{ name: CAST_SERVICE, type: "PTR" }] }), MDNS_PORT, MDNS_GROUP, () => {});
    });
    querySockets.push(entry);
  }
}

function startDiscovery() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!session) stopDiscovery();
  }, DISCOVERY_IDLE_MS);

  if (discovering) {
    browse();
    return;
  }
  discovering = true;
  diagnostics.listenerError = null;
  diagnostics.packets = 0;
  diagnostics.castAnswers = 0;

  listener = mdns();
  listener.on("response", (packet, rinfo) => ingest(packet, rinfo));
  listener.on("error", (e) => {
    // Port 5353 déjà pris en exclusif (Bonjour…) : les sockets par carte suffisent.
    diagnostics.listenerError = e.code || e.message;
    console.warn("[Cast] Écoute mDNS 5353 indisponible :", e.message);
  });
  listener.on("warning", () => {});

  openQuerySockets();
  // Un paquet multicast se perd facilement.
  warmupTimers = [1000, 3000].map((ms) => setTimeout(browse, ms));
  requeryTimer = setInterval(() => {
    browse();
    reapStale();
  }, REQUERY_MS);
  console.log(`[Cast] Découverte démarrée (${lanInterfaces().map((i) => `${i.name}=${i.address}`).join(", ") || "aucune carte"})`);
}

function stopDiscovery() {
  if (!discovering) return;
  discovering = false;
  clearInterval(requeryTimer);
  clearTimeout(idleTimer);
  warmupTimers.forEach(clearTimeout);
  requeryTimer = idleTimer = null;
  warmupTimers = [];
  for (const { socket } of querySockets) {
    try {
      socket.close();
    } catch (_) {}
  }
  querySockets = [];
  if (listener) {
    try {
      listener.destroy();
    } catch (_) {}
    listener = null;
  }
  for (const key of devices.keys()) {
    if (!devices.get(key).manual && session?.deviceId !== key) devices.delete(key);
  }
  for (const map of Object.values(records)) map.clear();
  console.log("[Cast] Découverte arrêtée");
}

function probeCastPort(host, port) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false, timeout: CONNECT_TIMEOUT_MS });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("secureConnect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function addManualDevice(ip) {
  if (!isPrivateIpv4(ip)) return { success: false, error: "Adresse IP locale invalide (ex. 192.168.1.20)" };
  if (!(await probeCastPort(ip, DEFAULT_CAST_PORT))) {
    return { success: false, error: "Aucun appareil Cast ne répond à cette adresse." };
  }
  const key = `manual:${ip}`;
  devices.set(key, { id: key, name: `Appareil ${ip}`, host: ip, port: DEFAULT_CAST_PORT, lastSeen: Date.now(), manual: true });
  pushDevices();
  return { success: true, device: publicDevice(devices.get(key)) };
}

// Session

function emitStatus(status, extra = {}) {
  sendStatus({
    deviceId: session?.deviceId || null,
    deviceName: session ? devices.get(session.deviceId)?.name || null : null,
    playerState: status?.playerState || null,
    idleReason: status?.idleReason || null,
    currentTime: status?.currentTime ?? null,
    duration: status?.media?.duration ?? null,
    // Le volume de l'appareil vit dans RECEIVER_STATUS ; celui du média reste souvent à 1.
    volume: session?.volume?.level ?? status?.volume?.level ?? null,
    muted: session?.volume?.muted ?? status?.volume?.muted ?? null,
    ...extra,
  });
}

function onMediaStatus(st) {
  if (!st || !session) return;
  session.media = st;
  emitStatus(st);
  if (st.playerState === "IDLE" && st.idleReason === "ERROR") endSession("media-error");
}

function onVolume(vol) {
  if (!vol || !session) return;
  session.volume = vol;
  emitStatus(session.media);
}

async function endSession(reason, extra = {}) {
  if (!session) return;
  const s = session;
  session = null;
  clearInterval(s.statusTimer);
  try {
    s.client.close();
  } catch (_) {}
  emitStatus(null, { ended: true, reason: reason || "stop", ...extra });
  console.log(`[Cast] Session terminée (${reason || "stop"})`);
  localProxyServer.stopCastServer();
}

/** L'erreur porte `stage` (connect | launch | load). */
function castLoad(device, media) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let stage = "connect";
    let settled = false;
    let timer = null;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        client.close();
      } catch (_) {}
      reject(Object.assign(err || new Error("cast error"), { stage }));
    };
    const arm = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => fail(new Error(`timeout (${stage})`)), ms);
    };

    client.on("error", fail);
    arm(CONNECT_TIMEOUT_MS);

    client.connect({ host: device.host, port: device.port }, () => {
      stage = "launch";
      arm(LOAD_TIMEOUT_MS);
      client.launch(DefaultMediaReceiver, (err, player) => {
        if (err) return fail(err);
        stage = "load";

        const payload = {
          contentId: media.url,
          contentType: media.contentType || "application/vnd.apple.mpegurl",
          streamType: "BUFFERED",
          metadata: {
            type: 0,
            metadataType: 0,
            title: media.title || "Nartya",
            images: media.poster ? [{ url: media.poster }] : [],
          },
        };
        const startAt = Number(media.startAt) > 2 ? Math.floor(media.startAt) : 0;

        player.load(payload, { autoplay: true, currentTime: startAt }, (err2, status) => {
          if (err2) return fail(err2);
          if (settled) return;
          settled = true;
          clearTimeout(timer);

          client.removeListener("error", fail);
          // La lib n'enregistre pas la session média au LOAD : sans ça, un seek immédiat plante.
          if (status && !player.media.currentSession) player.media.currentSession = status;
          // L'appareil ne diffuse pas l'avancée : on sonde.
          player.on("status", onMediaStatus);
          const statusTimer = setInterval(() => player.getStatus((e, st) => !e && onMediaStatus(st)), 1000);
          client.on("status", (st) => st?.volume && onVolume(st.volume));
          client.on("error", () => endSession("error"));
          client.on("close", () => endSession("device-closed"));

          session = { client, player, deviceId: device.id, statusTimer, media: status, volume: null };
          client.getVolume((e, vol) => !e && onVolume(vol));
          emitStatus(status);
          resolve(status);
        });
      });
    });
  });
}

/** `mediaFailed` : la TV a récupéré la vidéo sans savoir la lire, une autre source peut passer. */
async function explainFailure(err, device, loadStartedAt) {
  const stage = err?.stage || "connect";
  if (stage === "connect") {
    return { error: "L'appareil ne répond pas. Vérifie qu'il est allumé et sur le même réseau que ce PC." };
  }
  if (stage === "launch") {
    return { error: "L'appareil a refusé de lancer la lecture. Réessaie dans quelques secondes." };
  }
  const reached = localProxyServer.lastLanRequestFrom(device.host) >= loadStartedAt;
  if (!reached) {
    const fw = await getFirewallStatus();
    if (fw?.blocked || (fw?.publicNetwork && !fw?.allowedOnNetwork)) {
      return { error: "Le pare-feu Windows empêche la TV de récupérer la vidéo sur ce PC. Autorise Nartya dans « Pare-feu Windows Defender › Autoriser une application », ou passe ce réseau en « Privé »." };
    }
    return { error: "La TV n'arrive pas à récupérer la vidéo sur ce PC. Vérifie ton pare-feu, et coupe ton VPN s'il est actif." };
  }
  return { error: "La TV n'a pas pu lire cette vidéo. Essaie une autre source.", mediaFailed: true };
}

async function startCast(deviceId, media) {
  const device = devices.get(deviceId);
  if (!device) return { success: false, error: "Appareil introuvable, relance la recherche." };
  if (!media?.url) return { success: false, error: "Aucune vidéo à caster pour le moment." };

  const castUrl = await localProxyServer.toCastUrl(media.url, device.host);
  if (!castUrl) return { success: false, error: "Cette vidéo ne peut pas être castée.", mediaFailed: true };

  await endSession("switch");
  clearTimeout(idleTimer);

  const loadStartedAt = Date.now();
  try {
    await castLoad(device, { ...media, url: castUrl });
    return { success: true, deviceId };
  } catch (err) {
    console.warn(`[Cast] Échec (${err?.stage || "?"}) :`, err?.message || err);
    const failure = await explainFailure(err, device, loadStartedAt);
    localProxyServer.stopCastServer();
    return { success: false, ...failure };
  }
}

function control(action, value) {
  return new Promise((resolve) => {
    if (!session?.player) return resolve({ success: false, error: "Aucun cast actif" });
    const p = session.player;
    if (["play", "pause", "seek"].includes(action) && !p.media.currentSession) {
      return resolve({ success: false, error: "Lecture pas encore prête" });
    }
    const reply = (apply) => (err, st) => {
      if (err) return resolve({ success: false, error: err.message });
      apply(st);
      resolve({ success: true });
    };
    const done = reply(onMediaStatus);
    const volumeDone = reply(onVolume);
    switch (action) {
      case "play":
        return p.play(done);
      case "pause":
        return p.pause(done);
      case "seek":
        return p.seek(Number(value) || 0, done);
      case "stop":
        endSession("stop").then(() => resolve({ success: true }));
        return;
      case "volume":
        return session.client.setVolume({ level: Math.max(0, Math.min(1, Number(value))) }, volumeDone);
      case "mute":
        return session.client.setVolume({ muted: !!value }, volumeDone);
      default:
        return resolve({ success: false, error: "Action inconnue" });
    }
  });
}

async function getDiagnostics() {
  return {
    discovering,
    devices: devices.size,
    listenerError: diagnostics.listenerError,
    interfaces: diagnostics.interfaces,
    packets: diagnostics.packets,
    castAnswers: diagnostics.castAnswers,
    firewall: await getFirewallStatus(),
  };
}

// Branchement

export function initCast(getWindow) {
  const send = (channel, payload) => {
    const win = getWindow?.();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  sendDevices = (list) => send("cast:devices", list);
  sendStatus = (status) => send("cast:status", status);
}

export async function shutdownCast() {
  await endSession("shutdown");
  stopDiscovery();
}

export function registerCastIpc(ipcMain) {
  ipcMain.handle("cast:discover", () => {
    startDiscovery();
    return [...devices.values()].map(publicDevice);
  });
  ipcMain.handle("cast:add-host", (_e, ip) => addManualDevice(String(ip || "").trim()));
  ipcMain.handle("cast:diagnostics", () => getDiagnostics());
  ipcMain.handle("cast:start", (_e, deviceId, media) => startCast(deviceId, media));
  ipcMain.handle("cast:control", (_e, action, value) => control(action, value));
  ipcMain.handle("cast:stop", () => endSession("stop").then(() => ({ success: true })));
}
