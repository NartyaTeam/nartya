import { platform } from "@/platform";

let wakeLock = null;
let wantsWakeLock = false;

async function requestWakeLock() {
  if (!wantsWakeLock || wakeLock || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  try {
    const lock = await navigator.wakeLock.request("screen");
    // `releaseWakeLock()` a pu passer pendant cet `await`.
    if (!wantsWakeLock) {
      lock.release?.().catch(() => {});
      return;
    }
    wakeLock = lock;
    wakeLock.addEventListener?.("release", () => {
      wakeLock = null;
    });
  } catch (_) {
    wakeLock = null;
  }
}

export async function acquireWakeLock() {
  wantsWakeLock = true;
  await requestWakeLock();
}

export async function releaseWakeLock() {
  wantsWakeLock = false;
  try {
    await wakeLock?.release?.();
  } catch (_) {}
  wakeLock = null;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestWakeLock();
  });
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const sunIcon = (value) => {
  const rays =
    value < 0.34
      ? ""
      : value < 0.67
        ? '<path d="M12 5v1M12 18v1M6.3 6.3l.7.7M17 17l.7.7M5 12h1M18 12h1M6.3 17.7l.7-.7M17 7l.7-.7"/>'
        : '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>';
  return `<svg viewBox="0 0 24 24" style="fill:none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/>${rays}</svg>`;
};

const volumeIcon = (value) => {
  const waves =
    value === 0
      ? '<path d="M22 9l-6 6M16 9l6 6"/>'
      : value < 0.5
        ? '<path d="M15.5 8.5a5 5 0 0 1 0 7"/>'
        : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>';
  return `<svg viewBox="0 0 24 24" style="fill:none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/>${waves}</svg>`;
};

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.5" height="15" rx="1"/><rect x="13.5" y="4.5" width="4.5" height="15" rx="1"/></svg>';

const seekSideIcon = (forward) => {
  const d = forward
    ? "M20 12a8 8 0 1 1-2.34-5.66"
    : "M4 12a8 8 0 1 0 2.34-5.66";
  const arrow = forward ? "M20 5v4h-4" : "M4 5v4h4";
  return (
    `<svg viewBox="0 0 24 24" style="fill:none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${d}"/><path d="${arrow}"/></svg>` +
    `<span class="nartya-center-seek-label">5</span>`
  );
};

