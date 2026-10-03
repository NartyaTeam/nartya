import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Loader2,
  BookOpen,
  Maximize,
  Minimize,
  GalleryVertical,
  GalleryHorizontal,
} from "lucide-react";
import { getAnimePage, getAnimeScans, getScanChapters, scanPageUrl } from "@/api/animeApi";
import { getScanProgress, saveScanProgress } from "@/api/scanProgress";
import { useCachedResource } from "@/hooks/useCachedResource";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { downloadsAvailable, getLocalPlaybackUrl, scanDownloadId } from "@/api/downloads";
import { DownloadControl } from "@/components/AnimePage/EpisodeCard";
import { ChapterPicker } from "@/components/ui/ChapterPicker";
import { MobileChapterSheet } from "@/components/ui/MobileChapterSheet";
import { toast } from "@/lib/toast";
import { GUEST_FEATURE_MSG } from "@/lib/guest";

const SAVE_DEBOUNCE_MS = 1500;
const MODE_KEY = "nartya_scan_mode";

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const distBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midBetween = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "horizontal" ? "horizontal" : "vertical";
  } catch {
    return "vertical";
  }
}

/**
 * `/scan/:slug?oeuvre=<nom>&chapter=<n>`. Défilement vertical ou pages horizontales. Son propre
 * conteneur de scroll : les overlays ne bougent pas quand un menu verrouille le body.
 */
