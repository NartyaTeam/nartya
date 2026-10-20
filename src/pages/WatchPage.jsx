import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { getAnimePage, getSeasonEpisodes } from "@/api/animeApi";
import {
  getEpisodeVideoUrl,
  episodesCacheKey,
  EPISODES_TTL_MS,
} from "@/utils/episodeVideoUtils";
import {
  hasPlayableSources,
  sortSourcesForDisplay,
  sourceOptionLabel,
} from "@/utils/videoSourceUtils";
import { getEpisodeProgress, getAnimeProgressMap, episodeKey, heartbeatWatch, watchTick, COMPLETION_THRESHOLD } from "@/api/progress";
import { celebrateAchievements, useAchievementUnlockStore } from "@/stores/useAchievementUnlockStore";
import { useCachedResource } from "@/hooks/useCachedResource";
import { useDiscordPresence } from "@/hooks/useDiscordPresence";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useListsStore } from "@/stores/useListsStore";
import { downloadId, getLocalPlaybackUrl } from "@/api/downloads";
import { logClientEvent } from "@/api/clientLogs";
import { toast } from "@/lib/toast";
import VideoPlayer from "@/components/player/VideoPlayer";
import { EpisodeSelector } from "@/components/player/EpisodeSelector";
import { NextEpisodePreview } from "@/components/player/NextEpisodePreview";
import { EpisodeSelectorMobile } from "@/components/player/EpisodeSelectorMobile";
import CastControls from "@/components/player/CastControls";
import { platform } from "@/platform";
import { useProgressSaver } from "@/hooks/useProgressSaver";
import { useContentWarning } from "@/hooks/useContentWarning";
import { useSkipSegments } from "@/hooks/useSkipSegments";
import { useCastFallback } from "@/hooks/useCastFallback";
import { sortSeasonsForDisplay } from "@/utils/seasonSort";
import {
  AutoSkipBadge,
  ContentWarning,
  FallbackBackButton,
  NextEpisodeCountdown,
  OverlayBackButton,
  PostCreditNotice,
  SkipSegmentButton,
  WatchError,
  WatchLoading,
} from "@/components/player/WatchOverlays";

// Avant la fin, apparition de la carte « épisode suivant ».
const AUTOSKIP_WINDOW = 10;

// Avant de classer l'anime « En cours » ou l'épisode terminé.
const WATCH_STARTED_MIN_SECONDS = 120;

// Avant la fin, résolution de la source de l'épisode suivant.
const PREFETCH_LEAD_S = 45;

// Saisons « numérotées » (`saison2`, `saga3`) : les seules vers lesquelles on enchaîne.
const REGULAR_SEASON = /^(saisons?|sagas?)\d+/i;

// Le serveur ne crédite que le temps réel écoulé.
const HEARTBEAT_INTERVAL_MS = 60_000;

