import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Clock } from "lucide-react";
import PageLoader from "@/components/ui/PageLoader";
import { usePlanningStore } from "@/stores/usePlanningStore";
import { parseReleaseDate } from "@/utils/planning";
import { Flag, getLanguageLabel } from "@/components/ui/Flag";
import NotifyBell from "@/components/NotifyBell";

// getDay() : 0 = dimanche. Planning : 0 = lundi.
function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

// Pas un champ : il est dans le libellé (« Saison 1 Episode 9 »).
function parseEpisode(seasonLabel) {
  const m = (seasonLabel || "").match(/episode\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Vers la fiche, sur la bonne saison et langue. */
function ReleaseCard({ item, dayDate, now }) {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);

  const at = parseReleaseDate(dayDate, item.time, new Date(now));
  const released = at && at.getTime() <= now;
  const ep = parseEpisode(item.seasonLabel);

  const go = () => {
    const params = new URLSearchParams();
    if (item.season) params.set("season", item.season);
    if (item.langs?.[0]) params.set("lang", item.langs[0]);
    navigate(`/anime/${item.slug}?${params.toString()}`);
  };

  return (
    <button onClick={go} className="group block w-full text-left">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-2">
        {item.image ? (
          <>
            {!loaded && <div className="absolute inset-0 skeleton" />}
            <img
              src={item.image}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
              className={`h-full w-full object-cover transition-[transform,opacity] duration-300 ease-out group-hover:scale-[1.04] ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </>
        ) : (
          <div className="h-full w-full skeleton" />
        )}

        {/* Rend la cloche lisible sur les affiches claires. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/55 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

        {/* Badge épisode, sinon type (TV/Film/OAV) */}
        {ep != null ? (
          <span className="absolute left-1.5 top-1.5 rounded bg-primary/90 px-1.5 py-0.5 text-[0.68rem] font-bold text-primary-fg backdrop-blur-sm">
            Ép. {ep}
          </span>
        ) : item.type ? (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-white/90 backdrop-blur-sm">
            {item.type}
          </span>
        ) : null}

        {/* Au survol, ou toujours si déjà suivi. */}
        <span className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 has-[.text-primary]:opacity-100">
          <NotifyBell slug={item.slug} title={item.title} variant="icon" />
        </span>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-1.5 pt-6">
          {item.time ? (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.68rem] font-bold backdrop-blur-sm ${
                released ? "bg-primary text-primary-fg" : "bg-black/60 text-white/90"
              }`}
            >
              <Clock size={11} />
              {released ? "Sorti" : item.time}
            </span>
          ) : item.status ? (
            <span className="inline-flex items-center rounded bg-amber-500/90 px-1.5 py-0.5 text-[0.68rem] font-bold text-black backdrop-blur-sm">
              {item.status}
            </span>
          ) : (
            <span />
          )}

          {item.langs?.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1">
              {item.langs.slice(0, 4).map((l) => (
                <Flag key={l} lang={l} size={13} title={getLanguageLabel(l)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <h3 className="mt-2 line-clamp-1 text-sm font-semibold text-text transition-colors group-hover:text-primary">
        {item.title}
      </h3>
      <p className="mt-0.5 line-clamp-1 text-xs text-muted">
        {item.seasonLabel || "Nouvel épisode"}
      </p>
    </button>
  );
}

function DaySection({ day, now, innerRef }) {
  const isToday = day.index === todayIndex();
  const count = day.items.length;

  return (
    <section ref={innerRef} className="scroll-mt-28">
      <div className="mb-4 flex items-baseline gap-3 border-b border-border/40 pb-2.5">
        <h2 className="font-display text-xl font-bold text-text">
          {day.name}
          {day.date && <span className="ml-2 text-base font-normal text-muted">{day.date}</span>}
        </h2>
        {isToday && <span className="eyebrow text-primary">Aujourd'hui</span>}
        <span className="ml-auto shrink-0 text-xs text-muted">
          {count > 0 ? `${count} sortie${count > 1 ? "s" : ""}` : "Aucune sortie"}
        </span>
      </div>

      {count > 0 ? (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {day.items.map((item) => (
            <ReleaseCard key={`${item.slug}:${item.season}`} item={item} dayDate={day.date} now={now} />
          ))}
        </div>
      ) : (
        <p className="py-2 text-sm text-muted/60">Pas de sortie prévue ce jour.</p>
      )}
    </section>
  );
}

/** Une barre collante saute à un jour. Le calendrier est marqué comme consulté à l'ouverture. */
export default function PlanningPage() {
  const planning = usePlanningStore((s) => s.planning);
  const loading = usePlanningStore((s) => s.loading);
  const error = usePlanningStore((s) => s.error);
  const load = usePlanningStore((s) => s.load);
  const markSeen = usePlanningStore((s) => s.markSeen);
  const now = Date.now();

  const sectionRefs = useRef({});

  useEffect(() => {
    load();
    markSeen();
  }, [load, markSeen]);

  const days = useMemo(() => planning.days || [], [planning.days]);
  const isEmpty = !loading && days.length === 0;
  const total = useMemo(() => days.reduce((n, d) => n + (d.items?.length || 0), 0), [days]);

  const jumpTo = (index) => {
    sectionRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="animate-fade-in mx-auto max-w-[1600px] px-4 pb-16 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:px-6 sm:pt-24 md:px-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <CalendarDays size={26} className="text-primary" />
          <div>
            <h1 className="font-display text-2xl font-extrabold text-glow sm:text-3xl">Calendrier</h1>
            <p className="mt-1 text-sm text-muted">
              Les sorties de la semaine. Suis un anime (cloche) pour être notifié à sa sortie.
            </p>
          </div>
        </div>
        {total > 0 && (
          <span className="text-sm font-medium text-muted">
            {total} sortie{total > 1 ? "s" : ""} cette semaine
          </span>
        )}
      </div>

      {loading && days.length === 0 ? (
        <PageLoader className="py-20" label="Chargement du planning" />
      ) : isEmpty ? (
        <p className="py-24 text-center text-muted">
          {error ? "Impossible de charger le planning." : "Aucune sortie annoncée."}
        </p>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-4 mb-8 border-b border-border bg-bg/85 px-4 backdrop-blur-md sm:-mx-6 sm:top-16 sm:px-6 md:-mx-10 md:px-10">
            <div className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
              {days.map((day) => {
                const isToday = day.index === todayIndex();
                return (
                  <button
                    key={day.index}
                    onClick={() => jumpTo(day.index)}
                    className={`group flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                      isToday
                        ? "border-primary text-text"
                        : "border-transparent text-muted hover:text-text"
                    }`}
                  >
                    {day.name}
                    {day.items.length > 0 && (
                      <span
                        className={`text-[0.7rem] font-bold tabular-nums transition-colors ${
                          isToday ? "text-primary" : "text-muted/70 group-hover:text-text/70"
                        }`}
                      >
                        {day.items.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-10">
            {days.map((day) => (
              <DaySection
                key={day.index}
                day={day}
                now={now}
                innerRef={(el) => (sectionRefs.current[day.index] = el)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
