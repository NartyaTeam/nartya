import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Device } from "@capacitor/device";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { ensureRecipe, getRecipe, getSource } from "@/shared/sourceRecipe";
import { SITE_URL, SITE_HOST } from "@/config/instance";
import {
  extractFromHtml,
  isExtractedVideoUrlConsistentWithEmbed,
} from "@/shared/videoExtract";

const NartyaProxy = registerPlugin("NartyaProxy");
const NartyaScreen = registerPlugin("NartyaScreen");
const NartyaPlayer = registerPlugin("NartyaPlayer");
const NartyaShare = registerPlugin("NartyaShare");
const NartyaUpdater = registerPlugin("NartyaUpdater");
const noop = () => {};

let proxyBaseUrl = null;
// Exigé par le proxy natif sur chaque requête.
let proxyToken = null;
let proxyPromise = null;
let configuredRecipeVersion = null;
const streamCache = new Map();
const downloadHandles = new Map();
const STREAM_CACHE_TTL_MS = 10 * 60_000;
const CAPTCHA_URL = `${SITE_URL}/captcha.html?mobile=1`;
const CAPTCHA_TIMEOUT_MS = 90_000;

function currentAccessToken() {
  try {
    const parsed = JSON.parse(localStorage.getItem("nartya-auth") || "null");
    return (parsed?.currentSession ?? parsed)?.access_token || null;
  } catch {
    return null;
  }
}

function ensureProxy() {
  if (proxyBaseUrl) return Promise.resolve(proxyBaseUrl);
  if (!proxyPromise) {
    proxyPromise = NartyaProxy.start({ configs: {} })
      .then(({ port, token }) => {
        if (!Number.isInteger(port) || port <= 0) throw new Error("Port du proxy natif invalide");
        if (!token || typeof token !== "string") throw new Error("Jeton du proxy natif manquant");
        proxyToken = token;
        proxyBaseUrl = `http://127.0.0.1:${port}/video/proxy`;
        return proxyBaseUrl;
      })
      .catch((error) => {
        proxyPromise = null;
        throw error;
      });
  }
  return proxyPromise;
}

// iOS récupère le socket d'écoute d'une app suspendue : si le proxy change de port, les URL
// de flux déjà construites pointent vers un port mort.
if (Capacitor.getPlatform() === "ios") {
  void NartyaProxy.addListener("proxyRestarted", ({ port, token }) => {
    if (!Number.isInteger(port) || port <= 0 || !token) return;
    proxyToken = token;
    proxyBaseUrl = `http://127.0.0.1:${port}/video/proxy`;
    proxyPromise = Promise.resolve(proxyBaseUrl);
    streamCache.clear();
    downloadHandles.clear();
  }).catch(() => {});
}

async function configureProxy(recipe) {
  await ensureProxy();
  if (!recipe || configuredRecipeVersion === recipe.version) return;
  await NartyaProxy.configure({
    configs: {
      providerConfigs: recipe.sources || {},
      defaultConfig: { headers: recipe.defaultHeaders || {} },
    },
  });
  configuredRecipeVersion = recipe.version;
}

function canonicalizeEmbedUrl(embedUrl, source) {
  const parsed = new URL(embedUrl);
  if (source?.canonicalHost && source?.hostMatch) {
    if (
      parsed.hostname.includes(source.hostMatch) &&
      !parsed.hostname.endsWith(source.canonicalHost)
    ) {
      parsed.hostname = source.canonicalHost;
    }
  }
  if (source?.embedQuery) {
    const separator = source.embedQuery.indexOf("=");
    const key = separator === -1 ? source.embedQuery : source.embedQuery.slice(0, separator);
    const value = separator === -1 ? "" : source.embedQuery.slice(separator + 1);
    if (key && !parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function isAllowedEmbedUrl(embedUrl, source) {
  try {
    const parsed = new URL(embedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    return (source?.domains || []).some((domain) => {
      const allowed = String(domain).toLowerCase();
      return host === allowed || host.endsWith(`.${allowed}`);
    });
  } catch {
    return false;
  }
}

function proxyUrl(base, targetUrl, provider, { referer, origin, kind } = {}) {
  const query = new URLSearchParams({ url: targetUrl, provider: provider || "" });
  if (referer) query.set("referer", referer);
  if (origin) query.set("origin", origin);
  if (kind) query.set("kind", kind);
  query.set("t", proxyToken);
  return `${base}?${query.toString()}`;
}

function rememberDownloadTarget(target) {
  const handle = `mobile-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
  downloadHandles.set(handle, { ...target, at: Date.now() });
  if (downloadHandles.size > 200) downloadHandles.delete(downloadHandles.keys().next().value);
  return handle;
}

let authCallback = null;
let navigationCallback = null;
let urlListenerAttached = false;
let captchaResolvers = [];

function attachUrlListener() {
  if (urlListenerAttached) return;
  urlListenerAttached = true;
  void App.addListener("appUrlOpen", ({ url }) => {
    if (!url) return;
    try {
      const parsed = new URL(url);
      // Deep-link nartya://auth-callback ou App Link HTTPS.
      const isAuthCallback =
        parsed.hostname === "auth-callback" ||
        (parsed.protocol === "https:" && parsed.host === SITE_HOST && parsed.pathname === "/callback");
      if (isAuthCallback) {
        authCallback?.(url);
        // Sur iOS, la vue Safari ne se referme pas d'elle-même.
        if (Capacitor.getPlatform() === "ios") void Browser.close().catch(() => {});
        return;
      }
      if (parsed.hostname === "captcha-callback") {
        const result = {
          token: parsed.searchParams.get("token") || null,
          error: parsed.searchParams.get("error") || null,
        };
        const resolvers = captchaResolvers.splice(0);
        resolvers.forEach((resolve) => resolve(result));
        return;
      }
      const route = `/${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
      if (route !== "/") navigationCallback?.(route);
    } catch (_) {}
  });
}

if (Capacitor.isNativePlatform()) {
  attachUrlListener();
  void App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) window.history.back();
    else void App.exitApp();
  });
}

