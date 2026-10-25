import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

/**
 * Panneau de diagnostic du lecteur, en développement seulement (monté par WatchPage sous
 * `import.meta.env.DEV`). Dit quelle source tourne vraiment et si elle tient le débit.
 *
 * « Marge » = secondes de vidéo téléchargées par seconde écoulée, la métrique des bancs
 * d'essai : sous ~1,5× le tampon ne se remplit jamais. En HLS elle vient des segments
 * chargés ; en MP4, de la croissance du tampon (approximative : Chromium cesse de
 * télécharger quand il juge le tampon assez plein).
 */

const FRAG_WINDOW = 12;
const STORAGE_KEY = "nartya_dev_stats_collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function bufferAhead(video) {
  if (!video) return 0;
  const t = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= t + 0.25 && video.buffered.end(i) >= t) {
      return video.buffered.end(i) - t;
    }
  }
  return 0;
}

const mbps = (bits) => (Number.isFinite(bits) && bits > 0 ? `${(bits / 1e6).toFixed(2)} Mb/s` : "—");

function marginTone(m) {
  if (!Number.isFinite(m)) return "text-white/60";
  if (m >= 3) return "text-emerald-400";
  if (m >= 1.5) return "text-amber-300";
  return "text-red-400";
}

export default function DevStatsOverlay({ getMedia, videoUrl, source, episodeLabel, language }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [stats, setStats] = useState(null);
  const fragsRef = useRef([]);
  const hlsRef = useRef(null);
  const videoRef = useRef(null);
  const startRef = useRef(performance.now());
  const firstFrameRef = useRef(null);
  const stallsRef = useRef(0);
  const mp4SampleRef = useRef(null);

  // Remise à zéro à chaque nouveau flux (épisode suivant, changement de source).
  useEffect(() => {
    fragsRef.current = [];
    startRef.current = performance.now();
    firstFrameRef.current = null;
    stallsRef.current = 0;
    mp4SampleRef.current = null;
  }, [videoUrl]);

  useEffect(() => {
    const onFrag = (_, data) => {
      const st = data?.frag?.stats || data?.stats;
      const loadMs = st?.loading ? st.loading.end - st.loading.start : 0;
      const bytes = st?.loaded || st?.total || 0;
      const duration = data?.frag?.duration || 0;
      if (!loadMs || !bytes || !duration) return;
      const frags = fragsRef.current;
      frags.push({ duration, bytes, loadMs, level: data.frag.level });
      if (frags.length > FRAG_WINDOW) frags.shift();
    };
    const onPlaying = () => {
      if (firstFrameRef.current == null) {
        firstFrameRef.current = Math.round(performance.now() - startRef.current);
      }
    };
    const onWaiting = () => {
      if (firstFrameRef.current != null) stallsRef.current += 1;
    };

    const attach = () => {
      const { video, hls } = getMedia?.() || {};
      if (hls !== hlsRef.current) {
        hlsRef.current?.off?.(Hls.Events.FRAG_LOADED, onFrag);
        hls?.on?.(Hls.Events.FRAG_LOADED, onFrag);
        hlsRef.current = hls || null;
      }
      if (video !== videoRef.current) {
        videoRef.current?.removeEventListener("playing", onPlaying);
        videoRef.current?.removeEventListener("waiting", onWaiting);
        video?.addEventListener("playing", onPlaying);
        video?.addEventListener("waiting", onWaiting);
        videoRef.current = video || null;
      }
      return { video, hls };
    };

    const tick = () => {
      const { video, hls } = attach();
      if (!video) return setStats(null);

      const frags = fragsRef.current;
      const sum = (k) => frags.reduce((a, f) => a + f[k], 0);
      const fragSeconds = sum("duration");
      const fragLoadSeconds = sum("loadMs") / 1000;
      const fragBytes = sum("bytes");

      const level = hls && hls.currentLevel >= 0 ? hls.levels?.[hls.currentLevel] : null;
      const quality = video.getVideoPlaybackQuality?.();
      const ahead = bufferAhead(video);

      // MP4 : vitesse de remplissage du tampon, en secondes de vidéo par seconde.
      let mp4Margin = null;
      if (!hls && video.buffered.length) {
        const end = video.buffered.end(video.buffered.length - 1);
        const now = performance.now();
        const prev = mp4SampleRef.current;
        if (prev && now - prev.at > 0 && end >= prev.end) {
          mp4Margin = (end - prev.end) / ((now - prev.at) / 1000);
        }
        mp4SampleRef.current = { end, at: now };
      }

      setStats({
        kind: hls ? "HLS" : "MP4",
        width: video.videoWidth,
        height: video.videoHeight,
        levelHeight: level?.height || null,
        levelBitrate: level?.bitrate || null,
        levels: hls?.levels?.map((l) => l.height).filter(Boolean) || [],
        autoLevel: hls ? hls.autoLevelEnabled : null,
        estimate: hls?.bandwidthEstimate || null,
        realBitrate: fragSeconds ? (fragBytes * 8) / fragSeconds : null,
        throughput: fragLoadSeconds ? (fragBytes * 8) / fragLoadSeconds : null,
        margin: hls ? (fragLoadSeconds ? fragSeconds / fragLoadSeconds : null) : mp4Margin,
        lastFragMs: frags.length ? Math.round(frags[frags.length - 1].loadMs) : null,
        frags: frags.length,
        ahead,
        dropped: quality?.droppedVideoFrames ?? null,
        totalFrames: quality?.totalVideoFrames ?? null,
        firstFrame: firstFrameRef.current,
        stalls: stallsRef.current,
        rate: video.playbackRate,
      });
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      hlsRef.current?.off?.(Hls.Events.FRAG_LOADED, onFrag);
      videoRef.current?.removeEventListener("playing", onPlaying);
      videoRef.current?.removeEventListener("waiting", onWaiting);
      hlsRef.current = null;
      videoRef.current = null;
    };
  }, [getMedia]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* stockage indisponible : l'état reste local à la session */
      }
      return !c;
    });
  };

  const host = source?.host || "?";
  const origin = source?.origin || "?";

  return (
    <div className="pointer-events-auto absolute left-5 top-16 z-[54] w-[300px] select-text bg-black/75 font-mono text-[11px] leading-[1.45] text-white/90 shadow-lg backdrop-blur-sm">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between border-b border-white/10 px-2.5 py-1.5 text-left text-[10px] uppercase tracking-wider text-white/60 hover:text-white"
      >
        <span>
          Debug · {source?.label || "source ?"} · {host}
        </span>
        <span>{collapsed ? "+" : "–"}</span>
      </button>
      {!collapsed && (
        <div className="space-y-0.5 px-2.5 py-2">
          <Row k="Origine" v={`${origin} · lecteur ${source?.lecteur || "?"}`} />
          <Row k="Épisode" v={`${episodeLabel || "?"} · ${language || "?"}`} />
          <Row k="Résolution jeton" v={source?.resolveMs != null ? `${source.resolveMs} ms` : "—"} />
          <Row k="1re image" v={stats?.firstFrame != null ? `${stats.firstFrame} ms` : "…"} />
          <Sep />
          <Row k="Format" v={stats?.kind || "—"} />
          <Row
            k="Image"
            v={stats?.width ? `${stats.width}×${stats.height}` : "—"}
          />
          {stats?.kind === "HLS" && (
            <>
              <Row
                k="Niveau"
                v={
                  stats.levelHeight
                    ? `${stats.levelHeight}p · ${mbps(stats.levelBitrate)} annoncé${stats.autoLevel ? " · auto" : ""}`
                    : "—"
                }
              />
              <Row k="Niveaux dispo" v={stats.levels.length ? stats.levels.join(" / ") : "—"} />
              <Row k="Bitrate réel" v={mbps(stats.realBitrate)} />
              <Row k="Débit CDN" v={mbps(stats.throughput)} />
              <Row k="Estimation ABR" v={mbps(stats.estimate)} />
              <Row
                k="Dernier segment"
                v={stats.lastFragMs != null ? `${stats.lastFragMs} ms (${stats.frags} mesurés)` : "—"}
              />
            </>
          )}
          <Row
            k="Marge temps réel"
            v={
              Number.isFinite(stats?.margin)
                ? `×${stats.margin.toFixed(1)}${stats.kind === "MP4" ? " ≈" : ""}`
                : "—"
            }
            tone={marginTone(stats?.margin)}
          />
          <Sep />
          <Row k="Tampon" v={stats ? `${stats.ahead.toFixed(1)} s` : "—"} />
          <Row k="Calages" v={stats ? String(stats.stalls) : "—"} tone={stats?.stalls ? "text-amber-300" : undefined} />
          <Row
            k="Images perdues"
            v={stats?.totalFrames ? `${stats.dropped} / ${stats.totalFrames}` : "—"}
          />
          {stats?.rate && stats.rate !== 1 && <Row k="Vitesse" v={`×${stats.rate}`} />}
        </div>
      )}
    </div>
  );
}

function Row({ k, v, tone }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-white/50">{k}</span>
      <span className={`truncate text-right ${tone || ""}`}>{v}</span>
    </div>
  );
}

function Sep() {
  return <div className="my-1 border-t border-white/10" />;
}