function injectHudStyles() {
  if (document.getElementById("nartya-player-hud-style")) return;
  const style = document.createElement("style");
  style.id = "nartya-player-hud-style";
  style.textContent =
    ".nartya-mobile-player .art-control-volume{display:none!important}" +
    // Fenêtre PiP d'Android : la WebView entière y est réduite, seule l'image doit rester.
    ".nartya-pip>:not(.art-video):not(.nartya-comp-guard){display:none!important}" +
    // iPhone en paysage : la plus grande de la marge d'ArtPlayer et de la zone sûre.
    ".nartya-mobile-player.nartya-ios .art-bottom{padding-left:max(var(--art-padding),env(safe-area-inset-left));padding-right:max(var(--art-padding),env(safe-area-inset-right));padding-bottom:env(safe-area-inset-bottom)}" +
    ".nartya-mobile-player.nartya-ios .art-back-btn{left:max(1.25rem,env(safe-area-inset-left));top:max(1.25rem,env(safe-area-inset-top))}" +
    // Certaines WebView ne rastérisent un élément modifié après le montage que si son entourage
    // change : le lecteur a sa propre couche de composition.
    ".nartya-mobile-player{transform:translateZ(0)}" +
    // Sur certaines ROM, une vidéo sans rien au-dessus est promue en overlay matériel et rendue
    // noire : un calque à 1 % la garde dans la composition. z-index 11 : juste au-dessus de `.art-video`.
    ".nartya-comp-guard{position:absolute;inset:0;z-index:11;pointer-events:none;background:rgba(0,0,0,.01)}" +
    // Le play/pause natif d'ArtPlayer se superposait au nôtre.
    ".nartya-mobile-player .art-mask{display:none!important}" +
    ".nartya-bright{position:absolute;left:max(5%,env(safe-area-inset-left));top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 12px;border-radius:16px;background:rgba(0,0,0,.55);backdrop-filter:blur(8px);color:#fff;opacity:0;transition:opacity .16s ease;pointer-events:none;z-index:65}" +
    ".nartya-bright svg{width:22px;height:22px}.nartya-bright-track{position:relative;width:5px;height:min(30vh,120px);border-radius:3px;background:rgba(255,255,255,.25)}.nartya-bright-fill{position:absolute;left:0;bottom:0;width:100%;border-radius:3px;background:#fff}" +
    ".nartya-vol{position:absolute;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;width:min(64vw,580px);color:#fff;opacity:0;transition:opacity .2s ease;pointer-events:none;z-index:65}.nartya-vol svg{width:18px;height:18px;flex:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}.nartya-vol-track{position:relative;flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.3);box-shadow:0 1px 3px rgba(0,0,0,.5)}.nartya-vol-fill{position:absolute;left:0;top:0;height:100%;border-radius:2px;background:#fff}" +
    // Suit la barre de contrôle d'ArtPlayer. z-index < 50 : sous l'overlay du sélecteur d'épisodes.
    ".nartya-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:clamp(20px,8vw,40px);z-index:45;opacity:0;pointer-events:none;transition:opacity .25s ease}" +
    ".art-video-player.art-hover .nartya-center,.art-video-player.art-control-show .nartya-center{opacity:1;pointer-events:auto}" +
    ".nartya-center button{position:relative;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(0,0,0,.4);border:none;border-radius:999px;-webkit-tap-highlight-color:transparent;filter:drop-shadow(0 2px 8px rgba(0,0,0,.5))}" +
    ".nartya-center button:active{transform:scale(0.92)}" +
    ".nartya-center-play{width:60px;height:60px}.nartya-center-play svg{width:26px;height:26px}" +
    ".nartya-center-seek{width:44px;height:44px}.nartya-center-seek svg{width:24px;height:24px}" +
    ".nartya-center-seek-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-52%);font:700 10px/1 system-ui,sans-serif}";
  document.head.appendChild(style);
}

