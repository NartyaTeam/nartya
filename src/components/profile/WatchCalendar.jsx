import { useEffect, useMemo, useRef } from "react";
import { getWatchCalendar } from "@/api/profile";
import { useCachedResource } from "@/hooks/useCachedResource";

const WEEKS = 52;
const DAYS = WEEKS * 7;
const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function cellStyle(count, max) {
  if (!count) return { background: "rgb(var(--surface-2) / 0.6)" };
  // Relative au meilleur jour du membre.
  const ratio = max > 1 ? Math.log(count + 1) / Math.log(max + 1) : 1;
  const step = ratio > 0.75 ? 0.9 : ratio > 0.5 ? 0.68 : ratio > 0.25 ? 0.44 : 0.24;
  return { background: `rgb(var(--primary) / ${step})` };
}

/** Profil qui masque son activité : la RPC ne renvoie rien et le bloc se retire. */
export default function WatchCalendar({ userId }) {
  const { data } = useCachedResource(
    userId ? `profile:calendar:${userId}` : null,
    () => getWatchCalendar(userId, DAYS),
    10 * 60 * 1000
  );

  const model = useMemo(() => {
    if (!data?.length) return null;
    const max = data.reduce((m, d) => Math.max(m, d.count), 0);
    const total = data.reduce((n, d) => n + d.count, 0);
    const best = data.reduce((b, d) => (d.count > (b?.count || 0) ? d : b), null);
    const activeDays = data.filter((d) => d.count > 0).length;

    // Pour aligner chaque ligne sur un jour de semaine.
    const first = new Date(`${data[0].day}T00:00:00`);
    const lead = (first.getDay() + 6) % 7; // lundi = 0
    const cells = [...Array.from({ length: lead }, () => null), ...data];

    const labels = [];
    let lastMonth = -1;
    for (let col = 0; col < Math.ceil(cells.length / 7); col++) {
      const cell = cells[col * 7] || cells[col * 7 + 1];
      if (!cell) continue;
      const month = new Date(`${cell.day}T00:00:00`).getMonth();
      if (month !== lastMonth) {
        labels.push({ col, label: MONTHS[month] });
        lastMonth = month;
      }
    }
    return { cells, max, total, best, activeDays, labels };
  }, [data]);

  // Sur un écran étroit, l'année défile : on l'ouvre sur les semaines récentes.
  const scrollerRef = useRef(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [model]);

  if (!model) return null;
  const { cells, max, total, best, activeDays, labels } = model;
  const columns = Math.ceil(cells.length / 7);

  return (
    <section className="mt-9">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b-2 border-border pb-2.5">
        <h3 className="font-display text-[0.7rem] font-bold uppercase tracking-kana text-muted">
          Une année de visionnage
        </h3>
        <p className="shrink-0 text-[11px] text-muted">
          {total.toLocaleString("fr-FR")} épisode{total > 1 ? "s" : ""} · {activeDays} jour
          {activeDays > 1 ? "s" : ""} actif{activeDays > 1 ? "s" : ""}
        </p>
      </div>

      <div ref={scrollerRef} className="mt-4 overflow-x-auto pb-1">
        <div className="flex gap-2" style={{ minWidth: columns * 14 + 24 }}>
          <div className="flex shrink-0 flex-col gap-[3px] pt-[15px]">
            {DAY_LABELS.map((d, i) => (
              <span
                key={i}
                className="flex h-[11px] items-center text-[9px] leading-none text-muted/60"
                style={{ visibility: i % 2 ? "visible" : "hidden" }}
              >
                {d}
              </span>
            ))}
          </div>
          <div className="min-w-0">
            <div
              className="grid h-3 gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${columns}, 11px)` }}
            >
              {Array.from({ length: columns }, (_, col) => {
                const label = labels.find((l) => l.col === col);
                return (
                  <span key={col} className="whitespace-nowrap text-[9px] leading-none text-muted/70">
                    {label?.label}
                  </span>
                );
              })}
            </div>
            <div
              className="grid grid-flow-col gap-[3px]"
              style={{ gridTemplateRows: "repeat(7, 11px)", gridAutoColumns: "11px" }}
            >
              {cells.map((cell, i) =>
                cell ? (
                  <span
                    key={cell.day}
                    className="rounded-[2px]"
                    style={cellStyle(cell.count, max)}
                    title={`${new Date(`${cell.day}T00:00:00`).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                    })} — ${cell.count} épisode${cell.count > 1 ? "s" : ""}`}
                  />
                ) : (
                  <span key={`pad-${i}`} />
                )
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted">
        {best?.count > 0 && (
          <span>
            Meilleur jour ·{" "}
            <strong className="font-bold text-text">
              {new Date(`${best.day}T00:00:00`).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
              })}
            </strong>{" "}
            ({best.count} ép.)
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          Moins
          {[0, 1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className="h-[11px] w-[11px] rounded-[2px]"
              style={cellStyle(step === 0 ? 0 : Math.round((max * step) / 4), max)}
            />
          ))}
          Plus
        </span>
      </div>
    </section>
  );
}