export default function WatchPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? null;
  const autoSkip = useSettingsStore((s) => s.autoSkip);
  const skipButtonEnabled = useSettingsStore((s) => s.skipButtonEnabled);
  const autoSkipOpEd = useSettingsStore((s) => s.autoSkipOpEd);
  const liteMode = useSettingsStore((s) => s.liteMode);
  const ensureTracking = useListsStore((s) => s.ensureTracking);
  const completeAnime = useListsStore((s) => s.completeAnime);

  // Le lecteur suit le sens du téléphone ; la navigation reste en portrait.
  useEffect(() => {
    if (!platform.isMobile) return undefined;
    platform.setOrientation("player");
    return () => platform.setOrientation("portrait");
  }, []);

  const seasonId = params.get("season");
  // Pas de `|| 1` : certains prologues sont numérotés 0.
  const epParam = params.get("ep");
  const epNumber = epParam && Number.isFinite(Number(epParam)) ? Number(epParam) : 1;
  const lang = params.get("lang") || "vostfr";
  const source = params.get("src") || "auto";
  // local=1, ou épisode déjà téléchargé.
  const localMode = params.get("local") === "1";
  const localItem = useDownloadsStore(
    (s) => s.byId[downloadId(slug, seasonId, epNumber, lang)]
  );
  // Entrée « done » dont le fichier a disparu : erreur hors ligne, streaming en ligne.
  const [localUnavailable, setLocalUnavailable] = useState(false);
  const playLocal = (localMode || localItem?.status === "done") && !localUnavailable;

  // Distincte de `anime:${slug}` (AnimePage) : les deux loaders renvoient des formes différentes.
  const { data: animeData } = useCachedResource(
    slug ? `watch-meta:${slug}` : null,
    () => getAnimePage(slug),
    10 * 60 * 1000
  );
  const animeTitle =
    animeData?.anime?.title?.trim() || animeData?.anilist?.title || localItem?.animeTitle || slug;
  const animeCover =
    animeData?.images?.poster || animeData?.anime?.image || animeData?.anilist?.cover || "";

  // Même clé que la fiche : la liste est déjà là en arrivant d'un clic sur un épisode.
  const { data: epData } = useCachedResource(
    slug && seasonId ? episodesCacheKey(slug, seasonId, liteMode) : null,
    () => getSeasonEpisodes(slug, seasonId, { lite: liteMode }),
    EPISODES_TTL_MS
  );
  const episodes = useMemo(() => epData?.episodes || [], [epData]);

  const currentIndex = useMemo(
    () => episodes.findIndex((e) => Number(e.episode ?? e.number) === epNumber),
    [episodes, epNumber]
  );
  const currentEpisode = currentIndex >= 0 ? episodes[currentIndex] : null;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < episodes.length - 1;

  const seasons = useMemo(() => animeData?.seasons || [], [animeData]);
  const countryOfOrigin = animeData?.anilist?.countryOfOrigin || null;

  // Dernier épisode d'une saison : la suivante (saison ou saga, jamais un film ni un OAV)
  // prend le relais des boutons « suivant ».
  const nextSeason = useMemo(() => {
    if (hasNext || currentIndex < 0 || !REGULAR_SEASON.test(String(seasonId))) return null;
    const ordered = sortSeasonsForDisplay(seasons);
    const index = ordered.findIndex((s) => String(s.id) === String(seasonId));
    const candidate = index >= 0 ? ordered[index + 1] : null;
    return candidate && REGULAR_SEASON.test(String(candidate.id)) ? candidate : null;
  }, [hasNext, currentIndex, seasons, seasonId]);
  const { data: nextSeasonData } = useCachedResource(
    nextSeason ? episodesCacheKey(slug, nextSeason.id, liteMode) : null,
    () => getSeasonEpisodes(slug, nextSeason.id, { lite: liteMode }),
    EPISODES_TTL_MS
  );
  const nextSeasonFirst = nextSeason ? nextSeasonData?.episodes?.[0] || null : null;
  const goesToNextSeason = !hasNext && !!nextSeasonFirst;
  // Dernier épisode de la dernière saison d'un anime qui ne diffuse plus : terminé. Un film
  // ou un OAV ne compte pas, on peut le voir sans avoir suivi la série.
  const catalogStatus = animeData?.anime?.status || null;
  const airing = catalogStatus
    ? /en\s*cours/i.test(catalogStatus)
    : animeData?.anilist?.status === "RELEASING";
  const isFinale =
    !!animeData &&
    currentIndex >= 0 &&
    !hasNext &&
    !nextSeason &&
    !airing &&
    REGULAR_SEASON.test(String(seasonId));
  const canAdvance = hasNext || goesToNextSeason;
  const nextLabel = goesToNextSeason ? "Saison suivante" : "Épisode suivant";

  const languages = useMemo(() => {
    if (!currentEpisode?.lecteurs) return [];
    return Object.keys(currentEpisode.lecteurs).filter((l) =>
      hasPlayableSources(currentEpisode.lecteurs[l])
    );
  }, [currentEpisode]);

  // Pour basculer à la main.
  const sourceOptions = useMemo(() => {
    const lecteurs = currentEpisode?.lecteurs?.[lang];
    if (!lecteurs) return [];
    return sortSourcesForDisplay(lecteurs).map((source) => ({
      id: source.key,
      label: sourceOptionLabel(source),
    }));
  }, [currentEpisode, lang]);

  // Affiché à partir de deux sources.
  const playerSources = useMemo(
    () => (sourceOptions.length >= 2 ? [{ id: "auto", label: "Auto" }, ...sourceOptions] : []),
    [sourceOptions]
  );

  // Extrait du nom, sinon position dans la liste.
  const seasonNumber = useMemo(() => {
    const m = (epData?.seasonName || "").match(/\d+/);
    if (m) return m[0];
    const idx = seasons.findIndex((s) => String(s.id) === String(seasonId));
    return idx >= 0 ? idx + 1 : 1;
  }, [epData, seasons, seasonId]);

  const episodeLabel = currentEpisode
    ? `S${seasonNumber} EP${epNumber}${currentEpisode.title ? ` — ${currentEpisode.title}` : ""}`
    : "";

  useDiscordPresence(
    {
      type: "watching",
      animeTitle,
      animeSlug: slug,
      episodeNumber: epNumber,
      seasonNumber,
      episodeTitle: currentEpisode?.title,
    },
    [animeTitle, slug, epNumber, seasonNumber, currentEpisode?.title]
  );

  const [videoUrl, setVideoUrl] = useState(null);
  // Compartiment de la mémoire de débit du lecteur.
  const [usedSourceKey, setUsedSourceKey] = useState(null);
  // Plantées en cours de lecture sur cet épisode.
  const [failedSources, setFailedSources] = useState(() => new Set());
  const [resumeAt, setResumeAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryToken, setRetryToken] = useState(0);
  const [overlayNode, setOverlayNode] = useState(null);
  // Jamais démonté entre épisodes : le navigateur quitterait le plein écran à chaque changement.
  const [playerMounted, setPlayerMounted] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [progressMap, setProgressMap] = useState({});
  // null = carte masquée
  const [skipRemaining, setSkipRemaining] = useState(null);

  // Sans params : première saison, premier épisode.
  useEffect(() => {
    if (!animeData || seasonId) return;
    const firstSeason = animeData.seasons?.[0];
    if (!firstSeason) return;
    const next = new URLSearchParams(params);
    next.set("season", String(firstSeason.id));
    if (!params.get("ep")) next.set("ep", "1");
    setParams(next, { replace: true });
  }, [animeData, seasonId, params, setParams]);

  // Pour les barres du sélecteur.
  useEffect(() => {
    if (!userId || !slug) return setProgressMap({});
    getAnimeProgressMap(slug).then(setProgressMap).catch(() => {});
  }, [userId, slug, epNumber, seasonId]);

  const positionRef = useRef({ time: 0, duration: 0 });
  // Après un changement de langue : la progression est stockée par langue.
  const carryOverResumeRef = useRef(null);
  const lastBeatRef = useRef(0);
  // Un seul enchaînement ; mémorise un éventuel « annuler ».
  const advancedRef = useRef(false);
  const skipDismissedRef = useRef(false);
  const advanceFnRef = useRef(null);
  const prefetchedRef = useRef(null);
  // Les erreurs en rafale d'un flux mourant disqualifieraient toutes les sources restantes.
  const usedSourceRef = useRef(null);
  const fallbackLockRef = useRef(false);
  const playerApiRef = useRef(null);
  // Une fois par anime.
  const trackedRef = useRef(null);
  // Une fois par épisode final.
  const finaleMarkedRef = useRef(null);
  // Une coupure (réseau, suspension iOS, proxy local relancé) ne condamne pas la source : elle
  // est relancée une fois à la même position avant d'être disqualifiée.
  const retriedSourcesRef = useRef(new Set());
  const forceRefreshRef = useRef(false);
  // Relance arrivée app masquée : elle part au retour, proxy éprouvé.
  const retryOnReturnRef = useRef(false);

  // Même référence s'il n'y a rien à effacer : un Set neuf relancerait une extraction complète.
  const clearFailedSources = useCallback(() => {
    fallbackLockRef.current = false;
    retriedSourcesRef.current = new Set();
    setFailedSources((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const prefetchNext = useCallback(() => {
    if (!hasNext) return;
    const nextIndex = currentIndex + 1;
    if (prefetchedRef.current === nextIndex) return;
    const nextEp = episodes[nextIndex];
    if (!nextEp) return;
    prefetchedRef.current = nextIndex;
    getEpisodeVideoUrl(slug, seasonId, nextIndex, lang, {
      episode: nextEp,
      episodes,
      selectedSource: source,
    }).catch(() => {});
  }, [hasNext, currentIndex, episodes, slug, seasonId, lang, source]);

  const { saveProgress, flushBeforeNav, lastSaveRef } = useProgressSaver(positionRef, {
    userId,
    slug,
    seasonId,
    epNumber,
    lang,
    animeTitle,
    animeCover,
  });
  const skip = useSkipSegments({
    slug,
    seasonId,
    epNumber,
    lang,
    currentEpisode,
    autoSkip,
    autoSkipOpEd,
    hasNext: canAdvance,
    playerApiRef,
    advanceFnRef,
  });
  const updateSkipSegments = skip.update;
  const contentWarning = useContentWarning(
    animeData?.anilist?.genres,
    slug,
    `${seasonId}|${epNumber}|${lang}`
  );

  // Fichier local, sans extraction ni catalogue.
  useEffect(() => {
    if (!playLocal) return;
    let cancelled = false;
    // `playLocal` peut passer à `true` sans action (téléchargement terminé en fond).
    const { time: carryTime, duration: carryDuration } = positionRef.current;
    if (carryTime > 1) {
      if (carryDuration > 0) saveProgress(carryTime, carryDuration, { force: true });
      carryOverResumeRef.current = carryTime;
    }
    setLoading(true);
    setError(null);
    setVideoUrl(null);
    playerApiRef.current?.pause?.();
    (async () => {
      const id = downloadId(slug, seasonId, epNumber, lang);
      // video.mp4 ou playlist.m3u8, selon la source.
      const url = await getLocalPlaybackUrl(id, localItem?.file || "video.mp4");
      if (cancelled) return;
      if (url) {
        let resume = 0;
        if (carryOverResumeRef.current != null) {
          resume = carryOverResumeRef.current;
          carryOverResumeRef.current = null;
        } else if (userId) {
          try {
            const prog = await getEpisodeProgress(slug, seasonId, epNumber, lang, userId);
            if (!cancelled && prog && !prog.completed) resume = prog.positionSeconds || 0;
          } catch (_) {}
        }
        if (cancelled) return;
        setResumeAt(resume);
        setVideoUrl(url);
        setLoading(false);
      } else if (localMode) {
        setError("Fichier hors ligne introuvable. Il a peut-être été supprimé.");
        setLoading(false);
      } else {
        // En ligne : streaming.
        setLocalUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playLocal, localMode, slug, seasonId, epNumber, lang, localItem?.file, userId, saveProgress]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden || !retryOnReturnRef.current) return;
      retryOnReturnRef.current = false;
      setRetryToken((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    setLocalUnavailable(false);
    retryOnReturnRef.current = false;
    clearFailedSources();
    usedSourceRef.current = null;
    advancedRef.current = false;
    skipDismissedRef.current = false;
    prefetchedRef.current = null;
    lastBeatRef.current = 0;
    setSkipRemaining(null);
  }, [slug, seasonId, epNumber, lang, clearFailedSources]);

  useEffect(() => {
    if (playLocal) return; // géré par l'effet de lecture locale
    if (!episodes.length || currentIndex < 0 || !currentEpisode) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVideoUrl(null);
    // L'ancien épisode est mis en pause pendant la résolution.
    playerApiRef.current?.pause?.();

    (async () => {
      // En parallèle de l'extraction.
      let resumeLookup;
      if (carryOverResumeRef.current != null) {
        // Changement de langue : on reprend à la position courante.
        resumeLookup = carryOverResumeRef.current;
        carryOverResumeRef.current = null;
      } else {
        resumeLookup = getEpisodeProgress(slug, seasonId, epNumber, lang, userId)
          .then((prog) => (prog && !prog.completed ? prog.positionSeconds || 0 : 0))
          .catch(() => 0);
      }

      const forceRefresh = forceRefreshRef.current;
      forceRefreshRef.current = false;
      const [resume, result] = await Promise.all([
        resumeLookup,
        getEpisodeVideoUrl(slug, seasonId, currentIndex, lang, {
          episode: currentEpisode,
          episodes,
          selectedSource: source,
          excludeKeys: [...failedSources],
          forceRefresh,
        }),
      ]);
      if (cancelled) return;
      // Avant l'URL : le lecteur démarre directement dessus.
      setResumeAt(resume);

      if (result.success) {
        usedSourceRef.current = result.usedSource;
        setUsedSourceKey(result.usedSourceKey || null);
        setVideoUrl(result.videoUrl);
        // La bascule est réarmée.
        fallbackLockRef.current = false;
      } else {
        setError(result.error || "Impossible de charger cette source.");
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [playLocal, slug, seasonId, epNumber, lang, source, currentIndex, currentEpisode, episodes, retryToken, userId, failedSources]);

  useEffect(() => {
    if (videoUrl) setPlayerMounted(true);
  }, [videoUrl]);

  // Les succès suivent le réglage « Succès pendant la lecture » tant qu'un épisode tourne.
  const setAchievementsInPlayback = useAchievementUnlockStore((s) => s.setInPlayback);
  useEffect(() => {
    if (videoUrl) setAchievementsInPlayback(true);
  }, [videoUrl, setAchievementsInPlayback]);
  useEffect(() => () => setAchievementsInPlayback(false), [setAchievementsInPlayback]);

  const handleTimeUpdate = useCallback(
    (time, duration) => {
      positionRef.current = { time, duration };
      // Après un engagement réel, pas au chargement de la source.
      if (
        userId &&
        slug &&
        trackedRef.current !== slug &&
        (time >= WATCH_STARTED_MIN_SECONDS ||
          (duration > 0 && (time / duration) * 100 >= COMPLETION_THRESHOLD))
      ) {
        trackedRef.current = slug;
        ensureTracking(slug, { title: animeTitle, cover: animeCover });
      }
      if (
        userId &&
        isFinale &&
        duration > 0 &&
        (time / duration) * 100 >= COMPLETION_THRESHOLD &&
        finaleMarkedRef.current !== `${slug}:${seasonId}:${epNumber}`
      ) {
        finaleMarkedRef.current = `${slug}:${seasonId}:${epNumber}`;
        completeAnime(slug, { title: animeTitle, cover: animeCover }).then((changed) => {
          if (changed) toast.success(`${animeTitle} est rangé dans tes animes terminés.`);
        });
      }
      // Cadencé à l'horloge murale.
      if (userId && Date.now() - lastBeatRef.current >= HEARTBEAT_INTERVAL_MS) {
        lastBeatRef.current = Date.now();
        if (seasonId && Number.isFinite(epNumber) && duration > 0 && time > 1) {
          lastSaveRef.current = Date.now(); // réarme le filet
          // Dénominateurs du « réellement vu » et de « saison terminée » : le serveur ne connaît pas
          // le catalogue.
          watchTick({
            slug,
            seasonId,
            episodeNumber: epNumber,
            language: lang,
            positionSeconds: time,
            duration,
            title: animeTitle,
            cover: animeCover,
            seasonTotal: episodes.length,
            userId,
          }).then(celebrateAchievements);
        } else {
          // Durée inconnue : seul le temps de visionnage est crédité.
          heartbeatWatch(episodeKey(slug, seasonId, epNumber, lang), duration);
        }
      }
      const remaining = duration - time;
      if (hasNext && duration > 0 && remaining <= PREFETCH_LEAD_S) prefetchNext();

      updateSkipSegments(time, duration);

      // À la fin du décompte, on enchaîne.
      const inWindow =
        autoSkip && canAdvance && duration > 0 && !skipDismissedRef.current && remaining <= AUTOSKIP_WINDOW;
      if (inWindow && remaining > 0.3) {
        setSkipRemaining(remaining);
      } else {
        if (inWindow && remaining <= 0.3) advanceFnRef.current?.();
        setSkipRemaining(null);
      }
    },
    // Sa longueur est le total de saison envoyé au battement.
    [
      hasNext,
      canAdvance,
      prefetchNext,
      updateSkipSegments,
      autoSkip,
      userId,
      slug,
      seasonId,
      epNumber,
      lang,
      episodes,
      animeTitle,
      animeCover,
      ensureTracking,
      completeAnime,
      isFinale,
      lastSaveRef,
    ]
  );

  // Pause = point de sauvegarde.
  const handlePause = useCallback(
    (time, duration) => {
      positionRef.current = { time, duration };
      saveProgress(time, duration);
    },
    [saveProgress]
  );

  const goToEpisode = useCallback(
    (index) => {
      const target = episodes[index];
      if (!target) return;
      flushBeforeNav();
      const next = new URLSearchParams(params);
      next.set("ep", String(target.episode ?? target.number));
      // Changer d'épisode n'empile pas d'entrée d'historique.
      setParams(next, { replace: true });
    },
    [episodes, params, setParams, flushBeforeNav]
  );

  // Cet épisode et les suivants (`lang` reste dans l'URL).
  const changeLanguage = useCallback(
    (newLang) => {
      if (!newLang || newLang === lang) return;
      // Avant le flush, qui remet à 0.
      const { time } = positionRef.current;
      if (time > 1) carryOverResumeRef.current = time;
      flushBeforeNav();
      const next = new URLSearchParams(params);
      next.set("lang", newLang);
      next.set("src", "auto"); // les sources diffèrent d'une langue à l'autre
      setParams(next, { replace: true });
    },
    [lang, params, setParams, flushBeforeNav]
  );

  // Même épisode : on reprend à la position courante.
  const changeSource = useCallback(
    (newId) => {
      if (!newId || newId === source) return;
      const { time } = positionRef.current;
      if (time > 1) carryOverResumeRef.current = time;
      flushBeforeNav();
      // Choix explicite : une source disqualifiée retrouve sa chance.
      clearFailedSources();
      const next = new URLSearchParams(params);
      next.set("src", newId);
      setParams(next, { replace: true });
    },
    [source, params, setParams, flushBeforeNav, clearFailedSources]
  );

  // L'URL était valide, c'est la lecture qui lâche : la source est disqualifiée et la résolution
  // relancée sur les restantes, à la même position.
  const handlePlaybackError = useCallback(() => {
    if (playLocal) {
      setError("La lecture du fichier hors ligne a échoué.");
      return;
    }
    const failedKey = usedSourceRef.current;
    if (!failedKey || fallbackLockRef.current) return;
    fallbackLockRef.current = true;

    if (!retriedSourcesRef.current.has(failedKey)) {
      retriedSourcesRef.current.add(failedKey);
      const { time } = positionRef.current;
      if (time > 1) carryOverResumeRef.current = time;
      // Le lien de l'hébergeur a pu expirer : nouvelle extraction.
      forceRefreshRef.current = true;
      if (document.hidden) {
        retryOnReturnRef.current = true;
      } else {
        playerApiRef.current?.notice?.("Connexion perdue — reprise de la lecture…");
        setRetryToken((t) => t + 1);
      }
      return;
    }

    const label = sourceOptions.find((s) => s.id === failedKey)?.label || "La source";
    const remaining = sourceOptions.filter(
      (s) => s.id !== failedKey && !failedSources.has(s.id)
    ).length;
    if (remaining === 0) {
      // Plus rien à essayer : journalisé pour le support.
      logClientEvent("player_failed", {
        message: "Toutes les sources ont échoué en cours de lecture",
        detail: {
          slug,
          season: seasonId,
          episode: epNumber,
          language: lang,
          lastSource: failedKey,
          exhausted: [...failedSources, failedKey],
        },
      });
      setError("Toutes les sources de cet épisode ont échoué. Réessaie dans un moment.");
      setLoading(false);
      return;
    }

    const { time } = positionRef.current;
    if (time > 1) carryOverResumeRef.current = time;
    playerApiRef.current?.notice?.(`${label} indisponible — bascule sur une autre source…`);
    setFailedSources((prev) => new Set(prev).add(failedKey));
  }, [playLocal, sourceOptions, failedSources, slug, seasonId, epNumber, lang]);

  const selectFromSelector = useCallback(
    (targetSeasonId, targetEpNumber) => {
      flushBeforeNav();
      const next = new URLSearchParams(params);
      next.set("season", String(targetSeasonId));
      next.set("ep", String(targetEpNumber));
      if (String(targetSeasonId) !== String(seasonId)) next.set("src", "auto");
      setParams(next, { replace: true });
      setShowSelector(false);
    },
    [params, setParams, seasonId, flushBeforeNav]
  );

  // Épisode suivant, ou premier épisode de la saison suivante en fin de saison.
  const goNext = useCallback(() => {
    // Changement d'épisode = fin de celui-ci, pour les succès mis de côté.
    setAchievementsInPlayback(false);
    if (hasNext) goToEpisode(currentIndex + 1);
    else if (goesToNextSeason) {
      selectFromSelector(nextSeason.id, nextSeasonFirst.episode ?? nextSeasonFirst.number);
    }
  }, [
    hasNext,
    currentIndex,
    goToEpisode,
    goesToNextSeason,
    nextSeason,
    nextSeasonFirst,
    selectFromSelector,
    setAchievementsInPlayback,
  ]);

  // Une seule fois, jamais après un « annuler ».
  const advanceNext = useCallback(() => {
    if (advancedRef.current || skipDismissedRef.current || !canAdvance) return;
    advancedRef.current = true;
    goNext();
  }, [canAdvance, goNext]);
  advanceFnRef.current = advanceNext;

  const dismissSkip = useCallback(() => {
    skipDismissedRef.current = true;
    setSkipRemaining(null);
  }, []);

  // Seulement si la lecture auto est activée.
  const handleEnded = useCallback(() => {
    // Fin d'épisode : les succès mis de côté peuvent s'afficher.
    setAchievementsInPlayback(false);
    if (autoSkip) advanceNext();
  }, [advanceNext, autoSkip, setAchievementsInPlayback]);

  // Repli sur la fiche si le lecteur a été ouvert en lien direct.
  const goBack = useCallback(() => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(`/anime/${slug}`, { replace: true });
  }, [navigate, slug]);

  // Pour traverser l'espace entre le bouton et le panneau.
  const selectorCloseTimer = useRef(null);
  const openSelector = useCallback(() => {
    clearTimeout(selectorCloseTimer.current);
    setShowSelector(true);
  }, []);
  const scheduleCloseSelector = useCallback(() => {
    clearTimeout(selectorCloseTimer.current);
    selectorCloseTimer.current = setTimeout(() => setShowSelector(false), 200);
  }, []);
  useEffect(() => () => clearTimeout(selectorCloseTimer.current), []);

  // Suit strictement le survol du bouton.
  const [showNextPreview, setShowNextPreview] = useState(false);
  const openNextPreview = useCallback(() => setShowNextPreview(true), []);
  const scheduleCloseNextPreview = useCallback(() => setShowNextPreview(false), []);

  const epLabel = currentEpisode?.title || localItem?.epTitle || `Épisode ${epNumber}`;

  const { castMediaFor, handleCastMediaFailed } = useCastFallback({
    title: `${animeTitle} — ${epLabel}`,
    poster: animeCover,
    videoUrl,
    error,
    playLocal,
    sourceOptions,
    failedSources,
    setFailedSources,
    usedSourceRef,
    carryOverResumeRef,
    playerApiRef,
  });

  // Change à chaque navigation ou résolution, pour que VideoPlayer ignore les événements tardifs.
  const playbackMediaKey = [
    slug,
    seasonId,
    epNumber,
    lang,
    source,
    retryToken,
    [...failedSources].sort().join(","),
    videoUrl || "loading",
  ].join("|");

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {playerMounted && (
        <VideoPlayer
          videoUrl={videoUrl}
          mediaKey={playbackMediaKey}
          title={`${animeTitle} — ${epLabel}`}
          poster=""
          resumeAt={resumeAt}
          hasPrev={hasPrev}
          hasNext={canAdvance}
          episodeLabel={episodeLabel}
          languages={languages}
          language={lang}
          countryOfOrigin={countryOfOrigin}
          sources={playerSources}
          sourceId={source}
          provider={usedSourceKey}
          onSourceChange={changeSource}
          onPrev={() => goToEpisode(currentIndex - 1)}
          onNext={goNext}
          onTimeUpdate={handleTimeUpdate}
          onPause={handlePause}
          onPlaybackStart={contentWarning.onPlay}
          onEnded={handleEnded}
          onError={handlePlaybackError}
          onLanguageChange={changeLanguage}
          onEpisodesEnter={openSelector}
          onEpisodesLeave={scheduleCloseSelector}
          onNextPreviewEnter={openNextPreview}
          onNextPreviewLeave={scheduleCloseNextPreview}
          onOverlayReady={setOverlayNode}
          onPlayerApi={(api) => {
            playerApiRef.current = api;
          }}
        />
      )}

      {/* Dans l'overlay ArtPlayer, donc visibles en plein écran. */}
      {overlayNode &&
        createPortal(
          <>
            <OverlayBackButton onClick={goBack} />

            <div className="art-back-btn absolute right-5 top-5 z-[55]">
              <CastControls
                getMedia={() => (videoUrl ? castMediaFor(videoUrl) : null)}
                getCurrentTime={() => playerApiRef.current?.getCurrentTime?.() || 0}
                onMediaFailed={handleCastMediaFailed}
              />
            </div>

            {showSelector && (
              platform.isMobile ? (
                <EpisodeSelectorMobile
                  slug={slug}
                  animeTitle={animeTitle}
                  seasons={seasons}
                  currentSeasonId={seasonId}
                  currentEpisodeNumber={epNumber}
                  animeCover={animeCover}
                  progressMap={progressMap}
                  languages={languages}
                  language={lang}
                  countryOfOrigin={countryOfOrigin}
                  onLanguageChange={changeLanguage}
                  onSelect={selectFromSelector}
                  onClose={() => setShowSelector(false)}
                />
              ) : (
                <EpisodeSelector
                  slug={slug}
                  animeTitle={animeTitle}
                  seasons={seasons}
                  currentSeasonId={seasonId}
                  currentEpisodeNumber={epNumber}
                  animeCover={animeCover}
                  progressMap={progressMap}
                  onSelect={selectFromSelector}
                  onHoverEnter={openSelector}
                  onHoverLeave={scheduleCloseSelector}
                />
              )
            )}

            {/* Desktop seulement. */}
            {showNextPreview && !showSelector && canAdvance && (
              <NextEpisodePreview
                episode={hasNext ? episodes[currentIndex + 1] : nextSeasonFirst}
                heading={goesToNextSeason ? `Saison suivante · ${nextSeason.name}` : undefined}
                animeCover={animeCover}
                onPlay={goNext}
              />
            )}

            {contentWarning.visible && (
              <ContentWarning tags={contentWarning.tags} leaving={contentWarning.leaving} />
            )}

            {skip.postCreditVisible && <PostCreditNotice />}

            {/* Masqué pendant la carte « épisode suivant ». En Autoskip, seulement à la ré-entrée dans un segment déjà sauté. */}
            {skip.skipSeg &&
              skipRemaining === null &&
              skipButtonEnabled &&
              (!autoSkipOpEd ||
                (skip.skipSeg.type === "intro"
                  ? skip.introManualFallback
                  : skip.outroManualFallback)) && (
                <SkipSegmentButton
                  segment={skip.skipSeg}
                  hasNext={canAdvance}
                  nextLabel={nextLabel}
                  onSkip={skip.skipSegment}
                  onNext={advanceNext}
                />
              )}

            {skip.autoSkipBadge && <AutoSkipBadge kind={skip.autoSkipBadge} />}

            {skipRemaining !== null && (
              <NextEpisodeCountdown
                remaining={skipRemaining}
                windowSeconds={AUTOSKIP_WINDOW}
                label={nextLabel}
                onNext={advanceNext}
                onDismiss={dismissSkip}
              />
            )}
          </>,
          overlayNode
        )}

      {/* Tant que l'overlay n'existe pas (chargement ou erreur d'extraction). */}
      {!overlayNode && <FallbackBackButton onClick={goBack} />}

      {loading && <WatchLoading />}

      {error && !loading && (
        <WatchError
          message={error}
          onRetry={() => {
            // Toutes les sources redeviennent candidates.
            clearFailedSources();
            setRetryToken((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}
