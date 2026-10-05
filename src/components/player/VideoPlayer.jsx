import { useEffect, useRef, useState } from "react";
import Artplayer from "artplayer";
import Hls from "hls.js";
import {
  createFastStartHlsInstance,
  applyPreferredQuality,
  addQualitySettingToPlayer,
  saveBandwidthEstimate,
  startDecodeWatchdog,
  isHlsUrl,
} from "@/utils/hlsConfig";
import { setupAudioBoost, setAudioBoost, teardownAudioBoost } from "@/utils/audioBoost";
import { findPreferredAudioIndex } from "@/utils/audioTrack";
import { startAnime4k, isAnime4kSupported } from "@/utils/anime4k";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { platform } from "@/platform";
import {
  acquireWakeLock,
  releaseWakeLock,
  setupMobilePlayerControls,
  setupPictureInPicture,
} from "@/utils/mobilePlayer";
import Anime4kWarningModal from "@/components/player/Anime4kWarningModal";
import {
  NEXT_SVG,
  EPISODES_SVG,
  boostSettingOption,
  anime4kSettingOption as buildAnime4kOption,
  languageSettingOption,
  sourceSettingOption,
  syncSetting,
} from "@/components/player/playerMenus";

// Saut natif neutralisé et refait à la main, clampé pour ne jamais atteindre la fin (sinon
// `video:ended` et enchaînement).
Artplayer.SEEK_STEP = 0;
const SEEK_STEP_S = 10;

/**
 * Le HLS est géré à la main (URL proxifiée, sans extension fiable), comme la reprise et la
 * progression. `preferredAudio` : piste recommandée par le serveur, `{ index, lang, name }`.
 */
