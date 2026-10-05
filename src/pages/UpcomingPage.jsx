import { useCallback, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { getRow } from "@/api/anilist";
import { getCurrentSeason, getNextSeason, SEASON_LABELS } from "@/utils/animeSeason";
import CatalogResults from "@/components/catalog/CatalogResults";
import { platform } from "@/platform";

const TABS = [
  { id: "current", label: "Cette saison", ...getCurrentSeason() },
  { id: "next", label: "Saison prochaine", ...getNextSeason() },
];

const seasonCache = new Map();
const SWIPE_EDGE_GUARD = 64;
const SWIPE_MIN_DISTANCE = 72;
const SWIPE_AXIS_RATIO = 1.35;

export default function UpcomingPage() {
  const [tabId, setTabId] = useState("current");
  const swipeRef = useRef(null);
  const suppressClickRef = useRef(false);
  const tab = TABS.find((t) => t.id === tabId);

  const fetchPage = useCallback(
    (page) => {
      if (page > 1) return [];
      const cacheKey = `${tab.season}:${tab.year}`;
      if (seasonCache.has(cacheKey)) return seasonCache.get(cacheKey);
      const request = getRow({
        sort: ["POPULARITY_DESC"],
        season: tab.season,
        year: tab.year,
        perPage: 40,
      })
        .then((list) => list.map((a) => ({ ...a, image: a.cover })))
        .catch((error) => {
          seasonCache.delete(cacheKey);
          throw error;
        });
      seasonCache.set(cacheKey, request);
      return request;
    },
    [tab]
  );

  const selectTab = useCallback((nextId, withHaptic = false) => {
    setTabId((current) => {
      if (current === nextId) return current;
      if (withHaptic) platform.haptic?.("light");
      return nextId;
    });
  }, []);

  const handlePointerDown = (event) => {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    const viewportWidth = window.innerWidth;
    if (
      event.clientX < SWIPE_EDGE_GUARD ||
      event.clientX > viewportWidth - SWIPE_EDGE_GUARD
    ) {
      swipeRef.current = null;
      return;
    }
    swipeRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handlePointerUp = (event) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (
      Math.abs(deltaX) < SWIPE_MIN_DISTANCE ||
      Math.abs(deltaX) < Math.abs(deltaY) * SWIPE_AXIS_RATIO
    ) return;

    // Un swipe commencé sur une carte ne doit jamais l'ouvrir.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 350);

    selectTab(deltaX < 0 ? "next" : "current", true);
  };

  const handleClickCapture = (event) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className="relative min-h-full overflow-hidden px-4 pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:p-8"
      style={{ touchAction: "pan-y pinch-zoom" }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeRef.current = null;
      }}
      onClickCapture={handleClickCapture}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px]"
        style={{
          background:
            "radial-gradient(65% 70% at 80% 0%, rgb(var(--primary) / .16), transparent 72%)",
        }}
      />

      <div className="relative mx-auto max-w-[1500px] animate-fade-in">
        <header className="mb-7 md:mb-8">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-primary/70" />
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
              Calendrier saisonnier
            </p>
          </div>
          <h1 className="t-impact text-4xl sm:text-5xl mt-3">
            À venir
          </h1>
        </header>

        <div
          className="grid grid-cols-2 border-b border-white/[0.1] md:mb-8 md:w-[430px]"
          role="tablist"
          aria-label="Saison à afficher"
        >
          {TABS.map((t) => {
            const active = tabId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(t.id)}
                className={`relative min-w-0 px-2 pb-3 pt-1 text-left transition-colors active:opacity-70 ${
                  active
                    ? "text-text"
                    : "text-muted/65 md:hover:text-muted"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
                <span className="block truncate text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
                  {t.label}
                </span>
                <span className="mt-0.5 block truncate font-display text-sm font-bold sm:text-base">
                  {SEASON_LABELS[t.season]} {t.year}
                </span>
              </button>
            );
          })}
        </div>

        <section className="mt-8 border-t border-white/[0.07] pt-6 md:mt-0 md:pt-7">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-primary">
                <CalendarDays size={13} /> Programme
              </p>
              <h2 className="section-title mt-1 !text-2xl">
                {SEASON_LABELS[tab.season]} {tab.year}
              </h2>
            </div>
            <span className="hidden text-xs text-muted sm:block">
              Trié par popularité
            </span>
          </div>

          <div key={tabId} className="animate-fade-in-fast">
            <CatalogResults
              fetchPage={fetchPage}
              resetKey={tabId}
              emptyLabel="Aucune sortie annoncée pour cette saison."
              gridClassName="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-5 sm:gap-y-8"
              cardProps={{ showFavorite: false, titleLines: 2 }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
