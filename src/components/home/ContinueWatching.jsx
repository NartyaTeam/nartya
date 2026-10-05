import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useEmblaCarousel from "embla-carousel-react";
import { BookOpen, ChevronLeft, ChevronRight, Clapperboard, Play, X } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { getContinueWatching, hideAnimeFromResume } from "@/api/progress";
import {
  enrichHistoryItems,
  applyCachedEnrichment,
  advanceCompletedItems,
  advanceCompletedItemsAsync,
} from "@/utils/watchHistory";
import { getContinueReadingScans, hideScanFromResume } from "@/api/scanProgress";
import { platform } from "@/platform";
import { prewarmEpisode } from "@/utils/episodeVideoUtils";

const HOVER_PREWARM_DELAY_MS = 250;

/** Nouvel épisode d'abord, puis les reprises du plus récent au plus ancien. */
function sortResume(items, limit) {
  const byDate = (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  const fresh = items.filter((i) => i.newEpisode).sort(byDate);
  const rest = items.filter((i) => !i.newEpisode).sort(byDate);
  return [...fresh, ...rest].slice(0, limit);
}

/** « 12:34 », ou null si inconnu. */
function remainingLabel(item) {
  if (!item.duration || item.duration <= 0) return null;
  const left = Math.max(0, item.duration - item.positionSeconds);
  if (left < 30) return null; // quasi terminé
  const m = Math.floor(left / 60);
  const s = Math.floor(left % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ResumeCard({ item, onRemove }) {
  const navigate = useNavigate();
  const img = item.episodeImage || item.cover;
  const remaining = remainingLabel(item);
  const animeUrl = `/anime/${item.slug}?season=${item.seasonId}&lang=${item.language}`;
  const watchUrl = `/watch/${item.slug}?season=${item.seasonId}&ep=${item.episodeNumber}&lang=${item.language}`;

  // Deux push : la fiche est empilée sous le lecteur, pour que le retour y mène.
  const resume = () => {
    navigate(animeUrl);
    navigate(watchUrl);
  };

  // Au survol, l'épisode est préparé avant le clic.
  const hoverTimerRef = useRef(null);
  const cancelHover = () => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  };
  useEffect(() => cancelHover, []);
  const startHover = (event) => {
    if (event.pointerType !== "mouse") return;
    cancelHover();
    hoverTimerRef.current = window.setTimeout(
      () => prewarmEpisode(item.slug, item.seasonId, item.episodeNumber, item.language),
      HOVER_PREWARM_DELAY_MS
    );
  };

  return (
    <div className="group relative">
      <button
        onClick={() => onRemove(item)}
        title="Retirer de Reprendre"
        aria-label="Retirer de Reprendre"
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-100 shadow-sm backdrop-blur-sm transition-all active:scale-95 md:bg-transparent md:opacity-0 md:hover:scale-110 md:focus-visible:opacity-100 md:group-hover:opacity-100"
      >
        <X size={20} strokeWidth={2.5} />
      </button>

      <button
        onClick={resume}
        onPointerEnter={startHover}
        onPointerLeave={cancelHover}
        className="block w-full text-left transition-transform active:scale-[0.98] md:active:scale-100"
      >
        <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-2 [transform:translateZ(0)]">
          {item.newEpisode && (
            <span className="absolute left-2 top-2 z-10 rounded bg-primary px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-primary-fg shadow-sm">
              Nouveau
            </span>
          )}
          {img ? (
            <img
              src={img}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full skeleton" />
          )}

          <div className="absolute inset-0 hidden items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/45 group-hover:opacity-100 md:flex">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-fg">
              <Play size={20} className="ml-0.5 fill-current" />
            </span>
          </div>

          {remaining && (
            <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums backdrop-blur-sm">
              {remaining}
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <span
              className="block h-full bg-primary"
              style={{ width: `${Math.max(3, item.progressPercent)}%` }}
            />
          </div>
        </div>
      </button>

      <button
        onClick={() => navigate(`/anime/${item.slug}`)}
        className="mt-2 block w-full text-left"
      >
        <h3 className="line-clamp-1 text-sm font-semibold text-text transition-colors hover:text-primary">
          {item.title || item.slug}
        </h3>
      </button>
      <p className="mt-0.5 line-clamp-1 text-xs text-muted">
        {item.seasonName ? `${item.seasonName} · ` : ""}Épisode {item.episodeNumber} ·{" "}
        {item.language?.toUpperCase()}
      </p>
    </div>
  );
}

function ScanResumeCard({ item, onRemove }) {
  const navigate = useNavigate();
  const scanUrl = `/scan/${item.slug}?oeuvre=${encodeURIComponent(item.oeuvre)}&chapter=${item.chapter}`;

  return (
    <div className="group relative">
      <button
        onClick={() => onRemove(item)}
        title="Retirer des scans à reprendre"
        aria-label="Retirer des scans à reprendre"
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-100 shadow-sm backdrop-blur-sm transition-all active:scale-95 md:bg-transparent md:opacity-0 md:hover:scale-110 md:focus-visible:opacity-100 md:group-hover:opacity-100"
      >
        <X size={20} strokeWidth={2.5} />
      </button>
      <button onClick={() => navigate(scanUrl)} className="block w-full text-left transition-transform active:scale-[0.98] md:active:scale-100">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-2 [transform:translateZ(0)]">
          {item.cover ? (
            <img
              src={item.cover}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full skeleton" />
          )}
          <div className="absolute inset-0 hidden items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/45 group-hover:opacity-100 md:flex">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-fg">
              <BookOpen size={21} />
            </span>
          </div>
          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums backdrop-blur-sm">
            Page {item.page + 1}
          </span>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <span
              className="block h-full bg-primary"
              style={{ width: `${Math.max(3, item.progressPercent)}%` }}
            />
          </div>
        </div>
      </button>
      <button
        onClick={() => navigate(`/anime/${item.slug}?tab=scans&chapter=${item.chapter}`)}
        className="mt-2 block w-full text-left"
      >
        <h3 className="line-clamp-1 text-sm font-semibold text-text transition-colors hover:text-primary">
          {item.title || item.slug}
        </h3>
      </button>
      <p className="mt-0.5 line-clamp-1 text-xs text-muted">
        Chapitre {item.chapter}
        {item.oeuvreLabel ? ` · ${item.oeuvreLabel}` : ""}
      </p>
    </div>
  );
}

// Gardée pour un affichage instantané au retour sur la Home.
let cachedItems = [];
let cachedScanItems = [];

export default function ContinueWatching({ defaultTab = null, onlyScans = false }) {
  const session = useAuthStore((s) => s.session);
  const canResume = !!session && !session.user?.is_anonymous;
  const resumeLimit = useSettingsStore((s) => s.resumeLimit);
  const [items, setItems] = useState(cachedItems);
  const [scanItems, setScanItems] = useState(cachedScanItems);
  const [activeTab, setActiveTab] = useState(
    defaultTab || (cachedItems.length ? "anime" : "scans")
  );
  const reqId = useRef(0);
  const visibleItems = onlyScans || activeTab === "scans" ? scanItems : items;

  const [emblaRef, embla] = useEmblaCarousel({
    active: !platform.isMobile,
    dragFree: true,
    containScroll: "trimSnaps",
    align: "start",
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!embla) return;
    setCanPrev(embla.canScrollPrev());
    setCanNext(embla.canScrollNext());
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    onSelect();
    embla.on("select", onSelect);
    embla.on("reInit", onSelect);
    return () => {
      embla.off("select", onSelect);
      embla.off("reInit", onSelect);
    };
  }, [embla, onSelect]);

  useEffect(() => {
    embla?.reInit();
  }, [embla, visibleItems, activeTab]);

  // Retrait optimiste, masqué en base ensuite.
  const handleRemove = useCallback(async (item) => {
    const keep = (arr) => arr.filter((i) => i.slug !== item.slug);
    setItems(keep);
    cachedItems = keep(cachedItems);
    await hideAnimeFromResume(item.slug);
  }, []);

  const handleScanRemove = useCallback(
    async (item) => {
      const keep = (arr) => arr.filter((i) => i.scanKey !== item.scanKey);
      setScanItems(keep);
      cachedScanItems = keep(cachedScanItems);
      if (!onlyScans && scanItems.length === 1 && items.length) setActiveTab("anime");
      await hideScanFromResume(item.scanKey);
    },
    [items.length, onlyScans, scanItems.length]
  );

  useEffect(() => {
    if (!canResume) {
      cachedItems = [];
      cachedScanItems = [];
      setItems([]);
      setScanItems([]);
      return;
    }
    const id = ++reqId.current;
    (async () => {
      // Vivier plus large que l'affichage : un anime « à jour » avec un nouvel épisode a une date de
      // visionnage ancienne.
      const candidates = Math.max(24, resumeLimit * 2);
      const [base, scans] = await Promise.all([
        getContinueWatching(candidates),
        getContinueReadingScans(resumeLimit),
      ]);
      if (id !== reqId.current) return;
      cachedScanItems = scans;
      setScanItems(scans);
      if (defaultTab === "scans" && scans.length) setActiveTab("scans");
      else if (!base.length && scans.length) setActiveTab("scans");
      else if (base.length && !scans.length) setActiveTab("anime");
      // Synchrone, depuis le cache.
      setItems(sortResume(advanceCompletedItems(applyCachedEnrichment(base)), resumeLimit));
      // Résout aussi l'épisode suivant dans une nouvelle saison.
      const enriched = sortResume(
        await advanceCompletedItemsAsync(await enrichHistoryItems(base)),
        resumeLimit
      );
      if (id !== reqId.current) return;
      cachedItems = enriched;
      setItems(enriched);
    })();
  }, [canResume, defaultTab, resumeLimit]);

  if (onlyScans ? !scanItems.length : !items.length && !scanItems.length) return null;

  return (
    <section className="carousel-section relative pt-6">
      <div className={`flex items-center justify-between px-4 sm:px-8 ${scanItems.length && !onlyScans ? "" : "mb-3"}`}>
        <h2 className="section-title">
          {onlyScans ? "Continuer à lire" : "Reprendre"}
        </h2>
        <div className="hidden gap-1 md:flex">
          <button
            onClick={() => embla?.scrollPrev()}
            disabled={!canPrev}
            className="flex h-8 w-8 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.06] hover:text-text disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => embla?.scrollNext()}
            disabled={!canNext}
            className="flex h-8 w-8 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.06] hover:text-text disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {!onlyScans && scanItems.length > 0 && (
        <div className="mb-3 mt-2 border-b border-border px-4 sm:px-8">
          <div className="flex gap-1" role="tablist" aria-label="Type de lecture">
            {[
              ...(items.length
                ? [{ id: "anime", label: "Animés", Icon: Clapperboard }]
                : []),
              { id: "scans", label: "Scans", Icon: BookOpen },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  activeTab === id
                    ? "border-primary text-text"
                    : "border-transparent text-muted hover:text-text"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="select-none overflow-hidden px-4 sm:px-8" ref={emblaRef} data-carousel-viewport>
        <div className="flex gap-4" data-carousel-track>
          {visibleItems.map((item) => (
            <div
              key={item.episodeKey || item.scanKey}
              className={`min-w-0 shrink-0 grow-0 ${
                onlyScans
                  ? "basis-[82vw] max-w-[340px] sm:basis-[340px]"
                  : "basis-[260px] sm:basis-[300px]"
              }`}
              data-carousel-card
            >
              {onlyScans || activeTab === "scans" ? (
                <ScanResumeCard item={item} onRemove={handleScanRemove} />
              ) : (
                <ResumeCard item={item} onRemove={handleRemove} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