export default function VideoPlayer({
  videoUrl,
  mediaKey = null,
  title = "",
  poster = "",
  resumeAt = 0,
  preferredAudio = null,
  hasPrev = false,
  hasNext = false,
  episodeLabel = "",
  languages = [],
  language = "vostfr",
  countryOfOrigin = null,
  sources = [],
  sourceId = null,
  // Pour mémoriser le débit par source.
  provider = null,
  showEpisodes = true,
  showNav = true,
  onSourceChange,
  onPrev,
  onNext,
  onTimeUpdate,
  onEnded,
  onReady,
  onError,
  onPause,
  onPlay,
  onPlaybackStart,
  onSeek,
  onPlayerApi,
  // Pour la watch party.
  onStall,
  onStallEnd,
  onLanguageChange,
  onEpisodesEnter,
  onEpisodesLeave,
  onNextPreviewEnter,
  onNextPreviewLeave,
  onOverlayReady,
}) {
  // Le lecteur reste monté entre épisodes : cette clé écarte les événements tardifs de l'ancien média.
  const effectiveMediaKey = mediaKey ?? videoUrl;
  const containerRef = useRef(null);
  const artRef = useRef(null);
  const resumeAtRef = useRef(resumeAt);
  const preferredAudioRef = useRef(preferredAudio);
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const volumeBoost = useSettingsStore((s) => s.volumeBoost);
  const anime4kMode = useSettingsStore((s) => s.anime4kMode);
  const advancedPlayerControls = useSettingsStore((s) => s.advancedPlayerControls);
  const [pendingAnime4k, setPendingAnime4k] = useState(null);
  const [anime4kRevision, setAnime4kRevision] = useState(0);

  useEffect(() => {
    const settings = useSettingsStore.getState();
    if (platform.isMobile) {
      if (settings.anime4kMode !== "off") {
        settings.setSetting("anime4kMode", "off");
      }
      return;
    }
    if (
      !settings.anime4kWarningAcknowledged &&
      settings.anime4kMode !== "off"
    ) {
      settings.setSetting("anime4kMode", "off");
    }
  }, []);
  const infoElRef = useRef(null);
  const langSettingRef = useRef(false);
  const srcSettingRef = useRef(false);

  const anime4kSettingOption = (art, selectedMode) =>
    buildAnime4kOption(art, selectedMode, setPendingAnime4k);

  // Seulement si le runtime expose WebGPU.
  const addAnime4kSetting = (art) => {
    if (
      platform.isMobile ||
      !art ||
      art._anime4kSettingAdded ||
      !isAnime4kSupported()
    ) return;

    try {
      const initMode = useSettingsStore.getState().anime4kMode || "off";
      art.setting.add(anime4kSettingOption(art, initMode));
      art._anime4kSettingAdded = true;
    } catch (e) {
      console.warn("[player] réglage Anime4K indisponible :", e);
    }
  };

  // Les contrôles ArtPlayer, créés une fois, restent à jour.
  const cb = useRef({});
  cb.current = {
    onPrev, onNext, onTimeUpdate, onEnded, onReady, onError, onPause,
    onPlay, onPlaybackStart, onSeek, onPlayerApi, onStall, onStallEnd,
    onLanguageChange, onSourceChange, onEpisodesEnter, onEpisodesLeave, onOverlayReady,
    onNextPreviewEnter, onNextPreviewLeave,
    hasPrev, hasNext, episodeLabel, mediaKey: effectiveMediaKey,
  };
  resumeAtRef.current = resumeAt;
  preferredAudioRef.current = preferredAudio;

  useEffect(() => {
    if (!containerRef.current || artRef.current) return;

    const art = new Artplayer({
      container: containerRef.current,
      url: "",
      title,
      poster,
      // Le boost est appliqué par le GainNode.
      volume: 1,
      autoplay: true,
      // La WebView Android n'a pas le PiP HTML : son bouton passe par le PiP natif.
      pip: platform.os !== "android",
      setting: true,
      playbackRate: true,
      // Sur mobile, le lecteur occupe déjà tout l'écran.
      fullscreen: !platform.isMobile,
      fullscreenWeb: false,
      miniProgressBar: false,
      mutex: true,
      backdrop: true,
      playsInline: true,
      // Sur mobile, notre couche tactile remplace le swipe natif.
      gesture: !platform.isMobile,
      // L'app gère la reprise par épisode, et le plugin est indexé par `option.url`, vide en HLS.
      autoPlayback: false,
      theme: "#FF713E",
      lang: "fr",
      moreVideoAttr: { crossOrigin: "anonymous" },
      controls: [
        {
          name: "episode-info",
          position: "left",
          html: '<span class="art-episode-info"></span>',
          style: {
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            maxWidth: "48%",
          },
          mounted: ($control) => {
            infoElRef.current = $control.querySelector(".art-episode-info");
            if (infoElRef.current) infoElRef.current.textContent = cb.current.episodeLabel || "";
          },
        },
        // Pas de bouton « épisode précédent ».
        ...(showNav
          ? [
              {
                name: "next",
                position: "right",
                index: 7, // à gauche de la liste des épisodes (8)
                html: NEXT_SVG,
                click: () => cb.current.hasNext && cb.current.onNext?.(),
                mounted: ($control) => {
                  if (platform.isMobile) return;
                  $control.addEventListener("mouseenter", () => cb.current.onNextPreviewEnter?.());
                  $control.addEventListener("mouseleave", () => cb.current.onNextPreviewLeave?.());
                },
              },
            ]
          : []),
        ...(showEpisodes
          ? [
              {
                name: "episodes",
                position: "right",
                index: 8, // à gauche de la qualité (10) et des réglages (30)
                html: EPISODES_SVG,
                // Au survol, et au clic pour le tactile.
                click: () => cb.current.onEpisodesEnter?.(),
                mounted: ($control) => {
                  if (platform.isMobile) return;
                  $control.addEventListener("mouseenter", () => cb.current.onEpisodesEnter?.());
                  $control.addEventListener("mouseleave", () => cb.current.onEpisodesLeave?.());
                },
              },
            ]
          : []),
      ],
    });

    artRef.current = art;
    art._loadedMediaKey = null;
    art._switchingSource = true;
    art._endedMediaKey = null;

    const isCurrentMedia = () =>
      !art._switchingSource &&
      art._loadedMediaKey != null &&
      art._loadedMediaKey === cb.current.mediaKey;

    // Celui d'ArtPlayer n'offre rien d'utile : intercepté en capture, avant lui.
    const container = containerRef.current;
    const blockContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    container.addEventListener("contextmenu", blockContextMenu, true);

    art.hotkey.add("KeyF", () => { art.fullscreen = !art.fullscreen; });

    // Plein écran sans changer l'état de lecture : on annule le toggle du premier clic.
    if (!platform.isMobile) art.on("dblclick", () => { art.toggle(); });

    // Indicateur de saut (« +10s », cumulatif)
    const seekHud = (() => {
      const host = art.template?.$player || containerRef.current;
      if (!document.getElementById("nartya-seek-style")) {
        const style = document.createElement("style");
        style.id = "nartya-seek-style";
        style.textContent =
          "@keyframes nartya-chev{0%,75%,100%{opacity:.2}38%{opacity:1}}" +
          ".nartya-seek{position:absolute;top:50%;transform:translateY(-50%);display:flex;" +
          "align-items:center;gap:14px;pointer-events:none;color:#fff;opacity:0;" +
          "transition:opacity .16s ease;z-index:60;filter:drop-shadow(0 2px 6px rgba(0,0,0,.85))}" +
          ".nartya-seek-num{font:800 34px/1 system-ui,sans-serif}" +
          // Recentre les chevrons sur les chiffres.
          ".nartya-seek-chevs{display:flex;transform:translateY(3px)}" +
          ".nartya-seek-chevs svg{width:26px;height:26px;animation:nartya-chev .9s infinite;margin:0 -7px}" +
          ".nartya-seek-fwd svg:nth-child(1){animation-delay:0s}" +
          ".nartya-seek-fwd svg:nth-child(2){animation-delay:.12s}" +
          ".nartya-seek-fwd svg:nth-child(3){animation-delay:.24s}" +
          ".nartya-seek-rev svg:nth-child(1){animation-delay:.24s}" +
          ".nartya-seek-rev svg:nth-child(2){animation-delay:.12s}" +
          ".nartya-seek-rev svg:nth-child(3){animation-delay:0s}";
        document.head.appendChild(style);
      }
      const chevs = (fwd) => {
        const d = fwd ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6";
        const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
        return `<div class="nartya-seek-chevs ${fwd ? "nartya-seek-fwd" : "nartya-seek-rev"}">${svg + svg + svg}</div>`;
      };
      const num = (t) => `<span class="nartya-seek-num">${t}s</span>`;
      const make = (side) => {
        const el = document.createElement("div");
        el.className = "nartya-seek";
        el.style[side] = "8%";
        host.appendChild(el);
        return el;
      };
      const right = make("right");
      const left = make("left");
      let dir = 0, total = 0, timer = null;
      const hide = () => { right.style.opacity = "0"; left.style.opacity = "0"; total = 0; dir = 0; };
      const fn = (delta) => {
        const sign = delta > 0 ? 1 : -1;
        if (sign !== dir) { total = 0; dir = sign; }
        total += Math.abs(delta);
        const [el, other] = sign > 0 ? [right, left] : [left, right];
        other.style.opacity = "0";
        el.innerHTML = sign > 0 ? num(total) + chevs(true) : chevs(false) + num(total);
        el.style.opacity = "1";
        clearTimeout(timer);
        timer = setTimeout(hide, 700);
      };
      fn.dispose = () => {
        clearTimeout(timer);
        right.remove();
        left.remove();
      };
      return fn;
    })();
    art._seekHud = seekHud;

    if (platform.isMobile) {
      art._mobileControlsDispose = setupMobilePlayerControls(art);
      art._pipDispose = setupPictureInPicture(art);
    }

    // Jamais au-delà de (durée − 1 s).
    const seekBy = (delta) => {
      const d = art.duration || 0;
      if (!d) return;
      const cur = art.currentTime || 0;
      const target =
        delta > 0 ? Math.min(cur + delta, Math.max(0, d - 1)) : Math.max(cur + delta, 0);
      if (delta > 0 && target <= cur) return;
      art.seek = target;
      seekHud(delta);
    };
    art.hotkey.add("ArrowRight", () => seekBy(SEEK_STEP_S));
    art.hotkey.add("ArrowLeft", () => seekBy(-SEEK_STEP_S));

    // Pas de 5 %.
    const volCtrl = art.template?.$player?.querySelector(".art-control-volume");
    if (volCtrl) {
      volCtrl.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          art.volume = Math.min(1, Math.max(0, art.volume + (e.deltaY < 0 ? 0.05 : -0.05)));
        },
        { passive: false }
      );
    }

    // Pendant un changement de source, les pauses portent un currentTime obsolète.
    art._suppressPause = true;

    art.on("ready", () => {
      setupAudioBoost(art, useSettingsStore.getState().volumeBoost);

      // En ArtPlayer v5, l'ajout dynamique passe par art.setting.add.
      try {
        art.setting.add(boostSettingOption(art));
      } catch (e) {
        console.warn("[player] réglage Boost audio indisponible :", e);
      }

      art._nartyaReady = true;
      addAnime4kSetting(art);

      // Les anciens volumes persistés supposaient un gain permanent.
      try {
        if (!localStorage.getItem("nartya_vol_v3")) {
          art.volume = 1;
          localStorage.setItem("nartya_vol_v3", "1");
        }
      } catch (_) {}
      // Ancré dans l'élément ArtPlayer pour rester visible en plein écran.
      if (!art._overlay) {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:50;";
        (art.template?.$player || art.template?.$art || containerRef.current).appendChild(overlay);
        art._overlay = overlay;
        cb.current.onOverlayReady?.(overlay);
      }
      cb.current.onPlayerApi?.({
        seek: (t) => { try { art.seek = t; } catch (_) {} },
        play: () => { art.play?.()?.catch?.(() => {}); },
        pause: () => { try { art.pause(); } catch (_) {} },
        getCurrentTime: () => art.currentTime || 0,
        getDuration: () => art.duration || 0,
        isPaused: () => !art.playing,
        // Sur la <video> : `art.playbackRate` passe par la liste de vitesses, sans 0.95 ni 1.05.
        setRate: (r) => { try { if (art.video) art.video.playbackRate = r; } catch (_) {} },
        notice: (message) => { try { art.notice.show = message; } catch (_) {} },
      });
      cb.current.onReady?.();
    });
    art.on("video:timeupdate", () => {
      if (!isCurrentMedia()) return;
      cb.current.onTimeUpdate?.(art.currentTime || 0, art.duration || 0);
    });
    art.on("video:playing", () => {
      if (art._loadedMediaKey !== cb.current.mediaKey) return;
      art._switchingSource = false;
      art._suppressPause = false;
      cb.current.onStallEnd?.();
      // Signal fiable qu'une image est à l'écran, autoplay compris.
      cb.current.onPlaybackStart?.();
      if (platform.isMobile) acquireWakeLock();
      // Anime4K est reconstruit depuis les dimensions de la nouvelle source.
      if (!platform.isMobile && art._anime4kMediaKey !== art._loadedMediaKey) {
        art._anime4kMediaKey = art._loadedMediaKey;
        setAnime4kRevision((revision) => revision + 1);
      }
    });
    art.on("video:play", () => {
      if (art._suppressPause || !isCurrentMedia()) return;
      cb.current.onPlay?.(art.currentTime || 0, art.duration || 0);
    });
    art.on("video:seeked", () => {
      if (art._suppressPause || !isCurrentMedia()) return;
      cb.current.onSeek?.(art.currentTime || 0, art.duration || 0);
    });
    // `waiting` part aussi sur un seek : le consommateur temporise.
    art.on("video:waiting", () => {
      if (!isCurrentMedia()) return;
      cb.current.onStall?.();
    });
    art.on("video:canplay", () => {
      if (!isCurrentMedia()) return;
      cb.current.onStallEnd?.();
    });
    art.on("video:ended", () => {
      if (!isCurrentMedia() || art._endedMediaKey === art._loadedMediaKey) return;
      art._endedMediaKey = art._loadedMediaKey;
      if (platform.isMobile) releaseWakeLock();
      cb.current.onEnded?.();
    });
    // Seul chemin d'échec des sources MP4 progressives.
    art.on("video:error", () => {
      if (!art._loadedUrl || !isCurrentMedia()) return; // source absente ou déjà remplacée
      cb.current.onError?.({ fatal: true, reason: "mediaError", details: "videoElementError" });
    });
    art.on("video:pause", () => {
      if (platform.isMobile) releaseWakeLock();
      if (art._suppressPause || !isCurrentMedia()) return;
      cb.current.onPause?.(art.currentTime || 0, art.duration || 0);
    });

    // Desktop uniquement : le masquage natif d'ArtPlayer ne tourne que pendant la lecture.
    if (!platform.isMobile) {
      const PAUSE_HIDE_MS = 3000; // même délai que le masquage natif
      let pauseHideTimer = null;
      const clearPauseHide = () => {
        if (pauseHideTimer) {
          clearTimeout(pauseHideTimer);
          pauseHideTimer = null;
        }
      };
      const armPauseHide = () => {
        clearPauseHide();
        pauseHideTimer = setTimeout(() => {
          if (!art.playing && !art.setting.show && !art.isInput && !art.controls.isHover) {
            art.controls.show = false;
            // ArtPlayer réaffiche son bouton play central à chaque pause.
            art.mask.show = false;
          }
        }, PAUSE_HIDE_MS);
      };
      art.on("video:pause", () => {
        if (!art._suppressPause) armPauseHide();
      });
      art.on("video:play", clearPauseHide);
      // Le mousemove natif ne rétablit que les contrôles, pas le bouton play central.
      art.on("mousemove", () => {
        if (!art.playing) {
          art.controls.show = true;
          art.mask.show = true;
          armPauseHide();
        }
      });
      art._pauseHideDispose = clearPauseHide;

      // En plein écran, le coin bas-gauche est une zone morte : la souris y file sans vouloir le HUD.
      const CORNER_PX = 32;
      const onDocumentMouseMove = (event) => {
        if (!art.fullscreen || !art.controls.show || art.controls.isHover) return;
        const nearBottomLeft =
          event.clientX <= CORNER_PX && event.clientY >= window.innerHeight - CORNER_PX;
        if (nearBottomLeft) {
          clearPauseHide();
          art.controls.show = false;
          art.mask.show = false;
        }
      };
      art.on("document:mousemove", onDocumentMouseMove);
    }

    return () => {
      container.removeEventListener("contextmenu", blockContextMenu, true);
      try {
        art._suppressPause = true; // ignore la pause émise par destroy()
        cb.current.onPlayerApi?.(null);
        cb.current.onOverlayReady?.(null);
        art._overlay?.remove();
        art._overlay = null;
        if (platform.isMobile) {
          releaseWakeLock();
          art._mobileControlsDispose?.();
          art._mobileControlsDispose = null;
          art._pipDispose?.();
          art._pipDispose = null;
        }
        teardownAudioBoost(art);
        art._pauseHideDispose?.();
        art._seekHud?.dispose?.();
        art._decodeStop?.();
        art.hls?.destroy?.();
        art.destroy(); // nettoie le DOM (double lecteur en StrictMode)
      } catch (_) {}
      artRef.current = null;
      art._nartyaReady = false;
      infoElRef.current = null;
      langSettingRef.current = false;
      srcSettingRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (artRef.current) setAudioBoost(artRef.current, volumeBoost);
  }, [volumeBoost]);

  // Sans recréer le lecteur.
  useEffect(() => {
    if (platform.isMobile) return;
    const art = artRef.current;
    if (!art?._anime4kSettingAdded) return;
    if (art.hls) {
      applyPreferredQuality(art.hls);
      addQualitySettingToPlayer(art, art.hls);
    }
    try { art.setting.update(anime4kSettingOption(art, anime4kMode)); } catch (_) {}
  }, [anime4kMode]);

  // La vidéo reste la source de l'audio et de l'horloge.
  useEffect(() => {
    const art = artRef.current;
    if (
      platform.isMobile ||
      !art ||
      !useSettingsStore.getState().anime4kWarningAcknowledged ||
      anime4kMode === "off" ||
      !isAnime4kSupported()
    ) return;
    const host = art.template?.$player;
    if (!host || !art.video) return;

    const handle = startAnime4k(art.video, host, anime4kMode, (err) => {
      // Retour à la lecture normale.
      console.warn("[anime4k] désactivé :", err);
      try { art.notice.show = "Upscale Anime4K indisponible sur cette source"; } catch (_) {}
      try { useSettingsStore.getState().setSetting("anime4kMode", "off"); } catch (_) {}
    });
    return () => handle.stop();
  }, [anime4kMode, anime4kRevision]);

  // Suivie sur l'instance, pas dans un ref : en StrictMode, un ref partagé ferait croire à la
  // seconde instance que la vidéo est déjà chargée.
  useEffect(() => {
    const art = artRef.current;
    if (!art || !videoUrl || art._loadedUrl === videoUrl) return;
    art._switchingSource = true;
    art._loadedUrl = videoUrl;
    art._loadedMediaKey = effectiveMediaKey;
    art._endedMediaKey = null;
    art._anime4kLevel = null;
    art._suppressPause = true; // pauses ignorées jusqu'au prochain « playing »

    const seekToResume = (video) => {
      const target = resumeAtRef.current;
      // Déjà démarré sur la position de reprise.
      if (Math.abs(video.currentTime - target) < 1) return;
      if (target > 2 && video.duration > 0 && target < video.duration - 5) {
        video.currentTime = target;
      }
    };

    if (isHlsUrl(videoUrl) && Hls.isSupported()) {
      art.pause();
      art._decodeStop?.();
      art._decodeStop = null;
      if (art.hls) {
        try { art.hls.destroy(); } catch (_) {}
        art.hls = null;
      }
      const video = art.video;
      if (video.src) video.removeAttribute("src");

      const loadedProvider = providerRef.current;
      // hls.js charge directement le segment de la position voulue.
      const resumeTarget = resumeAtRef.current;
      const hls = createFastStartHlsInstance(
        resumeTarget > 2 ? { startPosition: resumeTarget } : {},
        loadedProvider
      );
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      art.hls = hls;

      hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
        if (data?.stats?.bandwidth > 200_000) {
          saveBandwidthEstimate(data.stats.bandwidth, loadedProvider);
        }
      });

      const selectPreferredAudio = () => {
        const index = findPreferredAudioIndex(hls.audioTracks, preferredAudioRef.current);
        if (index >= 0 && hls.audioTrack !== index) hls.audioTrack = index;
      };
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, selectPreferredAudio);

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const previous = art._anime4kLevel;
        art._anime4kLevel = data.level;
        // Anime4K repart de la nouvelle résolution.
        if (
          !platform.isMobile &&
          previous != null &&
          previous !== data.level &&
          useSettingsStore.getState().anime4kMode !== "off"
        ) {
          setAnime4kRevision((revision) => revision + 1);
        }
        addQualitySettingToPlayer(art, hls);
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        selectPreferredAudio();
        applyPreferredQuality(hls);
        addQualitySettingToPlayer(art, hls);
        art._decodeStop?.();
        art._decodeStop = startDecodeWatchdog(art, hls, {
          // La source ne tient pas le temps réel : échec, pour basculer d'hébergeur.
          onNetworkStarved: () =>
            cb.current.onError?.({ fatal: true, reason: "starved", details: "networkStarved" }),
          // GPU à la peine : on coupe Anime4K avant de baisser la qualité.
          onPerformanceLimited: (reason) => {
            if (useSettingsStore.getState().anime4kMode === "off") return;
            useSettingsStore.getState().setSetting("anime4kMode", "off");
            try { art.notice.show = `Anime4K désactivé (${reason})`; } catch (_) {}
          },
        });
        hls.once(Hls.Events.BUFFER_APPENDED, () => {
          // Tête de lecture placée dès les premières données.
          if (resumeTarget > 2 && video.duration > 0 && resumeTarget < video.duration - 5) {
            video.currentTime = resumeTarget;
          }
          art.play?.()?.catch(() => {});
          const tryResume = () => {
            if (video.readyState >= 2 && video.duration > 0) seekToResume(video);
            else video.addEventListener("canplay", () => seekToResume(video), { once: true });
          };
          setTimeout(tryResume, 100);
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) {
          if (data.details === "bufferStalledError") {
            try { hls.startLoad(); } catch (_) {}
          }
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); return; } catch (_) {}
        }
        cb.current.onError?.(data);
      });
    } else {
      // MP4
      const video = art.video;
      const onLoaded = () => seekToResume(video);
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      Promise.resolve(art.switchUrl(videoUrl, title)).catch((e) => cb.current.onError?.(e));
    }
  }, [videoUrl, title, effectiveMediaKey]);

  // Certains masters marquent toutes leurs pistes DEFAULT=NO, et la première n'est pas forcément
  // la bonne langue.
  useEffect(() => {
    const hls = artRef.current?.hls;
    if (!hls) return;
    const index = findPreferredAudioIndex(hls.audioTracks, preferredAudio);
    if (index >= 0 && hls.audioTrack !== index) hls.audioTrack = index;
  }, [preferredAudio]);

  useEffect(() => {
    if (infoElRef.current) infoElRef.current.textContent = episodeLabel || "";
  }, [episodeLabel]);

  // Seulement s'il y a un choix.
  useEffect(() => {
    const art = artRef.current;
    if (!art?.setting) return;
    if (platform.isMobile) return;
    try {
      const option =
        languages.length > 1
          ? languageSettingOption({
              languages,
              language,
              countryOfOrigin,
              onChange: (value) => cb.current.onLanguageChange?.(value),
            })
          : null;
      syncSetting(art, "language", option, langSettingRef);
    } catch (e) {
      console.warn("[player] menu Langue non mis à jour :", e);
    }
  }, [languages, language, countryOfOrigin]);

  // À partir de deux sources, contrôles avancés activés.
  useEffect(() => {
    const art = artRef.current;
    if (!art?.setting) return;
    try {
      const option =
        sources.length > 1 && advancedPlayerControls
          ? sourceSettingOption({
              sources,
              sourceId,
              onChange: (value) => cb.current.onSourceChange?.(value),
            })
          : null;
      syncSetting(art, "sources", option, srcSettingRef);
    } catch (e) {
      console.warn("[player] menu Source non mis à jour :", e);
    }
  }, [sources, sourceId, advancedPlayerControls]);

  return (
    <>
      <div ref={containerRef} className="h-full min-h-0 w-full max-w-full overflow-hidden" />
      {!platform.isMobile && pendingAnime4k && (
        <Anime4kWarningModal
          mode={pendingAnime4k.mode}
          sourceWidth={pendingAnime4k.sourceWidth}
          sourceHeight={pendingAnime4k.sourceHeight}
          onCancel={() => setPendingAnime4k(null)}
          onConfirm={() => {
            const mode = pendingAnime4k.mode;
            setPendingAnime4k(null);
            const settings = useSettingsStore.getState();
            settings.setSetting("anime4kWarningAcknowledged", true);
            settings.setSetting("anime4kMode", mode);
          }}
        />
      )}
    </>
  );
}
