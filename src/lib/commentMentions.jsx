import { getSeasonEpisodes as getAnimeSeasonEpisodes } from "@/api/animeApi";
import { getAnimeProgressMap } from "@/api/progress";
import MentionPill from "@/components/comments/MentionPill";

/**
 * La mention n'est pas une entité en base : le texte brut est résolu à l'affichage. Une mention
 * vers un épisode disparu redevient du texte.
 */

/** Les bornes évitent d'avaler un numéro à rallonge. */
const MENTION_RE = /@(?:S(\d{1,2}))?E(\d{1,4})\b/gi;

export function mentionToken(season, episode) {
  return season ? `@S${season}E${episode}` : `@E${episode}`;
}

export function extractMentions(body) {
  const text = String(body || "");
  const re = new RegExp(MENTION_RE.source, "gi");
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const season = m[1] ? Number(m[1]) : null;
    const episode = Number(m[2]);
    if (!(episode > 0)) continue;
    const key = `${season ?? ""}:${episode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ season, episode });
  }
  return out;
}

// Promesses mémoïsées, pas les résultats : les appels concurrents sont dédupliqués.
const animeSeasonEpisodesCache = new Map();
const animeProgressCache = new Map();

/** `seasons` brut ({ id, name }) : la saison mentionnée est son index à partir de 1. */
export function animeMentionResolver(slug, seasons = []) {
  const seasonAt = (season) => (season ? seasons[season - 1] : seasons[0]);

  const link = (season, episode) => {
    const s = seasonAt(season);
    if (!slug || !s) return null;
    return {
      href: `/watch/${encodeURIComponent(slug)}?season=${encodeURIComponent(s.id)}&ep=${episode}`,
      label: season ? `S${season} · Ép. ${episode}` : `Ép. ${episode}`,
    };
  };

  /** Même source que la liste d'épisodes de la fiche : le sélecteur ne peut pas en diverger. */
  const episodesOf = async (season) => {
    const s = seasonAt(season);
    if (!slug || !s) return [];
    const key = `${slug}:${s.id}`;
    if (!animeSeasonEpisodesCache.has(key)) {
      animeSeasonEpisodesCache.set(
        key,
        getAnimeSeasonEpisodes(slug, s.id)
          .then((d) =>
            (d?.episodes || [])
              .map((e) => ({
                number: Number(e.episode ?? e.number),
                title: e.title || null,
                description: e.description || null,
                image: e.image || e.thumbnail || null,
                airDate: e.airDate || null,
              }))
              .filter((e) => e.number > 0)
          )
          .catch(() => [])
      );
    }
    return animeSeasonEpisodesCache.get(key);
  };

  const progressOf = async () => {
    if (!animeProgressCache.has(slug)) {
      animeProgressCache.set(slug, getAnimeProgressMap(slug).catch(() => ({})));
    }
    return animeProgressCache.get(slug);
  };

  const info = async (season, episode) => {
    const l = link(season, episode);
    if (!l) return null;
    const s = seasonAt(season);
    const [episodes, progressMap] = await Promise.all([episodesOf(season), progressOf()]);
    const ep = episodes.find((e) => e.number === episode) || null;
    return {
      ...l,
      seasonLabel: s?.name || null,
      title: ep?.title || null,
      description: ep?.description || null,
      image: ep?.image || null,
      airDate: ep?.airDate || null,
      progress: progressMap[`${s?.id}:${episode}`] || null,
    };
  };

  return { link, info, list: episodesOf };
}

export function renderCommentBody(body, resolver) {
  const text = String(body || "");
  if (!resolver) return text;

  const nodes = [];
  let last = 0;
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const season = m[1] ? Number(m[1]) : null;
    const episode = Number(m[2]);

    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <MentionPill key={`${m.index}-${m[0]}`} resolver={resolver} season={season} episode={episode} raw={m[0]} />
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : text;
}
