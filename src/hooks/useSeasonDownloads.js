import { useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { resolveDownloadSource } from "@/utils/episodeDownload";
import { downloadId } from "@/api/downloads";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

export function useSeasonDownloads({
  slug,
  selectedSeason,
  selectedLanguage,
  selectedSource,
  animeTitle,
  animeImage,
  canDownload,
  filteredEpisodes,
  selectedNums,
  clearSelection,
}) {
  const downloadsById = useDownloadsStore((s) => s.byId);
  const startDownloadAction = useDownloadsStore((s) => s.start);
  const cancelSeasonAction = useDownloadsStore((s) => s.cancelSeason);
  const [resolving, setResolving] = useState({});
  // { total, done } ou null.
  const [seasonDl, setSeasonDl] = useState(null);
  // Une ref : la boucle capturerait la valeur du rendu où elle a démarré.
  const seasonDlCancelRef = useRef(false);

  const handleDownload = async (ep) => {
    const num = ep.episode || ep.number;
    const id = downloadId(slug, selectedSeason.id, num, selectedLanguage);
    setResolving((r) => ({ ...r, [id]: true }));
    try {
      const src = await resolveDownloadSource(ep, selectedLanguage, selectedSource);
      if (!src.success) {
        toast.error(src.error || "Téléchargement impossible");
        return;
      }
      // "max" = pas de plafond.
      const quality = useSettingsStore.getState().downloadQuality;
      const maxHeight = quality && quality !== "max" ? parseInt(quality, 10) : null;
      const res = await startDownloadAction({
        id,
        slug,
        seasonId: selectedSeason.id,
        ep: num,
        lang: selectedLanguage,
        handle: src.handle,
        maxHeight,
        sourcePreference: selectedSource,
        animeTitle,
        animeCover: animeImage,
        epThumb: ep.image || ep.thumbnail || null,
        epTitle: ep.title || `Épisode ${num}`,
        seasonName: selectedSeason.name,
      });
      if (!res?.success) toast.error(res?.error || "Téléchargement impossible");
    } finally {
      setResolving((r) => ({ ...r, [id]: false }));
    }
  };

  // Dans la langue courante.
  const downloadableEpisodes = useMemo(() => {
    if (!canDownload || !selectedSeason) return [];
    return filteredEpisodes.filter((ep) => {
      if (ep.__isUpcomingUnavailable) return false;
      const num = ep.episode || ep.number;
      const st = downloadsById[downloadId(slug, selectedSeason.id, num, selectedLanguage)]?.status;
      return st !== "done" && st !== "downloading" && st !== "queued";
    });
  }, [canDownload, selectedSeason, filteredEpisodes, downloadsById, slug, selectedLanguage]);

  const allDownloadableSelected = useMemo(
    () =>
      downloadableEpisodes.length > 0 &&
      downloadableEpisodes.every((ep) => selectedNums.has(ep.episode || ep.number)),
    [downloadableEpisodes, selectedNums]
  );

  // En file ou en cours, pour le bouton « Annuler ».
  const seasonQueuedCount = useMemo(() => {
    if (!canDownload || !selectedSeason) return 0;
    const prefix = `${slug}::${selectedSeason.id}::`;
    const suffix = `::${selectedLanguage}`;
    return Object.values(downloadsById).filter(
      (it) =>
        it.id.startsWith(prefix) &&
        it.id.endsWith(suffix) &&
        (it.status === "queued" || it.status === "downloading")
    ).length;
  }, [canDownload, selectedSeason, downloadsById, slug, selectedLanguage]);

  /**
   * Résolutions en parallèle dans des cases indexées ; un drain séquentiel enfile dans l'ordre
   * des épisodes.
   * @param {Array} [episodesOverride] sous-ensemble à télécharger (sélection mobile)
   */
  const downloadSeason = async (episodesOverride) => {
    // Toujours croissant, quel que soit le tri affiché.
    const targets = [...(episodesOverride || downloadableEpisodes)].sort(
      (a, b) => (a.episode || a.number) - (b.episode || b.number)
    );
    if (!targets.length || seasonDl) return;

    const quality = useSettingsStore.getState().downloadQuality;
    const maxHeight = quality && quality !== "max" ? parseInt(quality, 10) : null;
    // `selectedSeason` peut changer pendant la résolution.
    const dlSeasonId = selectedSeason.id;
    const dlSeasonName = selectedSeason.name;

    seasonDlCancelRef.current = false;
    setSeasonDl({ total: targets.length, done: 0, seasonId: dlSeasonId });
    let failed = 0;
    let cursor = 0;
    const RESOLVE_CONCURRENCY = 3;

    // Case i = résultat de targets[i] : `undefined` en attente, `null` échec.
    const resolved = new Array(targets.length);
    let nextToEnqueue = 0;
    let draining = false;

    /** Sans sauter de trou. */
    const drain = async () => {
      if (draining) return;
      draining = true;
      try {
        while (
          nextToEnqueue < targets.length &&
          resolved[nextToEnqueue] !== undefined &&
          !seasonDlCancelRef.current
        ) {
          const payload = resolved[nextToEnqueue++];
          if (payload) await startDownloadAction(payload);
        }
      } finally {
        draining = false;
      }
    };

    const worker = async () => {
      while (cursor < targets.length && !seasonDlCancelRef.current) {
        const i = cursor++;
        const ep = targets[i];
        const num = ep.episode || ep.number;
        try {
          const src = await resolveDownloadSource(ep, selectedLanguage, selectedSource, {
            shouldAbort: () => seasonDlCancelRef.current,
          });
          if (src.success) {
            resolved[i] = {
              id: downloadId(slug, dlSeasonId, num, selectedLanguage),
              slug,
              seasonId: dlSeasonId,
              ep: num,
              lang: selectedLanguage,
              handle: src.handle,
              maxHeight,
              sourcePreference: selectedSource,
              animeTitle,
              animeCover: animeImage,
              epThumb: ep.image || ep.thumbnail || null,
              epTitle: ep.title || `Épisode ${num}`,
              seasonName: dlSeasonName,
            };
          } else {
            resolved[i] = null;
            failed++;
          }
        } catch {
          resolved[i] = null;
          failed++;
        } finally {
          setSeasonDl((s) => (s ? { ...s, done: s.done + 1 } : s));
        }
        await drain();
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(RESOLVE_CONCURRENCY, targets.length) }, worker)
    );
    await drain(); // il peut rester une case prête

    setSeasonDl(null);
    if (seasonDlCancelRef.current) return;

    const queued = targets.length - failed;
    if (queued > 0) {
      toast.success(
        `${queued} épisode(s) ajouté(s) au téléchargement${failed ? ` (${failed} indisponible(s))` : ""}`
      );
    } else {
      toast.error("Aucun épisode n'a pu être téléchargé");
    }
  };

  const downloadSelectedEpisodes = async () => {
    const targets = downloadableEpisodes.filter((ep) =>
      selectedNums.has(ep.episode || ep.number)
    );
    if (!targets.length) return;
    clearSelection();
    await downloadSeason(targets);
  };

  const cancelSeasonDownload = async () => {
    // La saison réellement en téléchargement, pas celle affichée.
    const targetSeasonId = seasonDl?.seasonId ?? selectedSeason.id;
    seasonDlCancelRef.current = true;
    setSeasonDl(null);
    const res = await cancelSeasonAction({
      slug,
      seasonId: targetSeasonId,
      lang: selectedLanguage,
    });
    toast.success(
      res?.canceled ? `Téléchargement annulé (${res.canceled} épisode(s))` : "Téléchargement annulé"
    );
  };

  return {
    downloadsById,
    resolving,
    seasonDl,
    handleDownload,
    downloadableEpisodes,
    allDownloadableSelected,
    seasonQueuedCount,
    downloadSeason,
    downloadSelectedEpisodes,
    cancelSeasonDownload,
  };
}
