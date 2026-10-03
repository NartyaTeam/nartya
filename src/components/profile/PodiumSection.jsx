import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCoversByTitle } from "@/api/anilist";
import { formatWatchTime } from "./StatsRow";

// Rang 1 → 5, en pixels.
const HEIGHTS = [340, 300, 270, 246, 228];
const RANK_SIZE = [86, 70, 62, 54, 48];

/** Les cinq favoris épinglés les plus regardés. */
export default function PodiumSection({ items, username, isSelf = true }) {
  const top5 = useMemo(
    () => [...(items || [])].sort((a, b) => (b.watchSeconds || 0) - (a.watchSeconds || 0)).slice(0, 5),
    [items]
  );

  const [hiRes, setHiRes] = useState({});
  const titlesKey = top5.map((it) => it.title).filter(Boolean).join("|");
  useEffect(() => {
    if (!top5.length) return;
    let alive = true;
    getCoversByTitle(top5.map((it) => it.title))
      .then((byTitle) => {
        if (!alive) return;
        const map = {};
        for (const it of top5) {
          const url = it.title && byTitle[it.title.trim()];
          if (url) map[it.slug] = url;
        }
        setHiRes(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titlesKey]);

  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h3 className="font-display text-[0.7rem] font-bold uppercase tracking-kana text-primary">Le podium</h3>
        <p className="text-xs text-muted">les cinq séries que {username || "ce membre"} met en avant</p>
      </div>
      {items === null ? (
        <div className="mt-3.5 grid grid-cols-5 items-end gap-3.5">
          {HEIGHTS.map((h, i) => (
            <div key={i} className="skeleton rounded-[16px]" style={{ height: h }} />
          ))}
        </div>
      ) : !top5.length ? (
        <div className="mt-3.5 flex min-h-[140px] items-center justify-center rounded-md border border-dashed border-border/70 px-4 text-center">
          <p className="font-display text-xs font-medium leading-5 text-muted/70">
            {isSelf
              ? "Épingle jusqu'à 5 favoris depuis « Éditer » pour remplir ton podium."
              : "Aucun favori épinglé pour l'instant."}
          </p>
        </div>
      ) : (
      <div
        className="mt-3.5 grid items-end gap-3.5"
        style={{ gridTemplateColumns: `repeat(${top5.length}, minmax(0, 1fr))` }}
      >
        {top5.map((it, i) => (
          <Link key={it.slug} to={`/anime/${it.slug}`} className="group min-w-0" title={it.title || it.slug}>
            <div
              className={`relative overflow-hidden rounded-[16px] bg-surface-2 ${
                i === 0 ? "ring-2 ring-inset ring-primary" : "ring-1 ring-inset ring-border/90"
              }`}
              style={{
                height: HEIGHTS[i],
                boxShadow: i === 0 ? "0 18px 40px rgb(0 0 0 / 0.55)" : "0 14px 32px rgb(0 0 0 / 0.5)",
              }}
            >
              {(hiRes[it.slug] || it.cover) && (
                <img
                  src={hiRes[it.slug] || it.cover}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  // `absolute inset-0` + `transform-gpu` : en flux normal, l'affiche ripait au retour du zoom.
                  className="absolute inset-0 h-full w-full transform-gpu object-cover transition-transform duration-300 will-change-transform group-hover:scale-105"
                />
              )}
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/90 via-transparent to-transparent" />
              <span className="pointer-events-none absolute inset-x-2 bottom-0.5 flex items-end gap-2">
                <span
                  className="font-display font-black leading-none"
                  style={{
                    fontSize: RANK_SIZE[i],
                    color: i === 0 ? "rgb(var(--primary))" : i < 3 ? "rgb(var(--text))" : "rgb(var(--text) / 0.85)",
                    textShadow: "0 4px 24px rgb(0 0 0 / 0.9)",
                  }}
                >
                  {i + 1}
                </span>
                {it.episodesWatched > 0 && (
                  <span className="mb-1.5 flex items-center gap-2">
                    <span
                      className="font-display font-semibold leading-none text-white/30"
                      style={{ fontSize: Math.max(14, RANK_SIZE[i] * 0.26) }}
                    >
                      |
                    </span>
                    <span
                      className="font-display font-semibold leading-none text-white/70"
                      style={{ fontSize: Math.max(10, RANK_SIZE[i] * 0.15), textShadow: "0 3px 14px rgb(0 0 0 / 0.9)" }}
                    >
                      {it.episodesWatched} ép.
                      {it.watchSeconds > 0 && ` · ${formatWatchTime(it.watchSeconds).replace(" h ", "h")}`}
                    </span>
                  </span>
                )}
              </span>
            </div>
            <p className="mt-2 line-clamp-1 font-display text-[13px] font-bold leading-tight text-text">
              {it.title || it.slug}
            </p>
          </Link>
        ))}
      </div>
      )}
    </section>
  );
}