export default function ScanReaderPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id || null;
  const isGuest = !!session?.user?.is_anonymous;

  const oeuvre = params.get("oeuvre") || "";
  const chapter = Number(params.get("chapter")) || 1;

  // local=1, ou chapitre déjà téléchargé.
  const localMode = params.get("local") === "1";
  const dlId = oeuvre ? scanDownloadId(slug, oeuvre, chapter) : null;
  const localItem = useDownloadsStore((s) => (dlId ? s.byId[dlId] : null));
  const readLocal = (localMode || localItem?.status === "done") && !!localItem;
  const [localUrls, setLocalUrls] = useState([]);
  const canDownload = downloadsAvailable() && !isGuest;
  const startDownloadAction = useDownloadsStore((s) => s.start);
  const cancelDownloadAction = useDownloadsStore((s) => s.cancel);
  const removeDownloadAction = useDownloadsStore((s) => s.remove);

  const [mode, setMode] = useState(loadMode);
  const [currentPage, setCurrentPage] = useState(0); // à partir de 0
  const [controls, setControls] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const [chapterSheetOpen, setChapterSheetOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragRef = useRef(null);

  // Le zoom natif de la WebView zoomerait toute l'interface : pinch réimplémenté sur la page
  // affichée, avec panoramique à un doigt.
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const panPrevRef = useRef(null);
  const resetZoom = useCallback(() => setZoom({ scale: 1, x: 0, y: 0 }), []);
  // En mode horizontal.
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 0));

  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const pageRef = useRef(0);
  const saveTimer = useRef(null);
  const pendingPos = useRef(null); // 'start' | 'end'

  const { data: chapData, loading } = useCachedResource(
    oeuvre ? `scan-chapters:${oeuvre}` : null,
    () => getScanChapters(oeuvre),
    15 * 60 * 1000
  );
  const { data: pageData } = useCachedResource(
    slug ? `anime:page:${slug}` : null,
    () => getAnimePage(slug),
    10 * 60 * 1000
  );
  const { data: scansData } = useCachedResource(
    slug ? `scans:${slug}` : null,
    () => getAnimeScans(slug),
    10 * 60 * 1000
  );

  const chapters = chapData?.chapters || [];
  const imageBase = chapData?.imageBase || "";
  const current = chapters.find((c) => c.chapter === chapter) || null;
  // Hors ligne : métadonnées de l'entrée téléchargée.
  const pages = current?.pages || localItem?.pages || 0;
  // `chapter` = numéro affiché ; `folder` = dossier réel (URL des images).
  const folder = current?.folder ?? localItem?.folder ?? chapter;

  const meta = useMemo(() => {
    const label = (scansData || []).find((s) => s.oeuvre === oeuvre)?.label || localItem?.oeuvreLabel || null;
    return {
      title: pageData?.anime?.title || localItem?.animeTitle || null,
      cover:
        pageData?.images?.poster ||
        pageData?.anilist?.cover ||
        pageData?.anime?.image ||
        localItem?.animeCover ||
        null,
      label,
    };
  }, [pageData, scansData, oeuvre, localItem]);

  // Résolues une fois par chapitre.
  useEffect(() => {
    if (!readLocal || !dlId || !pages) {
      setLocalUrls([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      Array.from({ length: pages }, (_, i) =>
        getLocalPlaybackUrl(dlId, `p${String(i + 1).padStart(3, "0")}.jpg`)
      )
    ).then((urls) => {
      if (!cancelled) setLocalUrls(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [readLocal, dlId, pages]);

  const pageSrc = (p) => (readLocal && localUrls[p - 1]) || scanPageUrl(imageBase, oeuvre, folder, p);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const pageRatiosRef = useRef(new Map());

  useEffect(() => {
    pageRatiosRef.current.clear();
    resetZoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oeuvre, chapter]);

  const chapterIndex = chapters.findIndex((c) => c.chapter === chapter);
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;

  // Sauvegarde de progression
  const flushSave = useCallback(
    (pageIdx, completed) => {
      if (!userId || !oeuvre || !pages) return;
      saveScanProgress({
        slug,
        oeuvre,
        chapter,
        page: pageIdx,
        totalPages: pages,
        completed,
        oeuvreLabel: metaRef.current.label,
        title: metaRef.current.title,
        cover: metaRef.current.cover,
        userId,
      });
    },
    [userId, oeuvre, slug, chapter, pages]
  );

  const setPage = useCallback(
    (idx) => {
      pageRef.current = idx;
      setCurrentPage(idx);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => flushSave(idx, idx >= pages - 1), SAVE_DEBOUNCE_MS);
    },
    [flushSave, pages]
  );

  // Immédiate à la fermeture et au changement de chapitre.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pages) flushSave(pageRef.current, pageRef.current >= pages - 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oeuvre, chapter, pages]);

  const scrollToPage = useCallback((idx, behavior = "auto") => {
    document.getElementById(`scan-page-${idx}`)?.scrollIntoView({ behavior, block: "start" });
  }, []);

  // Position initiale : nav explicite > reprise > début
  useEffect(() => {
    if (!pages) return;
    const pos = pendingPos.current;
    pendingPos.current = null;
    let cancelled = false;

    const apply = (idx) => {
      if (cancelled) return;
      pageRef.current = idx;
      setCurrentPage(idx);
      if (mode === "vertical") requestAnimationFrame(() => scrollToPage(idx));
      else if (scrollRef.current) scrollRef.current.scrollTop = 0;
    };

    if (pos === "end") apply(pages - 1);
    else if (pos === "start") apply(0);
    else {
      (async () => {
        const saved = userId ? await getScanProgress(slug, oeuvre, userId).catch(() => null) : null;
        if (cancelled) return;
        if (saved && saved.chapter === chapter && saved.page > 0 && saved.page < pages) apply(saved.page);
        else apply(0);
      })();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oeuvre, chapter, pages]);

  // La page courante est conservée.
  useEffect(() => {
    if (mode === "vertical" && pages) requestAnimationFrame(() => scrollToPage(pageRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Page visible en mode vertical
  useEffect(() => {
    if (mode !== "vertical" || !pages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          // Pendant un zoom, le `transform` fausse l'intersection.
          if (zoomRef.current.scale > 1) continue;
          const idx = Number(e.target.dataset.page);
          if (!Number.isNaN(idx)) {
            pageRef.current = idx;
            setCurrentPage(idx);
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => flushSave(idx, idx >= pages - 1), SAVE_DEBOUNCE_MS);
          }
        }
      },
      { root: scrollRef.current, rootMargin: "-45% 0px -45% 0px" }
    );
    document.querySelectorAll("[data-page]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [mode, pages, chapter, flushSave]);

  // Plein écran
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onResize);
    };
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.();
  };

  const toggleMode = () => {
    resetZoom();
    setMode((m) => {
      const next = m === "vertical" ? "horizontal" : "vertical";
      try {
        localStorage.setItem(MODE_KEY, next);
      } catch {}
      return next;
    });
  };

  // Navigation page / chapitre
  const goChapter = useCallback(
    (chap, pos = "start") => {
      if (!chap) return;
      pendingPos.current = pos;
      const next = new URLSearchParams(params);
      next.set("chapter", String(chap));
      // Sinon chaque chapitre lu empile une entrée d'historique.
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const goToPage = useCallback(
    (idx) => {
      resetZoom();
      if (idx < 0) return prevChapter && goChapter(prevChapter.chapter, "end");
      if (idx >= pages) return nextChapter && goChapter(nextChapter.chapter, "start");
      setPage(idx);
      if (mode === "vertical") scrollToPage(idx, "smooth");
    },
    [pages, mode, prevChapter, nextChapter, goChapter, setPage, scrollToPage, resetZoom]
  );
  const nextPage = useCallback(() => goToPage(pageRef.current + 1), [goToPage]);
  const prevPage = useCallback(() => goToPage(pageRef.current - 1), [goToPage]);

  // Gestes : glissement de page, pinch et panoramique une fois zoomé. En vertical, le scroll
  // natif fait le travail ; ces handlers distinguent un tap d'un scroll.
  const onGestureStart = (e) => {
    // Un bouton ou un lien gère son propre clic.
    if (e.target?.closest?.("button, a")) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      // Deuxième doigt : pinch, le glissement de page en cours est annulé.
      dragRef.current = null;
      setDragX(0);
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        startDist: distBetween(a, b),
        startScale: zoomRef.current.scale,
        startMid: midBetween(a, b),
        startX: zoomRef.current.x,
        startY: zoomRef.current.y,
      };
      panPrevRef.current = null;
      return;
    }

    if (pointersRef.current.size === 1) {
      if (zoomRef.current.scale > 1) panPrevRef.current = { x: e.clientX, y: e.clientY };
      else dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
    }
  };

  const onGestureMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const scale = clamp(
        pinchRef.current.startScale * (distBetween(a, b) / pinchRef.current.startDist),
        ZOOM_MIN,
        ZOOM_MAX
      );
      const m = midBetween(a, b);
      const bound = (scale - 1) * 220;
      setZoom({
        scale,
        x: clamp(
          pinchRef.current.startX + (m.x - pinchRef.current.startMid.x) / pinchRef.current.startScale,
          -bound,
          bound
        ),
        y: clamp(
          pinchRef.current.startY + (m.y - pinchRef.current.startMid.y) / pinchRef.current.startScale,
          -bound,
          bound
        ),
      });
      return;
    }

    if (pointersRef.current.size !== 1) return;

    if (zoomRef.current.scale > 1 && panPrevRef.current) {
      const dx = e.clientX - panPrevRef.current.x;
      const dy = e.clientY - panPrevRef.current.y;
      panPrevRef.current = { x: e.clientX, y: e.clientY };
      setZoom((z) => {
        const bound = (z.scale - 1) * 220;
        return {
          scale: z.scale,
          x: clamp(z.x + dx / z.scale, -bound, bound),
          y: clamp(z.y + dy / z.scale, -bound, bound),
        };
      });
      return;
    }

    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) d.moved = true;
    if (mode !== "horizontal") return; // vertical : scroll natif
    // Résistance élastique aux extrémités du chapitre.
    let sx = dx;
    if ((pageRef.current === 0 && sx > 0) || (pageRef.current === pages - 1 && sx < 0)) sx /= 3;
    setDragX(sx);
  };

  const endGesture = (e, cancelled) => {
    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size >= 1) {
      // Il reste un doigt : panoramique si zoomé.
      pinchRef.current = null;
      const remaining = [...pointersRef.current.values()][0];
      if (zoomRef.current.scale > 1) panPrevRef.current = remaining;
      else dragRef.current = { startX: remaining.x, startY: remaining.y, moved: false };
      return;
    }

    pinchRef.current = null;
    panPrevRef.current = null;
    const d = dragRef.current;
    dragRef.current = null;

    if (zoomRef.current.scale > 1.02) {
      // Un tap désactive le zoom.
      if (!cancelled && d && !d.moved) resetZoom();
      return;
    }
    if (zoomRef.current.scale !== 1) resetZoom();

    if (cancelled || !d) {
      setDragX(0);
      return;
    }

    if (mode !== "horizontal") {
      // Vertical : un tap bascule les contrôles.
      if (!d.moved) setControls((v) => !v);
      return;
    }

    const dx = e.clientX - d.startX;
    setDragX(0);
    const threshold = Math.min(120, window.innerWidth * 0.15);
    if (dx <= -threshold) return nextPage();
    if (dx >= threshold) return prevPage();
    // Zones gauche/droite = page, centre = contrôles.
    if (!d.moved) {
      const r = e.clientX / window.innerWidth;
      if (r < 0.4) prevPage();
      else if (r > 0.6) nextPage();
      else setControls((v) => !v);
    }
  };

  const onGestureEnd = (e) => endGesture(e, false);
  const onGestureCancel = (e) => endGesture(e, true);

  // Flèches = page, Page↑/↓ = chapitre, F = plein écran.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "SELECT") return;
      // Un contrôle overlay garde le focus après un clic.
      const active = document.activeElement;
      const dropFocus = () => active instanceof HTMLElement && active.blur();
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
          e.preventDefault();
          dropFocus();
          nextPage();
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          dropFocus();
          prevPage();
          break;
        case "PageDown":
          e.preventDefault();
          goChapter(nextChapter?.chapter, "start");
          break;
        case "PageUp":
          e.preventDefault();
          goChapter(prevChapter?.chapter, "start");
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPage, prevPage, nextChapter, prevChapter]);

  const backToAnime = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    // Remplacée par la fiche, onglet Scans, sur le chapitre en cours.
    const q = new URLSearchParams();
    q.set("tab", "scans");
    if (oeuvre) q.set("oeuvre", oeuvre);
    if (chapter) q.set("chapter", String(chapter));
    navigate(`/anime/${slug}?${q.toString()}`, { replace: true });
  };

  const fade = controls ? "opacity-100" : "pointer-events-none opacity-0";

  return (
    <div ref={rootRef} className="fixed inset-0 z-40 select-none overflow-hidden bg-black">
      <header
        className={`absolute inset-x-0 top-0 z-30 flex items-center gap-1 border-b border-white/10 bg-black/80 px-2 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)] backdrop-blur-md transition-opacity duration-200 md:gap-2 md:px-3 md:py-2.5 ${fade}`}
      >
        <button
          onClick={backToAnime}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white md:w-auto md:gap-1.5 md:px-2"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Retour</span>
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-xs font-semibold text-white sm:text-sm">
            {meta.title || slug}
            {meta.label && <span className="hidden text-white/45 sm:inline"> · {meta.label}</span>}
          </p>
          <p className="hidden text-xs text-white/45 md:block">Chapitre {chapter}</p>
        </div>

        {chapters.length > 0 && (
          <ChapterPicker
            value={chapter}
            chapters={chapters}
            onChange={(c) => goChapter(c, "start")}
            align="end"
            className="hidden w-40 md:block"
          />
        )}

        {chapters.length > 0 && (
          <button
            type="button"
            onClick={() => setChapterSheetOpen(true)}
            className="flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-white/80 active:bg-white/10 md:hidden"
          >
            Ch. {chapter}
            <ChevronDown size={14} className="text-white/45" />
          </button>
        )}

        {canDownload && (
          <div className="flex h-9 w-9 items-center justify-center rounded-md text-white/80">
            <DownloadControl
              download={localItem}
              onDownload={() => {
                if (isGuest) return void toast.info(GUEST_FEATURE_MSG);
                if (!oeuvre || !pages) return;
                startDownloadAction({
                  id: dlId,
                  type: "scan",
                  slug,
                  oeuvre,
                  oeuvreLabel: meta.label,
                  chapter,
                  folder,
                  pages,
                  imageBase,
                  animeTitle: meta.title,
                  animeCover: meta.cover,
                });
              }}
              onCancel={() => cancelDownloadAction(dlId)}
              onRemove={() => removeDownloadAction(dlId)}
            />
          </div>
        )}
        <button
          onClick={toggleMode}
          title={mode === "vertical" ? "Passer en lecture horizontale" : "Passer en défilement vertical"}
          className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          {mode === "vertical" ? <GalleryHorizontal size={18} /> : <GalleryVertical size={18} />}
        </button>
        <button
          onClick={toggleFullscreen}
          title={isFs ? "Quitter le plein écran" : "Plein écran"}
          className="hidden h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white md:flex"
        >
          {isFs ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </header>

      <MobileChapterSheet
        open={chapterSheetOpen}
        chapters={chapters}
        value={chapter}
        onChange={(value) => goChapter(value, "start")}
        onClose={() => setChapterSheetOpen(false)}
      />

      {loading && !pages ? (
        <div className="flex h-full items-center justify-center gap-2 text-white/70">
          <Loader2 className="animate-spin" size={20} />
          Chargement du chapitre…
        </div>
      ) : !pages ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-white/70">
          <BookOpen size={28} className="text-white/40" />
          Chapitre introuvable.
          <button onClick={backToAnime} className="text-sm text-primary hover:underline">
            Retour à la fiche
          </button>
        </div>
      ) : mode === "vertical" ? (
        /* Défilement vertical (scroll interne) */
        <div
          ref={scrollRef}
          onPointerDown={onGestureStart}
          onPointerMove={onGestureMove}
          onPointerUp={onGestureEnd}
          onPointerCancel={onGestureCancel}
          style={{ touchAction: zoom.scale > 1 ? "none" : "auto" }}
          className="h-full overflow-y-auto overflow-x-hidden"
        >
          <div key={chapter} className="mx-auto flex max-w-3xl animate-fade-in-fast flex-col gap-2 pb-24 pt-[calc(env(safe-area-inset-top)+3.5rem)] md:pb-28 md:pt-16 sm:px-3">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => {
              const idx = p - 1;
              const shouldMount = Math.abs(idx - currentPage) <= 3;
              const knownRatio = pageRatiosRef.current.get(idx);
              const zoomed = idx === currentPage && zoom.scale !== 1;
              return (
                <div
                  key={p}
                  id={`scan-page-${idx}`}
                  data-page={idx}
                  className="w-full bg-black/20"
                  style={
                    zoomed
                      ? {
                          position: "relative",
                          zIndex: 10,
                          transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                        }
                      : !shouldMount
                        ? { aspectRatio: knownRatio || "2 / 3" }
                        : undefined
                  }
                >
                  {shouldMount ? (
                    <img
                      src={pageSrc(p)}
                      alt={`Page ${p}`}
                      loading={idx === currentPage ? "eager" : "lazy"}
                      fetchpriority={idx === currentPage ? "high" : "low"}
                      decoding="async"
                      draggable={false}
                      onLoad={(event) => {
                        const image = event.currentTarget;
                        if (image.naturalWidth && image.naturalHeight) {
                          pageRatiosRef.current.set(idx, `${image.naturalWidth} / ${image.naturalHeight}`);
                        }
                      }}
                      className="block w-full"
                    />
                  ) : null}
                </div>
              );
            })}

            <div className="flex items-center justify-between gap-3 px-4 pt-6" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => goChapter(prevChapter?.chapter, "start")}
                disabled={!prevChapter}
                className="flex items-center gap-1.5 rounded-md bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={16} /> Précédent
              </button>
              <button
                onClick={() => goChapter(nextChapter?.chapter, "start")}
                disabled={!nextChapter}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-fg transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Chapitre suivant <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Pages horizontales : pellicule glissable, page voisine visible */
        <div
          key={chapter}
          className="h-full w-full touch-none overflow-hidden"
          onPointerDown={onGestureStart}
          onPointerMove={onGestureMove}
          onPointerUp={onGestureEnd}
          onPointerCancel={onGestureCancel}
        >
          <div
            className="flex h-full"
            style={{
              transform: `translate3d(${-currentPage * vw + dragX}px, 0, 0)`,
              transition: dragRef.current ? "none" : "transform 0.28s ease",
            }}
          >
            {Array.from({ length: pages }, (_, i) => (
              <div
                key={i}
                className="flex h-full shrink-0 items-center justify-center"
                style={{ width: vw }}
              >
                {/* Seules les pages proches sont montées. */}
                {Math.abs(i - currentPage) <= 2 ? (
                  <img
                    src={pageSrc(i + 1)}
                    alt={`Page ${i + 1}`}
                    decoding="async"
                    draggable={false}
                    className="max-h-full max-w-full object-contain"
                    style={
                      i === currentPage && zoom.scale !== 1
                        ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }
                        : undefined
                    }
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* À droite en vertical, en bas en horizontal. */}
      {pages > 0 &&
        (mode === "vertical" ? (
          <div className={`pointer-events-none absolute inset-0 z-30 transition-opacity duration-200 ${fade}`}>
            <div className="pointer-events-auto absolute left-[min(calc(50%+24.5rem),calc(100%-2.5rem))] top-1/2 hidden -translate-y-1/2 flex-col items-center gap-1.5 [text-shadow:0_1px_3px_rgba(0,0,0,.9)] md:flex">
              <button onClick={prevPage} title="Page précédente" className="text-white/60 transition-colors hover:text-white">
                <ChevronUp size={22} />
              </button>
              <div className="text-center text-xs font-semibold leading-tight tabular-nums text-white/90">
                {currentPage + 1}
                <span className="block text-white/40">{pages}</span>
              </div>
              <button onClick={nextPage} title="Page suivante" className="text-white/60 transition-colors hover:text-white">
                <ChevronDown size={22} />
              </button>
            </div>
            <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold tabular-nums text-white/85 backdrop-blur-md md:hidden">
              {currentPage + 1} / {pages}
            </div>
          </div>
        ) : (
          <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 transition-opacity duration-200 ${fade}`}>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4 text-white [text-shadow:0_1px_3px_rgba(0,0,0,.9)]">
              <button onClick={prevPage} title="Page précédente" className="text-white/70 transition-colors hover:text-white">
                <ChevronLeft size={24} />
              </button>
              <span className="text-sm font-semibold tabular-nums text-white/90">
                {currentPage + 1} / {pages}
              </span>
              <button onClick={nextPage} title="Page suivante" className="text-white/70 transition-colors hover:text-white">
                <ChevronRight size={24} />
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
