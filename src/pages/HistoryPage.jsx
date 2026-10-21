import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, isSameYear, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { BookOpen, History, Play, Search, X } from "lucide-react";
import { getReadingHistory, getWatchHistory } from "@/api/history";
import { useDisplayTitle } from "@/stores/useTitlesStore";
import { formatSeasonId } from "@/utils/watchHistory";
import MediaTabs from "@/components/lists/MediaTabs";

function dayLabel(date) {
  if (isToday(date)) return "Aujourd'hui";
  if (isYesterday(date)) return "Hier";
  return format(date, isSameYear(date, new Date()) ? "EEEE d MMMM" : "EEEE d MMMM yyyy", { locale: fr });
}

function groupByDay(items) {
  const groups = [];
  for (const item of items) {
    const date = new Date(item.updatedAt);
    const label = dayLabel(date);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function HistoryRow({ cover, title, detail, time, onOpen, onResume, resumeLabel }) {
  return (
    <li className="group flex items-center gap-3.5 border-b border-white/[0.055] py-3 last:border-b-0">
      <button onClick={onOpen} className="shrink-0 active:scale-95" aria-label={`Ouvrir ${title}`}>
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="h-[4.5rem] w-12 rounded-md object-cover ring-2 ring-border" />
        ) : (
          <div className="h-[4.5rem] w-12 rounded-md bg-surface-2 ring-2 ring-border" />
        )}
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="line-clamp-1 text-sm font-semibold text-text transition-colors md:group-hover:text-primary">{title}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{detail}</p>
        <p className="mt-0.5 text-[0.68rem] tabular-nums text-muted/70">{time}</p>
      </button>
      <button
        onClick={onResume}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-surface px-3 text-xs font-bold text-text ring-2 ring-border transition-colors hover:ring-primary/60 active:scale-95"
      >
        <Play size={13} className="fill-current" />
        {resumeLabel}
      </button>
    </li>
  );
}

/** Tout ce qu'on a regardé ou lu, du plus récent au plus ancien, retirés de « Reprendre » compris. */
export default function HistoryPage() {
  const navigate = useNavigate();
  const displayTitle = useDisplayTitle();
  const [media, setMedia] = useState("anime");
  const [watched, setWatched] = useState(null);
  const [read, setRead] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    getWatchHistory()
      .then((items) => alive && setWatched(items))
      .catch(() => alive && setWatched([]));
    getReadingHistory()
      .then((items) => alive && setRead(items))
      .catch(() => alive && setRead([]));
    return () => {
      alive = false;
    };
  }, []);

  const source = media === "manga" ? read : watched;
  const groups = useMemo(() => {
    if (!source) return null;
    const q = query.trim().toLowerCase();
    const items = q
      ? source.filter((item) =>
          [displayTitle(item.slug, item.title), item.title, item.slug, item.oeuvreLabel]
            .filter(Boolean)
            .some((t) => t.toLowerCase().includes(q))
        )
      : source;
    return groupByDay(items);
  }, [source, query, displayTitle]);

  const counts = { anime: watched?.length ?? 0, manga: read?.length ?? 0 };

  const renderAnime = (item) => {
    const season = formatSeasonId(item.seasonId);
    const lang = item.language ? item.language.toUpperCase() : null;
    const state = item.completed ? "Vu" : item.progressPercent > 0 ? `${item.progressPercent} %` : null;
    const watchUrl = `/watch/${item.slug}?season=${item.seasonId}&ep=${item.episodeNumber}&lang=${item.language}`;
    const animeUrl = `/anime/${item.slug}?season=${item.seasonId}&lang=${item.language}`;
    return (
      <HistoryRow
        key={item.slug}
        cover={item.cover}
        title={displayTitle(item.slug, item.title || item.slug)}
        detail={[season, `Épisode ${item.episodeNumber}`, lang, state].filter(Boolean).join(" · ")}
        time={`${format(new Date(item.updatedAt), "HH:mm")}${item.episodes > 1 ? ` · ${item.episodes} épisodes vus` : ""}`}
        onOpen={() => navigate(animeUrl)}
        // Deux push, comme « Reprendre » : le retour du lecteur mène à la fiche.
        onResume={() => {
          navigate(animeUrl);
          navigate(watchUrl);
        }}
        resumeLabel="Reprendre"
      />
    );
  };

  const renderManga = (item) => {
    const pages = item.totalPages ? ` · page ${Math.min(item.page + 1, item.totalPages)}/${item.totalPages}` : "";
    return (
      <HistoryRow
        key={`${item.slug}:${item.oeuvre}`}
        cover={item.cover}
        title={displayTitle(item.slug, item.title || item.slug)}
        detail={[item.oeuvreLabel, `Chapitre ${item.chapter}${pages}`, item.completed ? "Lu" : null]
          .filter(Boolean)
          .join(" · ")}
        time={format(new Date(item.updatedAt), "HH:mm")}
        onOpen={() => navigate(`/anime/${item.slug}?tab=scans&chapter=${item.chapter}`)}
        onResume={() =>
          navigate(`/scan/${item.slug}?oeuvre=${encodeURIComponent(item.oeuvre)}&chapter=${item.chapter}`)
        }
        resumeLabel="Lire"
      />
    );
  };

  return (
    <div className="animate-fade-in px-4 pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:py-10">
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-px w-6 bg-primary" />
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Ma bibliothèque</p>
        </div>
        <h1 className="t-impact text-4xl md:text-5xl">Historique</h1>
        <p className="mt-1.5 max-w-xl text-sm text-muted">
          Tout ce que tu as regardé ou lu, même ce que tu as retiré de « Reprendre ».
        </p>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <MediaTabs value={media} onChange={setMedia} counts={counts} />
          <div className="flex h-11 flex-1 items-center gap-2.5 rounded-md bg-surface px-3.5 ring-2 ring-border transition-colors focus-within:ring-primary/70 md:h-10 md:max-w-xs">
            <Search size={16} className="shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans l'historique…"
              aria-label="Rechercher dans l'historique"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer la recherche"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted active:bg-white/10 active:text-text"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </header>

      {groups === null ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-[4.5rem] skeleton rounded-md" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex min-h-[40dvh] flex-col items-center justify-center rounded-md border-2 border-dashed border-border px-7 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            {query.trim() ? <Search size={24} /> : media === "manga" ? <BookOpen size={24} /> : <History size={24} />}
          </span>
          <p className="mt-4 text-sm text-muted">
            {query.trim()
              ? `Rien dans l'historique ne correspond à « ${query.trim()} ».`
              : media === "manga"
                ? "Les mangas que tu lis apparaîtront ici."
                : "Les animes que tu regardes apparaîtront ici."}
          </p>
        </div>
      ) : (
        <div className="max-w-3xl space-y-7">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-primary/80 first-letter:uppercase">
                {group.label}
              </h2>
              <ul>{group.items.map(media === "manga" ? renderManga : renderAnime)}</ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
