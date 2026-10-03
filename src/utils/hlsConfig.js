import Hls from "hls.js";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { platform } from "@/platform";
import {
  pickFixedQualityLevel,
  pickHighestLevel,
  pickLevelForHeight,
} from "@/utils/qualityLevels";

const BW_STORAGE_KEY = "nartya_hls_bw";
// Les CDN vont de ~3 à ~28 Mb/s : une mesure unique faisait démarrer une source lente en 1080p.
const BW_BY_PROVIDER_KEY = "nartya_hls_bw_by_provider";

function _readProviderBandwidths() {
  try {
    const raw = localStorage.getItem(BW_BY_PROVIDER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

/** Dernière mesure × 0,8, plafonnée à 30 Mb/s : celle de `provider`, sinon la globale. */
function getBandwidthEstimate(provider = null) {
  const clamp = (bw) => Math.min(Math.floor(bw * 0.8), 30_000_000);
  try {
    if (provider) {
      const bw = parseInt(_readProviderBandwidths()[provider], 10);
      if (bw > 200_000) return clamp(bw);
    }
    const saved = parseInt(localStorage.getItem(BW_STORAGE_KEY), 10);
    if (saved > 200_000) return clamp(saved);
  } catch (_) {}
  return 3_000_000;
}

/**
 * 70 % ancien, 30 % nouveau : un segment servi d'un cache chaud ne doit pas faire croire
 * que le CDN est rapide.
 */
export function saveBandwidthEstimate(bitsPerSecond, provider = null) {
  if (!(bitsPerSecond > 200_000)) return;
  try {
    localStorage.setItem(BW_STORAGE_KEY, Math.floor(bitsPerSecond).toString());
    if (!provider) return;
    const map = _readProviderBandwidths();
    const previous = parseInt(map[provider], 10);
    map[provider] = Math.floor(
      previous > 200_000 ? previous * 0.7 + bitsPerSecond * 0.3 : bitsPerSecond
    );
    localStorage.setItem(BW_BY_PROVIDER_KEY, JSON.stringify(map));
  } catch (_) {}
}

/** Buffers généreux : le proxy local ajoute un hop. */
const DEFAULT_HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  autoStartLoad: true,
  startLevel: -1,
  capLevelToPlayerSize: true,

  // Sans effet sur un niveau choisi à la main.
  capLevelOnFPSDrop: true,
  fpsDroppedMonitoringPeriod: 5000,
  fpsDroppedMonitoringThreshold: 0.2,

  maxBufferLength: 60,
  maxMaxBufferLength: 120,
  maxBufferSize: 120 * 1000 * 1000,
  backBufferLength: 30,
  maxBufferHole: 0.5,

  nudgeOffset: 0.1,
  nudgeMaxRetry: 20,
  maxFragLookUpTolerance: 0.25,
  stretchShortVideoTrack: true,

  maxStarvationDelay: 4,
  maxLoadingDelay: 4,
  minAutoBitrate: 0,

  abrEwmaDefaultEstimate: 2_500_000,
  abrEwmaFastLive: 3.0,
  abrEwmaSlowLive: 9.0,
  abrEwmaFastVoD: 3.0,
  abrEwmaSlowVoD: 9.0,
  highBufferWatchdogPeriod: 1,
  abrBandWidthFactor: 0.85,
  abrBandWidthUpFactor: 0.75,

  manifestLoadingTimeOut: 10_000,
  manifestLoadingMaxRetry: 3,
  manifestLoadingRetryDelay: 500,
  levelLoadingTimeOut: 10_000,
  levelLoadingMaxRetry: 3,
  levelLoadingRetryDelay: 500,
  fragLoadingTimeOut: 20_000,
  fragLoadingMaxRetry: 10,
  fragLoadingRetryDelay: 500,

  progressive: true,
  startFragPrefetch: true,
  appendErrorMaxRetry: 5,
};

const FAST_START_HLS_CONFIG = {
  ...DEFAULT_HLS_CONFIG,
  startLevel: -1,
  abrBandWidthFactor: 0.9,
  abrBandWidthUpFactor: 0.85,
};

// La WebView partage sa mémoire avec toute l'app : 120 Mo de buffer peuvent tuer le renderer
// sur un téléphone modeste.
const MOBILE_HLS_CONFIG = {
  // Le premier fragment, le plus léger, sert de mesure de la connexion.
  startLevel: 0,

  // Une connexion mobile fluctue : on ne monte qu'avec une marge confortable.
  abrBandWidthFactor: 0.75,
  abrBandWidthUpFactor: 0.6,
  maxStarvationDelay: 2,
  maxLoadingDelay: 3,

  maxBufferLength: 45,
  maxMaxBufferLength: 90,
  maxBufferSize: 60 * 1000 * 1000,
  backBufferLength: 15,
};

export function createFastStartHlsInstance(customConfig = {}, provider = null) {
  const measuredEstimate = getBandwidthEstimate(provider);
  const initialEstimate = platform.isMobile
    ? Math.min(Math.floor(measuredEstimate * 0.65), 6_000_000)
    : measuredEstimate;
  // Variante la plus légère pour afficher l'image plus tôt, sauf sous Anime4K qui verrouille
  // son niveau.
  const anime4kActive =
    !platform.isMobile && useSettingsStore.getState().anime4kMode !== "off";
  return new Hls({
    ...FAST_START_HLS_CONFIG,
    startLevel: anime4kActive ? -1 : 0,
    ...(platform.isMobile ? MOBILE_HLS_CONFIG : null),
    abrEwmaDefaultEstimate: initialEstimate,
    ...customConfig,
  });
}

/** Décodage logiciel (ChromeOS/Crostini) : le CPU sature au-delà de ~720p. */
const SOFTWARE_DECODE = platform.softwareDecode === true;

const SOFTWARE_DECODE_MAX_HEIGHT = 720;

/**
 * En lecture normale, `playbackPref` est un plafond avec ABR en dessous ; sous Anime4K,
 * `anime4kQuality` est un niveau strict.
 */
function applyQualityPolicy(hlsInstance, playbackPref) {
  const settings = useSettingsStore.getState();
  const anime4kActive = !platform.isMobile && settings.anime4kMode !== "off";

  if (anime4kActive) {
    const pref = settings.anime4kQuality || "max";
    let target = pickFixedQualityLevel(hlsInstance.levels, pref);

    if (SOFTWARE_DECODE && target >= 0) {
      const safe = pickLevelForHeight(hlsInstance.levels, SOFTWARE_DECODE_MAX_HEIGHT);
      const targetHeight = hlsInstance.levels[target]?.height || Infinity;
      const safeHeight = hlsInstance.levels[safe]?.height || Infinity;
      if (safe >= 0 && safeHeight < targetHeight) target = safe;
    }

    if (target >= 0 && target < hlsInstance.levels.length) {
      // `capLevelToPlayerSize` réécrit `autoLevelCapping` chaque seconde, ce qui écraserait un
      // niveau fixe.
      hlsInstance.capLevelToPlayerSize = false;
      hlsInstance.autoLevelCapping = target;
      hlsInstance.config.preserveManualLevelOnError = true;
      hlsInstance._nartyaAnime4kLockedLevel = target;
      hlsInstance.loadLevel = target;
      // `nextLevel` bascule au prochain fragment, sans la coupure de `currentLevel`.
      if (hlsInstance.currentLevel !== target) hlsInstance.nextLevel = target;
      return target;
    }
  }

  const caps = [];

  if (SOFTWARE_DECODE) {
    const cap = pickLevelForHeight(hlsInstance.levels, SOFTWARE_DECODE_MAX_HEIGHT);
    if (cap >= 0) caps.push(cap);
  }

  if (playbackPref && playbackPref !== "auto") {
    const target = parseInt(playbackPref, 10);
    if (Number.isFinite(target)) {
      const cap = pickLevelForHeight(hlsInstance.levels, target);
      if (cap >= 0) caps.push(cap);
    }
  }

  const ceiling = caps.length ? Math.min(...caps) : -1;
  // Un plafond manuel reste figé ; en Auto, hls.js suit la taille du lecteur.
  hlsInstance.capLevelToPlayerSize = ceiling === -1;
  hlsInstance.autoLevelCapping = ceiling;

  hlsInstance.config.preserveManualLevelOnError = false;
  hlsInstance._nartyaAnime4kLockedLevel = -1;
  hlsInstance.loadLevel = -1; // ABR restauré sans purger le buffer
  return -1;
}

/** Relance aussi le chargement si le média n'est pas prêt. */
export function applyPreferredQuality(hlsInstance) {
  applyQualityPolicy(hlsInstance, useSettingsStore.getState().playbackQuality || "auto");
  if (hlsInstance.media && !hlsInstance.media.readyState) {
    try { hlsInstance.startLoad(); } catch (_) {}
  }
}

function isBufferedAhead(video, ahead = 1) {
  try {
    const t = video.currentTime;
    for (let i = 0; i < video.buffered.length; i++) {
      if (t >= video.buffered.start(i) && video.buffered.end(i) - t >= ahead) return true;
    }
  } catch (_) {}
  return false;
}

/**
 * Fenêtres de 4 s, deux mauvaises de suite requises :
 * 1. bloqué malgré du buffer : `recoverMediaError()`, puis allègement ;
 * 2. image figée, son qui avance : on descend d'un cran ;
 * 3. famine réseau : on allège, puis `onNetworkStarved` laisse l'appelant changer d'hébergeur.
 * @param {{ onNetworkStarved?: () => void }} [handlers]
 */
export function startDecodeWatchdog(
  art,
  hls,
  { onNetworkStarved, onPerformanceLimited } = {}
) {
  const video = art?.video;
  if (!video || !hls) return () => {};
  const canQuality = typeof video.getVideoPlaybackQuality === "function";
  const CHECK_MS = 4000;
  const MIN_FRAMES = 24;
  const BAD_RATIO = 0.5; // part de frames perdues
  const MAX_RECOVERIES = 3; // au-delà, on allège
  // Avant d'alléger, puis avant de rendre la main à l'appelant.
  const STARVE_STEPDOWN = 2;
  const STARVE_GIVE_UP = 4;
  let last = null;
  let dropStreak = 0;
  let stallStreak = 0;
  let starveStreak = 0;
  let recoveries = 0;
  let gaveUp = false;
  let performanceLimited = false;

  const stepDown = (reason) => {
    if (hls._nartyaAnime4kLockedLevel >= 0) {
      if (reason === "source trop lente") {
        try { art.notice.show = "Débit insuffisant pour la qualité fixe Anime4K"; } catch (_) {}
      } else if (!performanceLimited) {
        performanceLimited = true;
        try { onPerformanceLimited?.(reason); } catch (_) {}
      }
      return;
    }
    if (!hls.levels || hls.levels.length <= 1) return;
    const cur = hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel;
    const ceiling = hls.autoLevelCapping >= 0 ? hls.autoLevelCapping : hls.levels.length - 1;
    const target = Math.max(0, Math.min(cur, ceiling) - 1);
    // Sinon le CapLevelController réécrirait le plafond dans la seconde.
    hls.capLevelToPlayerSize = false;
    hls.autoLevelCapping = target;
    hls.currentLevel = -1;
    try { art.notice.show = `Qualité réduite (${reason})`; } catch (_) {}
  };

  const id = setInterval(() => {
    if (video.paused || video.seeking || video.readyState < 1) {
      last = null;
      starveStreak = 0;
      return;
    }
    let total = 0, dropped = 0;
    if (canQuality) {
      try {
        const q = video.getVideoPlaybackQuality();
        total = q.totalVideoFrames || 0;
        dropped = q.droppedVideoFrames || 0;
      } catch (_) {}
    }
    const time = video.currentTime || 0;

    if (last) {
      const advanced = time - last.time;
      const bufferedAhead = isBufferedAhead(video);

      // 3) Famine réseau
      if (advanced < 0.1 && !bufferedAhead) {
        starveStreak += 1;
        if (starveStreak === STARVE_STEPDOWN) stepDown("source trop lente");
        else if (starveStreak >= STARVE_GIVE_UP && !gaveUp) {
          gaveUp = true;
          try { onNetworkStarved?.(); } catch (_) {}
        }
      } else if (advanced >= 0.1) {
        starveStreak = 0;
      }

      // 1) Bloqué malgré du buffer devant
      if (advanced < 0.1 && bufferedAhead) {
        stallStreak += 1;
        if (stallStreak >= 2) {
          stallStreak = 0;
          if (recoveries < MAX_RECOVERIES) {
            recoveries += 1;
            try { hls.recoverMediaError(); } catch (_) {}
            try { video.currentTime = time + 0.1; } catch (_) {}
            try { art.play?.()?.catch?.(() => {}); } catch (_) {}
          } else {
            stepDown("lecture bloquée");
          }
        }
      } else {
        stallStreak = 0;
      }

      // 2) Frames massivement perdues
      if (canQuality && advanced >= 0.1) {
        const dT = total - last.total;
        const dD = dropped - last.dropped;
        if (dT >= MIN_FRAMES && dD / dT > BAD_RATIO) {
          dropStreak += 1;
          if (dropStreak >= 2) { dropStreak = 0; stepDown("lecture saccadée"); }
        } else {
          dropStreak = 0;
        }
      }
    }
    last = { total, dropped, time };
  }, CHECK_MS);

  return () => clearInterval(id);
}

// Module pur, testable sous Node.
export { isHlsUrl } from "./hlsDetect.js";

const QUALITY_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" style="fill:none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 18v-3"/><path d="M12 18v-7"/><path d="M18 18V6"/></svg>';

/** Sous Anime4K, la coche reflète `anime4kQuality` et « Auto » n'est pas proposé. */
function buildQualityOptions(hlsInstance) {
  if (!hlsInstance?.levels || hlsInstance.levels.length <= 1) return [];

  const settings = useSettingsStore.getState();
  const anime4kActive = !platform.isMobile && settings.anime4kMode !== "off";
  const pref = anime4kActive
    ? settings.anime4kQuality || "max"
    : settings.playbackQuality || "auto";
  const selectedIndex =
    pref === "auto"
      ? -1
      : pref === "max"
        ? pickHighestLevel(hlsInstance.levels)
        : pickLevelForHeight(hlsInstance.levels, parseInt(pref, 10));

  const qualityOptions = hlsInstance.levels.map((level, index) => {
    const height = level.height || level.resolution?.split("x")[1] || "?";
    const label = height !== "?" ? `${height}p` : `Niveau ${index + 1}`;
    return { default: index === selectedIndex, html: label, value: index };
  });

  if (!anime4kActive) {
    qualityOptions.unshift({ default: selectedIndex === -1, html: "Auto", value: -1 });
  }
  return qualityOptions;
}

/** Choix mémorisé par résolution, pas par index : les variantes diffèrent d'une source à l'autre. */
export function addQualitySettingToPlayer(artInstance, hlsInstance) {
  if (!artInstance?.setting) return false;

  const qualityOptions = buildQualityOptions(hlsInstance);
  if (qualityOptions.length === 0) {
    // Source mono-qualité : retire le menu d'une source précédente.
    if (artInstance._qualityAdded) {
      try { artInstance.setting.remove("quality"); } catch (_) {}
      artInstance._qualityAdded = false;
    }
    return false;
  }

  const lockedLevel = hlsInstance._nartyaAnime4kLockedLevel;
  const lockedHeight = lockedLevel >= 0 ? hlsInstance.levels[lockedLevel]?.height : null;
  const selectedLabel = (qualityOptions.find((o) => o.default) || qualityOptions[0]).html;
  const tooltip = lockedHeight
    ? `${lockedHeight}p fixe`
    : selectedLabel;

  const option = {
    name: "quality",
    width: 200,
    html: "Qualité",
    tooltip,
    icon: QUALITY_ICON,
    selector: qualityOptions,
    onSelect: (item) => {
      const pref = item.value === -1 ? "auto" : String(hlsInstance.levels[item.value]?.height || "auto");
      const settings = useSettingsStore.getState();
      const anime4kActive = !platform.isMobile && settings.anime4kMode !== "off";
      try {
        settings.setSetting(anime4kActive ? "anime4kQuality" : "playbackQuality", pref);
      } catch (_) {}
      applyQualityPolicy(
        hlsInstance,
        useSettingsStore.getState().playbackQuality || "auto"
      );
      queueMicrotask(() => addQualitySettingToPlayer(artInstance, hlsInstance));
      return item.html;
    },
  };

  try {
    if (artInstance._qualityAdded) artInstance.setting.update(option);
    else {
      artInstance.setting.add(option);
      artInstance._qualityAdded = true;
    }
  } catch (_) {
    return false;
  }
  return true;
}
