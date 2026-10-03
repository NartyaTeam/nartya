import { useCallback, useEffect, useRef, useState } from "react";
import { getSkipSegments } from "@/api/animeApi";

// « Une scène suit le générique » : l'ending doit finir assez avant la fin du fichier.
const POST_CREDIT_MIN_GAP_S = 3;
const POST_CREDIT_NOTICE_MS = 6_000;

/** `update(time, duration)` est appelé à chaque `timeupdate` du lecteur. */
export function useSkipSegments({
  slug,
  seasonId,
  epNumber,
  lang,
  currentEpisode,
  autoSkip,
  autoSkipOpEd,
  hasNext,
  playerApiRef,
  advanceFnRef,
}) {
  // null = aucun bouton.
  const [skipSeg, setSkipSeg] = useState(null);
  const [postCreditVisible, setPostCreditVisible] = useState(false);
  // `null | "intro" | "outro" | "next"`
  const [autoSkipBadge, setAutoSkipBadge] = useState(null);
  // L'Autoskip ne saute chaque segment qu'une fois par épisode, sinon revenir en arrière
  // ferait re-sauter. Ces états rendent le bouton manuel à la ré-entrée.
  const [introManualFallback, setIntroManualFallback] = useState(false);
  const [outroManualFallback, setOutroManualFallback] = useState(false);

  // En refs, pour `update`.
  const segmentsRef = useRef(null);
  const skipSegRef = useRef(null);
  const introAutoSkippedRef = useRef(false);
  const outroAutoSkippedRef = useRef(false);
  const postCreditTimerRef = useRef(null);
  const autoSkipBadgeTimerRef = useRef(null);

  useEffect(() => {
    segmentsRef.current = null;
    skipSegRef.current = null;
    setSkipSeg(null);
    clearTimeout(postCreditTimerRef.current);
    setPostCreditVisible(false);
    clearTimeout(autoSkipBadgeTimerRef.current);
    setAutoSkipBadge(null);
    introAutoSkippedRef.current = false;
    outroAutoSkippedRef.current = false;
    setIntroManualFallback(false);
    setOutroManualFallback(false);
  }, [slug, seasonId, epNumber, lang]);

  useEffect(() => {
    if (!seasonId || !currentEpisode) return;
    let cancelled = false;
    (async () => {
      const seg = await getSkipSegments(slug, seasonId, epNumber);
      if (!cancelled && seg) segmentsRef.current = seg;
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, seasonId, currentEpisode, epNumber]);

  useEffect(() => () => clearTimeout(postCreditTimerRef.current), []);
  useEffect(() => () => clearTimeout(autoSkipBadgeTimerRef.current), []);

  const update = useCallback(
    (time, duration) => {
      // L'intro prime sur l'outro.
      const seg = segmentsRef.current;
      let active = null;
      if (seg && duration > 0) {
        if (seg.intro && time >= seg.intro.start && time < seg.intro.end - 0.5)
          active = { type: "intro", end: seg.intro.end };
        else if (seg.outro && time >= seg.outro.start && time < seg.outro.end - 0.5)
          active = {
            type: "outro",
            end: seg.outro.end,
            hasContentAfter: duration - seg.outro.end > POST_CREDIT_MIN_GAP_S,
          };
      }
      if ((active?.type ?? null) === (skipSegRef.current?.type ?? null)) return;

      skipSegRef.current = active;
      setSkipSeg(active);
      clearTimeout(postCreditTimerRef.current);
      // En Autoskip, le saut dépose déjà l'utilisateur après le générique.
      if (active?.type === "outro" && active.hasContentAfter && !autoSkipOpEd) {
        setPostCreditVisible(true);
        postCreditTimerRef.current = setTimeout(
          () => setPostCreditVisible(false),
          POST_CREDIT_NOTICE_MS
        );
      } else {
        setPostCreditVisible(false);
      }

      // Ending sans rien après et épisode suivant disponible : on enchaîne ; sinon, seek à la fin
      // du segment.
      if (!autoSkipOpEd || !active) return;
      const alreadySkipped =
        active.type === "intro" ? introAutoSkippedRef.current : outroAutoSkippedRef.current;
      if (alreadySkipped) {
        // Déjà sauté : seulement le bouton.
        if (active.type === "intro") setIntroManualFallback(true);
        else setOutroManualFallback(true);
        return;
      }
      if (active.type === "intro") {
        introAutoSkippedRef.current = true;
        setIntroManualFallback(false);
      } else {
        outroAutoSkippedRef.current = true;
        setOutroManualFallback(false);
      }
      // `autoSkip` (enchaînement) et `autoSkipOpEd` (saut intro/ending) sont indépendants.
      if (autoSkip && active.type === "outro" && !active.hasContentAfter && hasNext) {
        setAutoSkipBadge("next");
        advanceFnRef.current?.();
      } else {
        const api = playerApiRef.current;
        if (api) {
          const dur = api.getDuration?.() || 0;
          api.seek(dur > 0 ? Math.min(active.end + 0.1, dur - 0.3) : active.end + 0.1);
          setAutoSkipBadge(active.type);
        }
      }
      clearTimeout(autoSkipBadgeTimerRef.current);
      autoSkipBadgeTimerRef.current = setTimeout(() => setAutoSkipBadge(null), 1800);
    },
    [autoSkip, autoSkipOpEd, hasNext, playerApiRef, advanceFnRef]
  );

  const skipSegment = useCallback(() => {
    const seg = skipSegRef.current;
    const api = playerApiRef.current;
    if (seg && api) {
      const dur = api.getDuration?.() || 0;
      // Sous la durée, pour ne pas déclencher une fin prématurée.
      api.seek(dur > 0 ? Math.min(seg.end + 0.1, dur - 0.3) : seg.end + 0.1);
    }
    skipSegRef.current = null;
    setSkipSeg(null);
  }, [playerApiRef]);

  return {
    skipSeg,
    postCreditVisible,
    autoSkipBadge,
    introManualFallback,
    outroManualFallback,
    update,
    skipSegment,
  };
}
