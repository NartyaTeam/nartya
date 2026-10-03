export function findDownloadEpisode(episodes, episodeNumber) {
  if (!Array.isArray(episodes)) return null;
  return (
    episodes.find(
      (candidate) =>
        String(candidate?.episode ?? candidate?.number) === String(episodeNumber),
    ) || null
  );
}

/** Poignée fraîche : aucune URL n'est reprise de l'index disque. */
export function buildRecoveryPayload(item, handle) {
  if (!item?.id || !item.slug || item.seasonId == null || !handle) return null;
  return {
    id: item.id,
    slug: item.slug,
    seasonId: item.seasonId,
    ep: item.ep,
    lang: item.lang,
    handle,
    maxHeight: item.maxHeight || 0,
    sourcePreference: item.sourcePreference || "auto",
    animeTitle: item.animeTitle,
    animeCover: item.animeCover,
    epThumb: item.epThumb,
    epTitle: item.epTitle,
    seasonName: item.seasonName,
  };
}