/** Play/pause ± 5 s au centre, double-tap sur les côtés, luminosité à gauche, volume à droite. */
export function setupMobilePlayerControls(art) {
  const host = art?.template?.$player;
  if (!host || typeof document === "undefined") return () => {};

  injectHudStyles();
  host.classList.add("nartya-mobile-player");
  if (platform.os === "ios") host.classList.add("nartya-ios");

  const compositingGuard = document.createElement("div");
  compositingGuard.className = "nartya-comp-guard";
  host.appendChild(compositingGuard);

  const brightnessHud = document.createElement("div");
  brightnessHud.className = "nartya-bright";
  brightnessHud.innerHTML = `<span class="nartya-bright-icon">${sunIcon(1)}</span><div class="nartya-bright-track"><div class="nartya-bright-fill"></div></div>`;
  host.appendChild(brightnessHud);
  const brightnessFill = brightnessHud.querySelector(".nartya-bright-fill");
  const brightnessIcon = brightnessHud.querySelector(".nartya-bright-icon");

  const volumeHud = document.createElement("div");
  volumeHud.className = "nartya-vol";
  volumeHud.style.top = "calc(env(safe-area-inset-top) + 2px)";
  volumeHud.innerHTML = `<span class="nartya-vol-icon">${volumeIcon(1)}</span><div class="nartya-vol-track"><div class="nartya-vol-fill"></div></div>`;
  host.appendChild(volumeHud);
  const volumeFill = volumeHud.querySelector(".nartya-vol-fill");
  const volumeIconEl = volumeHud.querySelector(".nartya-vol-icon");

  let brightness = 1;
  let volume = 1;
  let volumeMax = 0;
  let lastVolumeStep = -1;
  let brightnessTimer = null;
  let volumeTimer = null;

  const showVolume = (ratio) => {
    const value = clamp(ratio, 0, 1);
    volumeFill.style.width = `${value * 100}%`;
    volumeIconEl.innerHTML = volumeIcon(value);
    volumeHud.style.opacity = "1";
    clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => {
      volumeHud.style.opacity = "0";
    }, 1100);
  };

  platform.captureVolumeButtons(true);
  void platform.getVolume?.().then((result) => {
    if (!result?.max) return;
    volumeMax = result.max;
    lastVolumeStep = result.value;
    volume = clamp(result.value / result.max, 0, 1);
  });
  const unsubscribeVolume = platform.onVolumeChange(({ value, max }) => {
    volumeMax = max || volumeMax;
    lastVolumeStep = value;
    volume = max ? clamp(value / max, 0, 1) : 0;
    showVolume(volume);
  });

  const DRAG_THRESHOLD = 12;
  const DOUBLE_TAP_DELAY = 320;
  const HOLD_TO_SEEK_DELAY = 420;
  // Un seuil plus court créait une zone morte, ni tap ni maintien.
  const TAP_DURATION = HOLD_TO_SEEK_DELAY;
  const SEEK_DRAG_RATIO = 0.5;
  let active = false;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let startSide = 0;
  let startBrightness = 1;
  let startVolume = 1;
  let gestureMode = null;
  let lastTapTime = 0;
  let lastTapSide = 0;
  let pendingTapTimer = null;
  let holdTimer = null;
  let startSeekTime = 0;
  let seekMediaKey = null;

  const clearHoldTimer = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
  };

  const clearPendingTap = () => {
    clearTimeout(pendingTapTimer);
    pendingTapTimer = null;
  };

  const formatTime = (seconds) => {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  const sideAt = (clientX) => {
    const rect = host.getBoundingClientRect();
    const position = (clientX - rect.left) / rect.width;
    if (position < 0.38) return -1;
    if (position > 0.62) return 1;
    return 0;
  };

  const seekBy = (seconds) => {
    const duration = art.duration || 0;
    const currentTime = art.currentTime || 0;
    const target = duration
      ? clamp(currentTime + seconds, 0, Math.max(0, duration - 1))
      : Math.max(0, currentTime + seconds);
    if (seconds > 0 && target <= currentTime) return;
    try {
      art.seek = target;
    } catch (_) {}
    art._seekHud?.(seconds);
  };

  const centerCluster = document.createElement("div");
  centerCluster.className = "nartya-center";
  const rewindBtn = document.createElement("button");
  rewindBtn.type = "button";
  rewindBtn.className = "nartya-center-seek";
  rewindBtn.setAttribute("aria-label", "Reculer de 5 secondes");
  rewindBtn.innerHTML = seekSideIcon(false);
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "nartya-center-play";
  playBtn.setAttribute("aria-label", "Lecture / pause");
  const forwardBtn = document.createElement("button");
  forwardBtn.type = "button";
  forwardBtn.className = "nartya-center-seek";
  forwardBtn.setAttribute("aria-label", "Avancer de 5 secondes");
  forwardBtn.innerHTML = seekSideIcon(true);
  centerCluster.append(rewindBtn, playBtn, forwardBtn);
  host.appendChild(centerCluster);

  // Les événements ArtPlayer arrivaient en décalage.
  const updatePlayIcon = () => {
    playBtn.innerHTML = art.video?.paused === false ? PAUSE_ICON : PLAY_ICON;
  };
  updatePlayIcon();
  art.video?.addEventListener("play", updatePlayIcon);
  art.video?.addEventListener("pause", updatePlayIcon);
  art.video?.addEventListener("playing", updatePlayIcon);

  // Sinon le clic synthétique atteint le calque vidéo d'ArtPlayer et bascule une seconde fois.
  const bindTap = (el, action) => {
    let lastRun = 0;
    const run = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastRun < 400) return; // anti double-déclenchement
      lastRun = now;
      action();
    };
    el.addEventListener("touchend", run, { passive: false });
    el.addEventListener("click", run);
  };
  bindTap(rewindBtn, () => seekBy(-5));
  bindTap(forwardBtn, () => seekBy(5));
  bindTap(playBtn, () => {
    if (art.video?.paused === false) art.pause();
    else art.play?.()?.catch?.(() => {});
  });

  const onTouchStart = (event) => {
    if (event.target.closest?.(".art-bottom, .art-control, .art-layers, .art-settings, .art-contextmenus, .nartya-center, .art-back-btn, .nartya-touch-ui")) {
      active = false;
      return;
    }
    if (event.touches.length !== 1) {
      active = false;
      return;
    }
    const touch = event.touches[0];
    active = true;
    gestureMode = null;
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
    startSide = sideAt(touch.clientX);
    startBrightness = brightness;
    startVolume = volume;
    startSeekTime = art.currentTime || 0;
    seekMediaKey = art._loadedMediaKey;
    clearHoldTimer();
    holdTimer = setTimeout(() => {
      if (!active || gestureMode !== null || !(art.duration > 0)) return;
      gestureMode = "seek";
      startSeekTime = art.currentTime || 0;
      seekMediaKey = art._loadedMediaKey;
      platform.haptic?.("light");
      art.notice.show = "Glissez pour avancer ou reculer";
    }, HOLD_TO_SEEK_DELAY);
  };

  const onTouchMove = (event) => {
    if (!active || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (gestureMode === "seek") {
      // L'épisode a changé pendant le geste : `startSeekTime` vaut pour l'ancien média.
      if (art._loadedMediaKey !== seekMediaKey) {
        active = false;
        gestureMode = null;
        return;
      }
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      const duration = art.duration || 0;
      const target = clamp(
        startSeekTime + duration * (deltaX / Math.max(1, rect.width)) * SEEK_DRAG_RATIO,
        0,
        Math.max(0, duration - 1)
      );
      try {
        art.seek = target;
        art.emit("setBar", "played", duration ? target / duration : 0, event);
        art.notice.show = `${formatTime(target)} / ${formatTime(duration)}`;
      } catch (_) {}
      return;
    }
    if (gestureMode === null) {
      if (Math.abs(deltaY) > DRAG_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX) && startSide === -1) {
        gestureMode = "brightness";
      } else if (Math.abs(deltaY) > DRAG_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX) && startSide === 1) {
        gestureMode = "volume";
      } else if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
        gestureMode = "ignore";
      }
      if (gestureMode !== null) clearHoldTimer();
    }
    if (gestureMode !== "brightness" && gestureMode !== "volume") return;
    event.preventDefault();
    const rect = host.getBoundingClientRect();
    if (gestureMode === "brightness") {
      brightness = clamp(startBrightness - deltaY / rect.height, 0.02, 1);
      platform.setBrightness(brightness);
      brightnessFill.style.height = `${brightness * 100}%`;
      brightnessIcon.innerHTML = sunIcon(brightness);
      brightnessHud.style.opacity = "1";
      clearTimeout(brightnessTimer);
      return;
    }

    volume = clamp(startVolume - deltaY / rect.height, 0, 1);
    const targetStep = volumeMax > 0 ? Math.round(volume * volumeMax) : null;
    if (targetStep === null || targetStep !== lastVolumeStep) {
      lastVolumeStep = targetStep ?? lastVolumeStep;
      platform.setVolume?.(volume);
    }
    showVolume(volume);
  };

  const onTouchEnd = (event) => {
    if (!active) return;
    active = false;
    clearHoldTimer();
    if (event.type === "touchcancel") {
      gestureMode = null;
      return;
    }
    const duration = Date.now() - startTime;
    if (gestureMode === "brightness") {
      clearTimeout(brightnessTimer);
      brightnessTimer = setTimeout(() => {
        brightnessHud.style.opacity = "0";
      }, 600);
      return;
    }
    if (gestureMode === "volume") return;
    if (gestureMode === "seek") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (gestureMode === "ignore" || duration >= TAP_DURATION) return;

    // Sinon la WebView fabrique un `click` ensuite.
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (
      startSide !== 0 &&
      now - lastTapTime < DOUBLE_TAP_DELAY &&
      lastTapSide === startSide
    ) {
      clearPendingTap();
      seekBy(startSide > 0 ? 5 : -5);
      platform.haptic?.("light");
      lastTapTime = 0;
      lastTapSide = 0;
    } else {
      clearPendingTap();
      lastTapTime = now;
      lastTapSide = startSide;
      pendingTapTimer = setTimeout(() => {
        pendingTapTimer = null;
        lastTapTime = 0;
        lastTapSide = 0;
        art.controls?.toggle?.();
      }, DOUBLE_TAP_DELAY);
    }
  };

  // Filet contre les clics synthétiques : la capture passe avant le listener d'ArtPlayer.
  const onVideoClickCapture = (event) => {
    if (event.target !== art.video) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };
  const onVideoContextMenuCapture = (event) => {
    if (event.target !== art.video) return;
    event.preventDefault();
    event.stopPropagation();
  };

  host.addEventListener("touchstart", onTouchStart, { passive: true });
  host.addEventListener("touchmove", onTouchMove, { passive: false });
  host.addEventListener("touchend", onTouchEnd, { passive: false });
  host.addEventListener("touchcancel", onTouchEnd, { passive: false });
  host.addEventListener("click", onVideoClickCapture, true);
  host.addEventListener("contextmenu", onVideoContextMenuCapture, true);

  return () => {
    host.removeEventListener("touchstart", onTouchStart);
    host.removeEventListener("touchmove", onTouchMove);
    host.removeEventListener("touchend", onTouchEnd);
    host.removeEventListener("touchcancel", onTouchEnd);
    host.removeEventListener("click", onVideoClickCapture, true);
    host.removeEventListener("contextmenu", onVideoContextMenuCapture, true);
    host.classList.remove("nartya-mobile-player", "nartya-ios");
    clearHoldTimer();
    clearPendingTap();
    clearTimeout(brightnessTimer);
    clearTimeout(volumeTimer);
    unsubscribeVolume?.();
    platform.captureVolumeButtons(false);
    platform.setBrightness(-1);
    art.video?.removeEventListener("play", updatePlayIcon);
    art.video?.removeEventListener("pause", updatePlayIcon);
    art.video?.removeEventListener("playing", updatePlayIcon);
    compositingGuard.remove();
    brightnessHud.remove();
    volumeHud.remove();
    centerCluster.remove();
  };
}

