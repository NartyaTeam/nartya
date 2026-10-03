/**
 * Sous `file://` (Electron) et dans la WebView Android, Cloudflare refuse le widget inline :
 * la plateforme passe par une page du site. Un échec renvoie `null` : Supabase fait la
 * validation réelle.
 */

import { platform } from "@/platform";
import { TURNSTILE_SITEKEY } from "@/config/instance";

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const INLINE_TIMEOUT_MS = 60_000;

let scriptPromise = null;

function loadTurnstileScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null; // nouvel essai possible plus tard
      reject(new Error("script-load-failed"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

async function getInlineToken() {
  await loadTurnstileScript();
  if (!window.turnstile) throw new Error("turnstile-absent");

  return new Promise((resolve, reject) => {
    // Invisible la plupart du temps, ramené au premier plan s'il devient interactif.
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:9999;opacity:0;pointer-events:none";
    document.body.appendChild(host);

    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      host.remove();
      fn(arg);
    };

    const timer = setTimeout(
      () => finish(reject, new Error("timeout")),
      INLINE_TIMEOUT_MS
    );

    window.turnstile.render(host, {
      sitekey: TURNSTILE_SITEKEY,
      theme: "dark",
      callback: (token) => finish(resolve, token),
      "error-callback": (code) => {
        finish(reject, new Error(String(code)));
        return true;
      },
      "expired-callback": () => window.turnstile.reset(),
      "before-interactive-callback": () => {
        // Cloudflare réclame un geste.
        host.style.opacity = "1";
        host.style.pointerEvents = "auto";
      },
    });
  });
}

export async function getCaptchaToken() {
  try {
    if (window.electronAPI?.getCaptchaToken) {
      const res = await window.electronAPI.getCaptchaToken();
      if (res?.token) return res.token;
      console.warn("[captcha] échec côté Electron:", res?.error || "inconnu");
      return null;
    }
    if (platform.getCaptchaToken && platform.name?.startsWith("capacitor-")) {
      const res = await platform.getCaptchaToken();
      if (res?.token) return res.token;
      console.warn("[captcha] échec côté Android:", res?.error || "inconnu");
      return null;
    }
    return await getInlineToken();
  } catch (e) {
    console.warn("[captcha] indisponible:", e?.message || e);
    return null;
  }
}