/** S'il se ferme avant le premier chargement, on relance par la navigation standard. */
async function openAuthBrowser(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { opened: false, error: "URL d'autorisation invalide" };
  }
  if (parsed.protocol !== "https:") {
    return { opened: false, error: "URL d'autorisation non sécurisée" };
  }

  attachUrlListener();
  let pageHandle = null;
  let finishHandle = null;
  let timeoutId = null;
  let settle;
  const outcome = new Promise((resolve) => {
    settle = resolve;
  });

  try {
    pageHandle = await Browser.addListener("browserPageLoaded", () => {
      settle({ opened: true });
    });
    finishHandle = await Browser.addListener("browserFinished", () => {
      settle({ opened: false, closedBeforeLoad: true });
    });
    await Browser.open({ url, toolbarColor: "#09090b" });
    // L'événement de première page manque sur certains navigateurs.
    timeoutId = setTimeout(() => settle({ opened: true }), 8_000);
    const result = await outcome;
    if (result.closedBeforeLoad) {
      window.location.assign(url);
      return { opened: true, embeddedFallback: true };
    }
    return result;
  } catch (error) {
    return { opened: false, error: error?.message || "Impossible d'ouvrir le navigateur" };
  } finally {
    clearTimeout(timeoutId);
    void pageHandle?.remove?.().catch(() => {});
    void finishHandle?.remove?.().catch(() => {});
  }
}