/**
 * Android : PiP natif en quittant l'app pendant la lecture, et bouton PiP. iOS : WebKit refuse le
 * PiP automatique depuis une lecture intégrée ; hors PiP, la sortie de l'app met en pause.
 */
export function setupPictureInPicture(art) {
  const host = art?.template?.$player;
  const video = art?.template?.$video;
  if (!host || !video || typeof document === "undefined") return () => {};
  const disposers = [];
  const listen = (target, event, handler) => {
    target.addEventListener(event, handler);
    disposers.push(() => target.removeEventListener(event, handler));
  };

  const pip = platform.nativePip;
  if (pip) {
    const sync = () =>
      pip.setAuto({
        enabled: !video.paused && !video.ended,
        width: video.videoWidth || 16,
        height: video.videoHeight || 9,
      });
    for (const event of ["playing", "pause", "ended", "loadedmetadata", "emptied"]) {
      listen(video, event, sync);
    }
    disposers.push(
      pip.onChange(({ active, dismissed }) => {
        host.classList.toggle("nartya-pip", !!active);
        // Fenêtre fermée par sa croix : la lecture s'arrête avec elle.
        if (dismissed) art.pause();
      }),
    );
    try {
      art.controls.add({
        name: "native-pip",
        position: "right",
        index: 40,
        html: art.icons.pip.cloneNode(true),
        click: () => void pip.enter(),
      });
    } catch (_) {}
    disposers.push(() => {
      pip.setAuto({ enabled: false });
      host.classList.remove("nartya-pip");
    });
  } else if (platform.os === "ios") {
    // Le mode audio d'arrière-plan, requis par le PiP, laisserait sinon le son continuer.
    listen(document, "visibilitychange", () => {
      if (!document.hidden || video.paused) return;
      if (video.webkitPresentationMode === "picture-in-picture" || document.pictureInPictureElement) return;
      art.pause();
    });
  }

  return () => disposers.forEach((dispose) => dispose());
}
