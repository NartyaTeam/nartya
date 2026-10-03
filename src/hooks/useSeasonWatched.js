import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import {
  getAnimeProgressMap,
  markEpisodeWatched,
  markEpisodesWatched,
  unmarkEpisodeWatched,
  unmarkSeasonWatched,
} from "@/api/progress";
import { GUEST_FEATURE_MSG } from "@/lib/guest";

/** `progressMap` est indexée par `${seasonId}:${n°}`. */
export function useSeasonWatched({
  slug,
  session,
  isGuest,
  selectedSeason,
  selectedLanguage,
  animeTitle,
  animeImage,
  displayEpisodes,
  watchableEpisodes,
}) {
  const [progressMap, setProgressMap] = useState({});
  // Ancre du Maj-clic de plage.
  const lastToggledRef = useRef(null);

  useEffect(() => {
    if (!session || !slug) return setProgressMap({});
    getAnimeProgressMap(slug).then(setProgressMap).catch(() => {});
  }, [session, slug]);

  // Maj+clic applique le même état à toute la plage depuis l'ancre.
  const toggleWatched = (clickedIndex, shiftKey) => {
    const userId = session?.user?.id;
    if (!userId || isGuest || !selectedSeason) {
      if (!userId) toast.info("Connecte-toi pour suivre tes épisodes");
      else if (isGuest) toast.info(GUEST_FEATURE_MSG);
      return;
    }
    const seasonId = selectedSeason.id;
    const clicked = displayEpisodes[clickedIndex];
    if (!clicked || clicked.__isUpcomingUnavailable) return;
    const clickedNum = clicked.episode || clicked.number;
    const target = !progressMap[`${seasonId}:${clickedNum}`]?.completed;

    let indices = [clickedIndex];
    if (shiftKey && lastToggledRef.current != null) {
      const [a, b] = [lastToggledRef.current, clickedIndex].sort((x, y) => x - y);
      indices = Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
    lastToggledRef.current = clickedIndex;

    const nextMap = { ...progressMap };
    for (const i of indices) {
      const ep = displayEpisodes[i];
      if (!ep || ep.__isUpcomingUnavailable) continue;
      const num = ep.episode || ep.number;
      const key = `${seasonId}:${num}`;
      if (target) {
        nextMap[key] = { progressPercent: 100, completed: true };
        markEpisodeWatched({
          slug,
          seasonId,
          episodeNumber: num,
          language: selectedLanguage,
          title: animeTitle,
          cover: animeImage,
          userId,
        });
      } else {
        delete nextMap[key];
        unmarkEpisodeWatched({ slug, seasonId, episodeNumber: num });
      }
    }
    setProgressMap(nextMap);
  };

  // Null avec un toast sans session.
  const requireWatchAuth = () => {
    const userId = session?.user?.id;
    if (!userId) toast.info("Connecte-toi pour suivre tes épisodes");
    else if (isGuest) toast.info(GUEST_FEATURE_MSG);
    else if (selectedSeason) return userId;
    return null;
  };

  // Jusqu'à `uptoNum` inclus, en une requête.
  const markWatchedUpTo = (uptoNum) => {
    const userId = requireWatchAuth();
    if (!userId) return;
    const seasonId = selectedSeason.id;
    const nextMap = { ...progressMap };
    const nums = [];
    for (const ep of watchableEpisodes) {
      const num = Number(ep.episode || ep.number);
      if (num > uptoNum) continue;
      const key = `${seasonId}:${num}`;
      if (nextMap[key]?.completed) continue;
      nextMap[key] = { progressPercent: 100, completed: true };
      nums.push(num);
    }
    if (!nums.length) {
      toast.info("Ces épisodes sont déjà marqués comme vus.");
      return;
    }
    lastToggledRef.current = null;
    setProgressMap(nextMap);
    markEpisodesWatched({
      slug,
      seasonId,
      episodeNumbers: nums,
      language: selectedLanguage,
      title: animeTitle,
      cover: animeImage,
      userId,
    });
    toast.success(`${nums.length} épisode(s) marqué(s) comme vu(s).`);
  };

  // La progression partielle est conservée.
  const unmarkSeason = () => {
    const userId = requireWatchAuth();
    if (!userId) return;
    const seasonId = selectedSeason.id;
    const nextMap = { ...progressMap };
    for (const ep of watchableEpisodes) {
      const key = `${seasonId}:${ep.episode || ep.number}`;
      if (nextMap[key]?.completed) delete nextMap[key];
    }
    lastToggledRef.current = null;
    setProgressMap(nextMap);
    unmarkSeasonWatched({ slug, seasonId });
    toast.success("Épisodes retirés du suivi.");
  };

  return { progressMap, toggleWatched, markWatchedUpTo, unmarkSeason };
}
