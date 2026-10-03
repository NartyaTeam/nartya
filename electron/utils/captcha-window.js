import { BrowserWindow } from "electron";
import { SITE_URL } from "../../src/config/instance.js";

// Turnstile refuse l'origine `file://` du renderer en prod.
const CAPTCHA_ORIGIN = SITE_URL;
const CAPTCHA_URL = `${CAPTCHA_ORIGIN}/captcha.html`;
const CAPTCHA_TIMEOUT_MS = 90_000;

export function registerCaptchaIpc(secureIpc, { getParent, icon }) {
  secureIpc.handle("captcha:get-token", async () => {
    return new Promise((resolve) => {
      let settled = false;

      const win = new BrowserWindow({
        width: 420,
        height: 320,
        // Montrée seulement si Cloudflare demande une interaction.
        show: false,
        resizable: false,
        // Pas de `modal` : une modale invisible gèlerait l'app jusqu'au timeout.
        parent: getParent() || undefined,
        backgroundColor: "#0b0b0f",
        autoHideMenuBar: true,
        icon,
        webPreferences: { contextIsolation: true, nodeIntegration: false, webSecurity: true },
      });

      const done = (result) => {
        if (settled) return;
        settled = true; // avant destroy() : l'événement `closed` qui suit ressort ici
        clearTimeout(timer);
        if (!win.isDestroyed()) win.destroy();
        resolve(result);
      };

      const timer = setTimeout(() => done({ error: "timeout" }), CAPTCHA_TIMEOUT_MS);

      // La page signale son état par son titre ; le résultat est dans `window.__nartyaCaptcha`.
      win.webContents.on("page-title-updated", async (_e, title) => {
        if (settled || !title.startsWith("nartya-captcha:")) return;

        if (title.startsWith("nartya-captcha:interactive")) {
          if (!win.isDestroyed()) win.show();
          return;
        }

        const payload = await win.webContents
          .executeJavaScript("window.__nartyaCaptcha")
          .catch(() => null);
        done(payload?.token ? { token: payload.token } : { error: payload?.error || "unknown" });
      });

      win.on("closed", () => done({ error: "cancelled" }));

      win.webContents.on("did-fail-load", (_e, code, desc, _url, isMainFrame) => {
        if (isMainFrame) done({ error: `load-failed ${code} ${desc}` });
      });

      // Ne quitte jamais la page du site.
      win.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(`${CAPTCHA_ORIGIN}/`)) event.preventDefault();
      });
      win.webContents.on("will-attach-webview", (event) => event.preventDefault());
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

      // Une réponse HTTP en erreur ne déclenche pas `did-fail-load`.
      win.webContents.on("did-navigate", (_e, _url, httpResponseCode) => {
        if (httpResponseCode >= 400) done({ error: `http-${httpResponseCode}` });
      });

      win.loadURL(CAPTCHA_URL);
    });
  });
}
