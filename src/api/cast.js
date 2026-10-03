/** Hors Electron, tout renvoie des valeurs neutres. */
import { platform } from "@/platform";

const api = () => platform.cast;

export function castAvailable() {
  return !!api();
}

/** Renvoie les appareils déjà connus. */
export async function discoverCastDevices() {
  const c = api();
  if (!c?.discover) return [];
  try {
    return (await c.discover()) || [];
  } catch {
    return [];
  }
}

/** Pour les réseaux qui filtrent la découverte. */
export async function addCastHost(ip) {
  const c = api();
  if (!c?.addHost) return { success: false, error: "Cast indisponible" };
  try {
    return await c.addHost(ip);
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
}

/** Pour expliquer une recherche vide. */
export async function getCastDiagnostics() {
  const c = api();
  if (!c?.diagnostics) return null;
  try {
    return await c.diagnostics();
  } catch {
    return null;
  }
}

/** @param {object} media { url (URL du proxy local), contentType, title, poster } */
export async function startCast(deviceId, media) {
  const c = api();
  if (!c?.start) return { success: false, error: "Cast indisponible" };
  try {
    return await c.start(deviceId, media);
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
}

/** play | pause | seek | stop | volume | mute */
export async function castControl(action, value) {
  const c = api();
  if (!c?.control) return { success: false };
  try {
    return await c.control(action, value);
  } catch {
    return { success: false };
  }
}

export async function stopCast() {
  const c = api();
  if (!c?.stop) return { success: false };
  try {
    return await c.stop();
  } catch {
    return { success: false };
  }
}

export function onCastDevices(cb) {
  const c = api();
  if (!c?.onDevices) return () => {};
  return c.onDevices(cb);
}

export function onCastStatus(cb) {
  const c = api();
  if (!c?.onStatus) return () => {};
  return c.onStatus(cb);
}
