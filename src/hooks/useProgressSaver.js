import { useCallback, useEffect, useRef } from "react";
import { saveEpisodeProgress } from "@/api/progress";

// Filet : les sauvegardes normales suivent les événements (pause, changement d'épisode, démontage).
const SAVE_INTERVAL_MS = 30_000;

// Les sauvegardes critiques passent en `force`.
const MIN_SAVE_GAP_MS = 5_000;

/** `positionRef` = { time, duration }. */
export function useProgressSaver(
  positionRef,
  { userId, slug, seasonId, epNumber, lang, animeTitle, animeCover }
) {
  const lastSaveRef = useRef(0);

  const saveProgress = useCallback(
    (time, duration, { force = false } = {}) => {
      if (!userId || !seasonId || !Number.isFinite(epNumber) || !duration || time <= 1) return;
      const now = Date.now();
      if (!force && now - lastSaveRef.current < MIN_SAVE_GAP_MS) return;
      lastSaveRef.current = now; // réarme le filet périodique
      saveEpisodeProgress({
        slug,
        seasonId,
        episodeNumber: epNumber,
        language: lang,
        positionSeconds: time,
        duration,
        title: animeTitle,
        cover: animeCover,
        userId,
      }).catch(() => {});
    },
    [userId, slug, seasonId, epNumber, lang, animeTitle, animeCover]
  );

  useEffect(() => {
    return () => {
      const { time, duration } = positionRef.current;
      if (time > 0 && duration > 0) saveProgress(time, duration, { force: true });
    };
  }, [saveProgress, positionRef]);

  // Minuteur mural : `timeupdate` se raréfie en arrière-plan, et une fermeture brutale
  // peut tomber entre deux sauvegardes.
  useEffect(() => {
    const id = setInterval(() => {
      const { time, duration } = positionRef.current;
      if (time > 0 && duration > 0) saveProgress(time, duration, { force: true });
    }, SAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [saveProgress, positionRef]);

  useEffect(() => {
    const flush = () => {
      const { time, duration } = positionRef.current;
      saveProgress(time, duration, { force: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [saveProgress, positionRef]);

  const flushBeforeNav = useCallback(() => {
    const { time, duration } = positionRef.current;
    if (time > 0 && duration > 0) saveProgress(time, duration, { force: true });
    positionRef.current = { time: 0, duration: 0 };
    lastSaveRef.current = 0;
  }, [saveProgress, positionRef]);

  return { saveProgress, flushBeforeNav, lastSaveRef };
}
