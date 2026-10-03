import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Dérivé des genres AniList, faute de classification.
const CONTENT_WARNING_MS = 5_000;
const GENRE_CONTENT_TAGS = {
  Action: "Violence",
  Horror: "Horreur",
  Ecchi: "Contenu suggestif",
  Hentai: "Contenu explicite",
  Psychological: "Tension psychologique",
  Thriller: "Tension psychologique",
  Drama: "Thèmes sensibles",
  Mystery: "Suspense",
  Romance: "Scènes romantiques",
};

/** Une fois par anime : un changement d'épisode coupe le bandeau sans le réarmer. */
export function useContentWarning(genres, slug, episodeKey) {
  const tags = useMemo(() => {
    const list = (genres || []).map((g) => GENRE_CONTENT_TAGS[g]).filter(Boolean);
    return [...new Set(list)].slice(0, 3);
  }, [genres]);

  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const shownRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    clearTimeout(timerRef.current);
    clearTimeout(hideTimerRef.current);
    setVisible(false);
    setLeaving(false);
  }, [episodeKey]);

  useEffect(() => {
    shownRef.current = false;
    pendingRef.current = false;
  }, [slug]);

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      clearTimeout(hideTimerRef.current);
    },
    []
  );

  const show = useCallback(() => {
    setVisible(true);
    setLeaving(false);
    timerRef.current = setTimeout(() => {
      setLeaving(true);
      hideTimerRef.current = setTimeout(() => setVisible(false), 400);
    }, CONTENT_WARNING_MS);
  }, []);

  // Les genres peuvent ne pas être arrivés : le « une fois » est consommé tout de suite, les
  // tags s'affichent à leur arrivée.
  const onPlay = useCallback(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    if (!tags.length) {
      pendingRef.current = true;
      return;
    }
    show();
  }, [tags, show]);

  useEffect(() => {
    if (!pendingRef.current || !tags.length) return;
    pendingRef.current = false;
    show();
  }, [tags, show]);

  return { tags, visible, leaving, onPlay };
}
