import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Play, Heart, BookOpen, MessageSquare, Star } from "lucide-react";
import { formatFrenchDate } from "@/api/anizip";
import { getCoversByTitle } from "@/api/anilist";
import { getCachedEpisodeMeta, getEpisodeMeta, episodeThumbKey } from "@/api/profile";
import ProfileBlock from "./ProfileBlock";

/**
 * `items` = [{ kind:'watch'|'favorite', slug, title, cover, seasonId, episodeNumber, ts }].
 * `variant="compact"` : une ligne par activité, sans vignette.
 */
/** « 4 » → « ★★★★☆ » */
function stars(rating) {
  const n = Math.max(0, Math.min(5, Number(rating) || 0));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export default function ActivityFeed({
  items,
  loading,
  emptyLabel = "Aucune activité récente.",
  variant = "cards",
}) {
  const compact = variant === "compact";
  const [expanded, setExpanded] = useState(false);
  // Covers haute résolution AniList, avec repli sur l'original.
  const [hiRes, setHiRes] = useState({});
  const titlesKey = useMemo(
    () => (items || []).map((it) => it.title).filter(Boolean).join("|"),
    [items]
  );
  useEffect(() => {
    if (compact || !items?.length) return;
    let alive = true;
    getCoversByTitle(items.map((it) => it.title))
      .then((byTitle) => {
        if (!alive) return;
        const map = {};
        for (const it of items) {
          const url = it.title && byTitle[it.title.trim()];
          if (url) map[it.slug] = url;
        }
        setHiRes(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [titlesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const watched = useMemo(() => (items || []).filter((it) => it.kind === "watch"), [items]);
  const [meta, setMeta] = useState(() => getCachedEpisodeMeta(watched));
  const watchedKey = useMemo(
    () => watched.map((it) => episodeThumbKey(it.slug, it.seasonId, it.episodeNumber)).join(","),
    [watched]
  );
  useEffect(() => {
    if (!watched.length) return;
    setMeta(getCachedEpisodeMeta(watched));
    let alive = true;
    getEpisodeMeta(watched)
      .then((map) => {
        if (alive) setMeta(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [watchedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const describe = (it, info) => {
    const isWatch = it.kind === "watch";
    const isScan = it.kind === "scan";
    const isComment = it.kind === "comment";
    const isRating = it.kind === "rating";
    return {
      isWatch,
      isScan,
      isComment,
      isRating,
      to: isWatch
        ? `/watch/${it.slug}?season=${it.seasonId}&ep=${it.episodeNumber}`
        : `/anime/${it.slug}${isScan ? "?tab=scans" : isComment ? "?tab=commentaires" : ""}`,
      name:
        it.title || (it.slug || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      detail: isWatch
        ? it.episodeNumber != null
          ? `${info?.seasonShort ? `${info.seasonShort} ` : ""}Ép. ${it.episodeNumber}`
          : ""
        : isScan
        ? it.chapter != null
          ? `Ch. ${it.chapter}`
          : "scan lu"
        : isComment
        ? it.label || "commentaire"
        : isRating
        ? stars(it.label)
        : "favori",
    };
  };

  if (compact) {
    const shown = expanded ? items || [] : (items || []).slice(0, 6);
    return (
      <div>
        <div className="flex items-baseline justify-between border-b-2 border-border pb-2.5">
          <h3 className="font-display text-[0.7rem] font-bold uppercase tracking-kana text-muted">
            Activité
          </h3>
          {(items?.length || 0) > 6 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 whitespace-nowrap text-[11px] font-bold text-primary transition-opacity hover:opacity-75"
            >
              {expanded ? "Réduire" : "Tout voir"}
            </button>
          )}
        </div>
        {loading ? (
          <div className="mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="my-3 h-4 skeleton rounded" />
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <p className="mt-4 font-display text-sm font-medium leading-6 text-muted/70">{emptyLabel}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {shown.map((it, i) => {
              const info =
                it.kind === "watch"
                  ? meta[episodeThumbKey(it.slug, it.seasonId, it.episodeNumber)]
                  : null;
              const { isWatch, isScan, isComment, isRating, to, name, detail } = describe(it, info);
              const KindIcon = isWatch ? Play : isScan ? BookOpen : isComment ? MessageSquare : isRating ? Star : Heart;
              return (
                <li
                  key={`${it.kind}:${it.slug}:${it.ts}:${i}`}
                  className={`group relative ${
                    i === shown.length - 1 ? "" : "border-b border-border/70"
                  }`}
                >
                  <Link
                    to={to}
                    className="flex items-center gap-3 py-3 transition-opacity hover:opacity-75"
                  >
                    <span
                      className={`shrink-0 ${
                        isWatch
                          ? "text-primary"
                          : isScan
                          ? "text-accent"
                          : isComment
                          ? "text-sky-400"
                          : isRating
                          ? "text-amber-400"
                          : "text-sakura"
                      }`}
                    >
                      <KindIcon
                        size={13}
                        fill={isScan || isComment ? "none" : "currentColor"}
                        strokeWidth={2.2}
                      />
                    </span>
                    <p className="m-0 min-w-0 flex-1 truncate text-[13px]">
                      <strong className="font-bold">{name}</strong>
                      {isComment ? (
                        <span className="text-muted"> · « {detail} »</span>
                      ) : isRating ? (
                        <span className="text-amber-400/90"> {detail}</span>
                      ) : (
                        detail && <span className="text-muted"> {detail}</span>
                      )}
                    </p>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted/70">
                      {formatFrenchDate(it.ts)}
                    </span>
                  </Link>
                  {isWatch && (info?.image || info?.title || info?.season) && (
                    <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden w-64 overflow-hidden rounded-md bg-surface opacity-0 shadow-[0_18px_40px_rgb(0_0_0/0.6)] ring-1 ring-border transition-opacity duration-150 group-hover:opacity-100 sm:block">
                      {info.image && (
                        <img
                          src={info.image}
                          alt=""
                          loading="lazy"
                          className="h-32 w-full object-cover"
                        />
                      )}
                      <div className="p-3">
                        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">
                          {info.season || "Épisode"}
                          {it.episodeNumber != null ? ` · Ép. ${it.episodeNumber}` : ""}
                          {info.total ? ` / ${info.total}` : ""}
                        </p>
                        <p className="mt-1 font-display text-[13px] font-bold leading-snug text-text">
                          {info.title || name}
                        </p>
                        {info.title && <p className="mt-0.5 text-[11px] text-muted">{name}</p>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <ProfileBlock title="Activité récente">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[60px] skeleton rounded-md" />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <p className="py-6 text-center font-display text-sm font-medium text-muted/80">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => {
            const isWatch = it.kind === "watch";
            const isScan = it.kind === "scan";
            const isComment = it.kind === "comment";
            const isRating = it.kind === "rating";
            // Un scan renvoie à la fiche (section Scans) : `label` n'est pas la clé `oeuvre`.
            const to = isWatch
              ? `/watch/${it.slug}?season=${it.seasonId}&ep=${it.episodeNumber}`
              : `/anime/${it.slug}${isScan ? "?tab=scans" : isComment ? "?tab=commentaires" : ""}`;
            const name =
              it.title || (it.slug || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            const KindIcon = isWatch ? Play : isScan ? BookOpen : isComment ? MessageSquare : isRating ? Star : Heart;
            const info = isWatch ? meta[episodeThumbKey(it.slug, it.seasonId, it.episodeNumber)] : null;
            const image = info?.image || hiRes[it.slug] || it.cover;
            return (
              <li key={`${it.kind}:${it.slug}:${it.ts}:${i}`}>
                <Link
                  to={to}
                  className="flex items-center gap-2.5 rounded-xl bg-surface-2/60 p-2 ring-1 ring-transparent transition-colors duration-200 hover:bg-surface-2 hover:ring-primary/20 sm:gap-3.5 sm:rounded-md"
                >
                  <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:w-[74px] sm:rounded">
                    {image ? (
                      <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <span
                    className={`hidden h-6 w-6 shrink-0 items-center justify-center rounded-full sm:flex ${
                      isWatch
                        ? "bg-primary/12 text-primary"
                        : isScan
                        ? "bg-accent/15 text-accent"
                        : isComment
                        ? "bg-sky-400/15 text-sky-400"
                        : isRating
                        ? "bg-amber-400/15 text-amber-400"
                        : "bg-sakura/15 text-sakura"
                    }`}
                  >
                    <KindIcon
                      size={11}
                      strokeWidth={isScan || isComment ? 2 : undefined}
                      fill={isScan || isComment ? "none" : "currentColor"}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.7rem] uppercase tracking-wide text-muted">
                      {isWatch
                        ? "Regardé"
                        : isScan
                        ? "Scan lu"
                        : isComment
                        ? "Commenté"
                        : isRating
                        ? "Noté"
                        : "Ajouté en favori"}
                    </p>
                    <h3 className="line-clamp-1 font-display text-sm font-bold text-text">
                      {name}
                      {isWatch && it.episodeNumber != null && (
                        <span className="text-muted">
                          {" · "}
                          {info?.seasonShort ? `${info.seasonShort} ` : ""}Ép. {it.episodeNumber}
                        </span>
                      )}
                      {isScan && it.chapter != null && (
                        <span className="text-muted"> · Ch. {it.chapter}</span>
                      )}
                    </h3>
                    {isComment && it.label && (
                      <p className="mt-0.5 line-clamp-1 text-xs italic text-muted">« {it.label} »</p>
                    )}
                    {isRating && it.label && (
                      <p className="mt-0.5 text-xs text-amber-400/90">{stars(it.label)}</p>
                    )}
                  </div>
                  <span className="hidden shrink-0 text-[0.7rem] tabular-nums text-muted/70 sm:block">
                    {formatFrenchDate(it.ts)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ProfileBlock>
  );
}
