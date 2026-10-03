import { API_URL } from "@/config/instance";
/** /api en dev (proxy Vite), l'URL de prod une fois packagé. */

export const API_CONFIG = {
  DEV_BASE_URL: "http://localhost:3000",
  PROD_BASE_URL: import.meta.env?.VITE_API_URL || API_URL,
  TIMEOUT: 30000,
};

function isDevelopmentSync() {
  if (typeof import.meta !== "undefined" && import.meta.env !== undefined) {
    if (import.meta.env.DEV === true) return true;
    if (import.meta.env.PROD === true) return false;
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
  }
  return false;
}

export function getApiBaseUrl() {
  if (isDevelopmentSync()) return "/api";
  return API_CONFIG.PROD_BASE_URL;
}

/** Pour le processus principal, où « /api » ne se résout pas. */
export function getAbsoluteApiBaseUrl() {
  const base = getApiBaseUrl();
  if (/^https?:\/\//i.test(base)) return base;
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(base, window.location.origin).toString().replace(/\/+$/, "");
  }
  return API_CONFIG.DEV_BASE_URL;
}
