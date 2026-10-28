import { useEffect, useState } from "react";
import { BookOpen, Clock } from "lucide-react";
import { usePlanningStore } from "@/stores/usePlanningStore";
import { nextPlannedRelease } from "@/utils/planning";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** « dans 2 j 4 h », « dans 3 h 12 min », « dans 8 min ». */
function countdown(ms) {
  if (ms < MINUTE) return "dans un instant";
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MINUTE);
  if (d > 0) return `dans ${d} j${h ? ` ${h} h` : ""}`;
  if (h > 0) return `dans ${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
  return `dans ${m} min`;
}

/** Sans heure connue : « aujourd'hui », « demain », sinon le jour de la semaine. */
function dayLabel(at, now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(at).setHours(0, 0, 0, 0) - start.getTime()) / DAY);
  if (diff <= 0) return "aujourd'hui";
  if (diff === 1) return "demain";
  return new Date(at).toLocaleDateString("fr-FR", { weekday: "long" });
}

function Chip({ icon: Icon, children, title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded bg-primary/[0.12] px-2 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/25"
    >
      <Icon size={13} className="shrink-0" />
      {children}
    </span>
  );
}

/**
 * Prochain épisode et prochain chapitre. Le planning d'anime-sama donne la sortie sur Nartya ;
 * à défaut, la diffusion japonaise d'AniList, qui précède souvent la sortie de plusieurs heures.
 */
export default function NextReleaseCountdown({ slug, anilistNext, airing, hasScans }) {
  const planning = usePlanningStore((s) => s.planning);
  const load = usePlanningStore((s) => s.load);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (slug && (airing || hasScans)) load();
  }, [slug, airing, hasScans, load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!slug) return null;
  const nowDate = new Date(now);
  const episode = airing ? nextPlannedRelease(planning, slug, "episode", nowDate) : null;
  const chapter = hasScans ? nextPlannedRelease(planning, slug, "scan", nowDate) : null;
  const japan =
    !episode && airing && anilistNext?.airingAt && anilistNext.airingAt * 1000 > now ? anilistNext : null;

  if (!episode && !chapter && !japan) return null;

  const when = (r) =>
    r.hasTime && r.at > now ? countdown(r.at - now) : r.hasTime ? "aujourd'hui" : dayLabel(r.at, now);
  const episodeNumber = episode && (episode.item.seasonLabel || "").match(/episode\s+(\d+)/i)?.[1];

  return (
    <>
      {episode && (
        <Chip icon={Clock} title={episode.item.seasonLabel || undefined}>
          {episodeNumber ? `Épisode ${episodeNumber}` : "Prochain épisode"} {when(episode)}
        </Chip>
      )}
      {japan && (
        <Chip icon={Clock} title="Diffusion au Japon, la version sous-titrée suit en général dans la journée">
          Épisode {japan.episode} au Japon {countdown(japan.airingAt * 1000 - now)}
        </Chip>
      )}
      {chapter && (
        <Chip icon={BookOpen} title={chapter.item.seasonLabel || undefined}>
          Prochain chapitre {when(chapter)}
        </Chip>
      )}
    </>
  );
}
