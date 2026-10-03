import { getSeasonEpisodes, getAllEpisodes } from "@/api/animeApi";

/** Clé `${slug}:${seasonId}` : l'enrichissement revient sans scintillement sur une page. */
// -> { images: Map<number,string>, airDates: Map<number,string>, seasonName, numbers: number[] }
const seasonCache = new Map();

/** Pour trouver l'épisode suivant d'une saison à l'autre. `null` = échec, non retenté. */
const allEpisodesCache = new Map();

/** Sorti depuis le dernier visionnage ; sans date de diffusion, pas de badge. */
function estSortiApres(airDate, watchedAt) {
  if (!airDate || !watchedAt) return false;
  const sortie = new Date(airDate).getTime();
  const vu = new Date(watchedAt).getTime();
  return Number.isFinite(sortie) && Number.isFinite(vu) && sortie > vu;
}

function advancedItem(item, seasonId, number, image, seasonName, nouveau = false) {
  return {
    ...item,
    episodeKey: `${item.slug}:${seasonId}:${number}:${item.language}`,
    seasonId,
    seasonName: seasonName ?? formatSeasonId(seasonId) ?? item.seasonName,
    episodeNumber: number,
    episodeImage: image ?? null,
    positionSeconds: 0,
    duration: 0,
    progressPercent: 0,
    completed: false,
    newEpisode: nouveau,
  };
}

/** « saison1hs » → « Saison 1 HS » */
function formatSeasonId(seasonId) {
  if (!seasonId) return null;
  const m = String(seasonId).match(/^saison(\d+)(.*)$/i);
  if (m) return `Saison ${m[1]}${m[2] ? ` ${m[2].toUpperCase()}` : ""}`;
  return seasonId;
}

function mapItem(item) {
  const g = seasonCache.get(`${item.slug}:${item.seasonId}`);
  return {
    ...item,
    episodeImage: g?.images.get(item.episodeNumber) ?? item.episodeImage ?? null,
    seasonName: g?.seasonName ?? item.seasonName ?? formatSeasonId(item.seasonId),
  };
}

/** Synchrone, avant le premier rendu. */
export function applyCachedEnrichment(items) {
  return items.map(mapItem);
}

/** Seules les saisons absentes du cache sont chargées. */
/** Épisode terminé : on pointe vers le suivant ; sans suivant dans la saison, l'item est retiré. */
export function advanceCompletedItems(items) {
  const out = [];
  for (const item of items) {
    if (!item.completed) {
      out.push(item);
      continue;
    }
    const g = seasonCache.get(`${item.slug}:${item.seasonId}`);
    if (!g?.numbers?.length) {
      out.push(item);
      continue;
    }
    const next = g.numbers.find((n) => n > Number(item.episodeNumber));
    if (next == null) continue; // fin de saison : traité par advanceCompletedItemsAsync
    out.push(
      advancedItem(
        item,
        item.seasonId,
        next,
        g.images.get(next) ?? null,
        g.seasonName,
        estSortiApres(g.airDates?.get(next), item.updatedAt)
      )
    );
  }
  return out;
}

/** Franchit la frontière de saison. À appeler après `enrichHistoryItems`. */
export async function advanceCompletedItemsAsync(items) {
  const out = [];
  for (const item of items) {
    if (!item.completed) {
      out.push(item);
      continue;
    }
    const g = seasonCache.get(`${item.slug}:${item.seasonId}`);
    // 1) Suivant dans la même saison
    const sameNext = g?.numbers?.length
      ? g.numbers.find((n) => n > Number(item.episodeNumber))
      : undefined;
    if (sameNext != null) {
      out.push(
        advancedItem(
          item,
          item.seasonId,
          sameNext,
          g.images.get(sameNext) ?? null,
          g.seasonName,
          estSortiApres(g.airDates?.get(sameNext), item.updatedAt)
        )
      );
      continue;
    }

    // 2) Fin de saison : ordre complet
    let all = allEpisodesCache.get(item.slug);
    if (all === undefined) {
      try {
        all = await getAllEpisodes(item.slug);
      } catch {
        all = null;
      }
      allEpisodesCache.set(item.slug, all || null);
    }
    if (all?.length) {
      const idx = all.findIndex(
        (e) =>
          String(e.seasonId) === String(item.seasonId) &&
          Number(e.number) === Number(item.episodeNumber)
      );
      const next = idx >= 0 ? all[idx + 1] : null;
      if (next) {
        const ng = seasonCache.get(`${item.slug}:${next.seasonId}`);
        // Saison suivante : badge conservé sans condition de date.
        out.push(
          advancedItem(
            item,
            next.seasonId,
            Number(next.number),
            ng?.images.get(Number(next.number)) ?? null,
            next.seasonName,
            true
          )
        );
      }
      continue;
    }

    // 3) Ordre complet indisponible : on garde l'item si la saison est inconnue.
    if (!g?.numbers?.length) out.push(item);
  }
  return out;
}

export async function enrichHistoryItems(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.slug}:${item.seasonId}`;
    if (!seasonCache.has(key) && !groups.has(key)) {
      groups.set(key, { slug: item.slug, seasonId: item.seasonId });
    }
  }
  await Promise.all(
    [...groups.values()].map(async ({ slug, seasonId }) => {
      try {
        const data = await getSeasonEpisodes(slug, seasonId);
        const images = new Map();
        const airDates = new Map();
        const numbers = [];
        for (const ep of data?.episodes || []) {
          const num = Number(ep.episode ?? ep.number);
          if (!Number.isFinite(num)) continue;
          numbers.push(num);
          if (ep.image) images.set(num, ep.image);
          if (ep.airDate) airDates.set(num, ep.airDate);
        }
        numbers.sort((a, b) => a - b);
        seasonCache.set(`${slug}:${seasonId}`, {
          images,
          airDates,
          seasonName: data?.seasonName || null,
          numbers,
        });
      } catch {
        /* repli dans mapItem (cover + libellé dérivé) */
      }
    })
  );
  return items.map(mapItem);
}