async function hashedDeviceId() {
  try {
    const { identifier } = await Device.getId();
    if (!identifier) return null;
    const bytes = new TextEncoder().encode(`nartya:${identifier}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export const capacitorPlatform = {
  name: `capacitor-${Capacitor.getPlatform()}`,
  os: Capacitor.getPlatform(),
  isMobile: true,
  isDesktop: false,
  getMachineId: hashedDeviceId,

  async fetchEmbedUrl(embedUrl, options = {}) {
    try {
      const base = await ensureProxy();
      const response = await fetch(
        proxyUrl(base, embedUrl, options.sourceKey || options.provider, options),
      );
      if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
      return { success: true, html: await response.text() };
    } catch (error) {
      return { success: false, error: error?.message || "Extraction impossible" };
    }
  },

  async resolveStream(payload = {}) {
    const { token, apiBaseUrl, forceRefresh = false, mode } = payload;
    if (!token || typeof token !== "string") return { success: false, error: "Jeton manquant" };
    if (!apiBaseUrl || !/^https?:\/\//i.test(apiBaseUrl)) {
      return { success: false, error: "API non configurée (URL absolue attendue)" };
    }

    if (forceRefresh) streamCache.delete(token);
    const cached = streamCache.get(token);
    if (cached && Date.now() - cached.at < STREAM_CACHE_TTL_MS) {
      if (mode === "download") {
        return { success: true, handle: rememberDownloadTarget(cached), cached: true };
      }
      return { success: true, url: cached.proxyUrl, cached: true };
    }

    const accessToken = currentAccessToken();
    // Un seul aller-retour à la première lecture.
    const recipeReady = ensureRecipe({ apiBaseUrl, accessToken });

    let embedUrl;
    let provider;
    try {
      const response = await fetch(`${apiBaseUrl}/v1/streams/${encodeURIComponent(token)}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 401) {
        return { success: false, error: "Connecte-toi pour lancer la lecture." };
      }
      if (response.status === 410) {
        return { success: false, error: "Lien expiré, recharge l'épisode." };
      }
      if (response.status === 429) {
        return { success: false, error: "Trop de lectures d'affilée, patiente un instant." };
      }
      if (!response.ok) {
        return { success: false, error: `Résolution indisponible (${response.status})` };
      }
      const json = await response.json();
      embedUrl = json?.data?.url;
      provider = json?.data?.provider || null;
    } catch (error) {
      return { success: false, error: error?.message || "Résolution indisponible" };
    }
    if (!(await recipeReady)) {
      return { success: false, error: "Configuration des sources indisponible" };
    }

    const source = getSource(provider);
    if (!embedUrl || !source || !isAllowedEmbedUrl(embedUrl, source)) {
      return { success: false, error: "Source introuvable ou non autorisée" };
    }

    let finalEmbedUrl;
    try {
      finalEmbedUrl = canonicalizeEmbedUrl(embedUrl, source);
      await configureProxy(getRecipe());
    } catch (error) {
      return { success: false, error: error?.message || "Proxy de lecture indisponible" };
    }

    const embedOrigin = new URL(finalEmbedUrl).origin;
    const html = await this.fetchEmbedUrl(finalEmbedUrl, {
      sourceKey: provider,
      referer: source.refererFromEmbed ? finalEmbedUrl : null,
      origin: source.refererFromEmbed ? embedOrigin : null,
    });
    if (!html.success) return { success: false, error: html.error || "Hébergeur injoignable" };

    const extracted = extractFromHtml(html.html, finalEmbedUrl, provider);
    if (!extracted.success || !extracted.videoUrl) {
      return { success: false, error: extracted.error || "Flux introuvable" };
    }
    if (!isExtractedVideoUrlConsistentWithEmbed(finalEmbedUrl, extracted.videoUrl)) {
      return { success: false, error: "Flux extrait incohérent avec la source" };
    }

    const base = await ensureProxy();
    const isHls = /\.m3u8(\?|$)/i.test(extracted.videoUrl);
    const target = {
      directUrl: extracted.videoUrl,
      provider,
      referer: finalEmbedUrl,
      origin: embedOrigin,
      proxyUrl: proxyUrl(base, extracted.videoUrl, provider, {
        referer: finalEmbedUrl,
        origin: embedOrigin,
        kind: isHls ? "hls" : null,
      }),
      at: Date.now(),
    };
    streamCache.set(token, target);
    if (streamCache.size > 200) streamCache.delete(streamCache.keys().next().value);

    if (mode === "download") return { success: true, handle: rememberDownloadTarget(target) };
    return { success: true, url: target.proxyUrl };
  },

  downloads: {
    async list() {
      try {
        return await NartyaProxy.downloadList();
      } catch {
        return { items: [] };
      }
    },
    start(payload) {
      // Pas d'URL à résoudre.
      if (payload?.type === "scan") {
        return NartyaProxy.requestDownloadPermission()
          .catch(() => ({ granted: false }))
          .then(() => NartyaProxy.downloadStart(payload));
      }
      const target = downloadHandles.get(payload?.handle);
      if (!target || Date.now() - target.at >= STREAM_CACHE_TTL_MS) {
        return Promise.resolve({ success: false, error: "Source expirée, relance le téléchargement" });
      }
      return NartyaProxy.requestDownloadPermission()
        .catch(() => ({ granted: false }))
        .then(() =>
          NartyaProxy.downloadStart({
            ...payload,
            directUrl: target.directUrl,
            provider: target.provider,
            referer: target.referer,
            origin: target.origin,
          }),
        );
    },
    cancel: (id) => NartyaProxy.downloadCancel({ id }),
    async cancelSeason(payload) {
      const { items = [] } = await this.list();
      const matches = items.filter((item) =>
        payload.type === "scan"
          ? item.type === "scan" && item.slug === payload.slug && item.oeuvre === payload.oeuvre && item.status !== "done"
          : item.slug === payload.slug &&
            String(item.seasonId) === String(payload.seasonId) &&
            (!payload.lang || item.lang === payload.lang) &&
            item.status !== "done",
      );
      await Promise.all(matches.map((item) => this.cancel(item.id)));
      return { success: true, canceled: matches.length };
    },
    remove: (id) => NartyaProxy.downloadRemove({ id }),
    setMaxConcurrent: async () => ({ success: true }),
    async localUrl(id, rel = "video.mp4") {
      const origin = (await ensureProxy()).replace("/video/proxy", "");
      const query = new URLSearchParams({ id, path: rel, t: proxyToken });
      return `${origin}/local?${query}`;
    },
    async getDir() {
      return { dir: "Stockage privé Nartya", defaultDir: "Stockage privé Nartya", isDefault: true };
    },
    async chooseDir() {
      return { canceled: true };
    },
    async openDir() {
      return { success: false };
    },
    onProgress(callback) {
      if (typeof callback !== "function") return noop;
      const handle = NartyaProxy.addListener("downloadProgress", callback);
      return () => void handle.then((listener) => listener.remove()).catch(() => {});
    },
  },
  session: null,
  cast: null,
  hub: null,
  discord: {
    connect: async () => {},
    setPresence: async () => {},
    clearPresence: async () => {},
  },

  async openExternal(url) {
    try {
      await NartyaShare.openUrl({ url });
      return { opened: true };
    } catch (error) {
      try {
        await Browser.open({ url });
        return { opened: true, fallback: true };
      } catch {
        return { opened: false, error: error?.message || "Impossible d'ouvrir le navigateur" };
      }
    }
  },
  openAuth: openAuthBrowser,
  // Pas l'App Link HTTPS : certains constructeurs désactivent sa vérification pour un APK hors
  // Play Store, et le retour OAuth reste alors dans le navigateur.
  async getAuthRedirectUrl() {
    return "nartya://auth-callback";
  },
  /**
   * Le widget inline échoue dans la WebView : `captcha.html` s'ouvre dans un Custom Tab et
   * répond par deep-link.
   */
  async getCaptchaToken() {
    attachUrlListener();
    let resolveCaptcha;
    const resultPromise = new Promise((resolve) => {
      resolveCaptcha = resolve;
      captchaResolvers.push(resolve);
    });
    const opened = await openAuthBrowser(CAPTCHA_URL);
    if (!opened?.opened) {
      const idx = captchaResolvers.indexOf(resolveCaptcha);
      if (idx !== -1) captchaResolvers.splice(idx, 1);
      return { error: opened?.error || "browser-open-failed" };
    }
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve({ error: "timeout" }), CAPTCHA_TIMEOUT_MS),
    );
    const result = await Promise.race([resultPromise, timeoutPromise]);
    const idx = captchaResolvers.indexOf(resolveCaptcha);
    if (idx !== -1) captchaResolvers.splice(idx, 1);
    void Browser.close().catch(() => {});
    if (result?.token) return { token: result.token };
    return { error: result?.error || "unknown" };
  },
  onAuthCallback(callback) {
    authCallback = typeof callback === "function" ? callback : null;
    attachUrlListener();
  },
  onNavigate(callback) {
    navigationCallback = typeof callback === "function" ? callback : null;
    attachUrlListener();
    return () => {
      if (navigationCallback === callback) navigationCallback = null;
    };
  },
  async getVersion() {
    try {
      return (await App.getInfo()).version || null;
    } catch {
      return null;
    }
  },
  async installUpdate(options) {
    try {
      return await NartyaUpdater.install(options);
    } catch (error) {
      return { started: false, error: error?.message || "Mise à jour Android impossible" };
    }
  },
  setOrientation(orientation) {
    void NartyaScreen.setOrientation({ orientation }).catch(() => {});
    if (orientation === "landscape") {
      void SystemBars.hide().catch(() => {});
    } else {
      void SystemBars.show()
        .then(() => SystemBars.setStyle({ style: SystemBarsStyle.Dark }))
        .catch(() => {});
    }
  },
  setBrightness(value) {
    void NartyaPlayer.setBrightness({ value }).catch(() => {});
  },
  async getVolume() {
    try {
      return await NartyaPlayer.getVolume();
    } catch {
      return null;
    }
  },
  setVolume(value) {
    void NartyaPlayer.setVolume({ value }).catch(() => {});
  },
  captureVolumeButtons(enabled) {
    void NartyaPlayer.setVolumeCapture({ enabled }).catch(() => {});
  },
  onVolumeChange(callback) {
    if (typeof callback !== "function") return noop;
    const handle = NartyaPlayer.addListener("volume", callback);
    return () => void handle.then((listener) => listener.remove()).catch(() => {});
  },
  haptic(style = "medium") {
    const styles = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    void Haptics.impact({ style: styles[style] || ImpactStyle.Medium }).catch(() => {});
  },
  async share(options) {
    try {
      await NartyaShare.share(options);
      return true;
    } catch {
      return false;
    }
  },
  canOpenNewWindow: false,
  openNewWindow: noop,
  quit: noop,
  focusWindow: noop,
};
