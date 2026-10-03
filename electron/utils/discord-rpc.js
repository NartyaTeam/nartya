/**
 * Client Discord fermé : on retente plus tard. L'application doit avoir un asset `nartya_logo` ;
 * son ID vient du renderer (`VITE_DISCORD_RPC_CLIENT_ID`), sans lui le service reste inactif.
 * Discord n'accepte que des URL http(s) sur les boutons : une page du site ouvre le deep-link.
 */

import { SITE_URL } from "../../src/config/instance.js";

const OPEN_BASE_URL = `${SITE_URL}/open`;
const RECONNECT_DELAY_MS = 30_000;

let rpcClient = null;
let isConnected = false;
let reconnectTimeout = null;
let isDestroyed = false;
let clientId = null;
// Ré-appliquée après une reconnexion.
let currentActivity = null;

/** @param {string} [id] Application ID Discord, mémorisé pour les reconnexions */
async function connect(id) {
  if (id) clientId = String(id).trim();
  if (isDestroyed || rpcClient || !clientId) return;

  try {
    // Sans le module, le service reste inactif.
    const DiscordRPC = await import("discord-rpc").then((m) => m.default || m);

    DiscordRPC.register(clientId);
    rpcClient = new DiscordRPC.Client({ transport: "ipc" });

    rpcClient.on("ready", () => {
      isConnected = true;
      setActivity(currentActivity || { type: "home" }).catch(() => {});
    });

    rpcClient.on("disconnected", () => {
      isConnected = false;
      rpcClient = null;
      scheduleReconnect();
    });

    await rpcClient.login({ clientId });
  } catch (error) {
    // Discord fermé : on retentera.
    const msg = error?.message || String(error);
    const benign =
      msg.includes("Could not connect") ||
      msg.includes("ENOENT") ||
      msg.includes("ECONNREFUSED");
    if (!benign) console.warn("[discord-rpc] connexion impossible:", msg);
    isConnected = false;
    rpcClient = null;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (isDestroyed || reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    if (!isDestroyed && !isConnected) connect();
  }, RECONNECT_DELAY_MS);
}

const websiteButton = { label: "Visiter le site", url: SITE_URL };

function openAnimeButton(slug) {
  if (!slug) return null;
  return {
    label: "Regarder cet anime",
    url: `${OPEN_BASE_URL}?anime=${encodeURIComponent(slug)}`,
  };
}

/**
 * @param {{type:'home'|'anime'|'watching', animeTitle?:string, animeSlug?:string,
 *   episodeNumber?:number|string, seasonNumber?:number|string, episodeTitle?:string}} params
 */
function buildActivity(params) {
  const now = Math.floor(Date.now() / 1000);
  const base = {
    largeImageKey: "nartya_logo",
    largeImageText: "Nartya — Streaming Anime",
    instance: false,
    timestamps: { start: now },
  };

  switch (params?.type) {
    case "anime": {
      const buttons = [openAnimeButton(params.animeSlug), websiteButton].filter(Boolean);
      return {
        ...base,
        details: "Choix d'un épisode",
        state: params.animeTitle || "Un anime",
        largeImageText: params.animeTitle || base.largeImageText,
        buttons,
      };
    }

    case "watching": {
      const ep = params.episodeNumber;
      const s = params.seasonNumber;
      let state;
      if (ep) {
        state = `Épisode ${ep}`;
        if (s && Number(s) > 1) state += ` · Saison ${s}`;
      } else {
        state = params.episodeTitle || "En cours de lecture";
      }
      const buttons = [openAnimeButton(params.animeSlug), websiteButton].filter(Boolean);
      return {
        ...base,
        details: `Regarde ${params.animeTitle || "un anime"}`,
        state,
        largeImageText: params.animeTitle || base.largeImageText,
        buttons,
      };
    }

    case "home":
    default:
      return {
        ...base,
        details: "Navigue sur Nartya",
        state: "Exploration du catalogue",
        buttons: [websiteButton],
      };
  }
}

async function setActivity(params) {
  currentActivity = params;
  if (!rpcClient || !isConnected) return { success: false, error: "RPC non connecté" };
  try {
    await rpcClient.setActivity(buildActivity(params));
    return { success: true };
  } catch (error) {
    return { success: false, error: error?.message || String(error) };
  }
}

async function clearActivity() {
  currentActivity = null;
  if (!rpcClient || !isConnected) return { success: false };
  try {
    await rpcClient.clearActivity();
    return { success: true };
  } catch (error) {
    return { success: false, error: error?.message };
  }
}

async function destroy() {
  isDestroyed = true;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (rpcClient) {
    try {
      await rpcClient.destroy();
    } catch (_) {}
    rpcClient = null;
  }
  isConnected = false;
  currentActivity = null;
}

export default { connect, setActivity, clearActivity, destroy };
