import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, ChevronLeft, ChevronRight, Maximize2, Flag, BookOpen, ChevronDown, Download } from "lucide-react";
import { getScanChapters, scanPageUrl } from "@/api/animeApi";
import { getAnimeScansProgress, saveScanProgress } from "@/api/scanProgress";
import { useCachedResource } from "@/hooks/useCachedResource";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { downloadsAvailable, scanDownloadId } from "@/api/downloads";
import { Select } from "@/components/ui/Select";
import { ChapterPicker } from "@/components/ui/ChapterPicker";
import { MobileSelectSheet } from "@/components/ui/MobileSelectSheet";
import { MobileChapterSheet } from "@/components/ui/MobileChapterSheet";
import { ChapterDownloadSheet } from "@/components/ui/ChapterDownloadSheet";
import { platform } from "@/platform";
import { toast } from "@/lib/toast";
import { GUEST_FEATURE_MSG } from "@/lib/guest";

const CONTROL_H = "h-10";

/** Barre de contrôle collante et sélecteur de chapitre virtualisé. Par défaut, le chapitre repris. */
export function ScansSection({ slug, scans = [], animeTitle, animeCover, onReport }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id || null;
  const isGuest = !!session?.user?.is_anonymous;
  const [mobileSheet, setMobileSheet] = useState(null);

  // Mêmes conditions que les épisodes.
  const canDownload = downloadsAvailable() && !isGuest;
  const downloadsById = useDownloadsStore((s) => s.byId);
  const startDownloadAction = useDownloadsStore((s) => s.start);
  const [downloadSheetOpen, setDownloadSheetOpen] = useState(false);

  // ?oeuvre= si valide, sinon la première.
  const [oeuvre, setOeuvre] = useState(() => {
    const fromUrl = searchParams.get("oeuvre");
    return (fromUrl && scans.some((s) => s.oeuvre === fromUrl) ? fromUrl : null) || scans[0]?.oeuvre || "";
  });
  const active = scans.find((s) => s.oeuvre === oeuvre) || scans[0] || null;

  // `push` empile une entrée (navigation de chapitre), sinon replace.
  const writeUrl = (oeuvreVal, chap, push) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "scans");
    if (oeuvreVal) next.set("oeuvre", oeuvreVal);
    if (chap != null) next.set("chapter", String(chap));
    else next.delete("chapter");
    setSearchParams(next, { replace: !push });
  };

  const { data, loading } = useCachedResource(
    active ? `scan-chapters:${active.oeuvre}` : null,
    () => getScanChapters(active.oeuvre),
    15 * 60 * 1000
  );
  const chapters = data?.chapters || [];
  const imageBase = data?.imageBase || "";

  const pagesRef = useRef(null);

  const [progress, setProgress] = useState({});
  useEffect(() => {
    if (!userId || !slug) return setProgress({});
    getAnimeScansProgress(slug, userId).then(setProgress).catch(() => {});
  }, [userId, slug]);

  // ?chapter=, sinon résolu une fois la liste chargée.
  const [chapter, setChapter] = useState(() => Number(searchParams.get("chapter")) || null);

  // Reprise, sinon le premier.
  useEffect(() => {
    if (!chapters.length) return;
    if (chapter != null && chapters.some((c) => c.chapter === chapter)) return;
    const saved = active ? progress[active.oeuvre] : null;
    const resume = saved && chapters.some((c) => c.chapter === saved.chapter) ? saved.chapter : null;
    const resolved = resume ?? chapters[0].chapter;
    setChapter(resolved);
    writeUrl(active.oeuvre, resolved, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter, chapters, active, progress]);

  // Un retour arrière change les params sans remonter le composant.
  useEffect(() => {
    const urlOeuvre = searchParams.get("oeuvre");
    if (urlOeuvre && urlOeuvre !== oeuvre && scans.some((s) => s.oeuvre === urlOeuvre)) {
      setOeuvre(urlOeuvre);
    }
    const urlChap = Number(searchParams.get("chapter")) || null;
    if (urlChap && urlChap !== chapter) setChapter(urlChap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectOeuvre = (o) => {
    setOeuvre(o);
    setChapter(null);
    const next = new URLSearchParams(searchParams);
    next.set("tab", "scans");
    next.set("oeuvre", o);
    next.delete("chapter");
    setSearchParams(next, { replace: true });
  };

  const currentIdx = chapters.findIndex((c) => c.chapter === chapter);
  const current = currentIdx >= 0 ? chapters[currentIdx] : null;
  const pages = current?.pages || 0;
  // `chapter` = numéro affiché ; `folder` = dossier réel (URL des images).
  const folder = current?.folder ?? chapter;
  const prevChapter = currentIdx > 0 ? chapters[currentIdx - 1] : null;
  const nextChapter =
    currentIdx >= 0 && currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : null;

  // Le scroll est dans <main>, pas window.
  const selectChapter = (chap) => {
    if (chap == null) return;
    setChapter(chap);
    writeUrl(active?.oeuvre, chap, true);
    const c = chapters.find((x) => x.chapter === chap);
    if (userId && active) {
      saveScanProgress({
        slug,
        oeuvre: active.oeuvre,
        chapter: chap,
        page: 0,
        totalPages: c?.pages || 0,
        completed: false,
        oeuvreLabel: active.label,
        title: animeTitle,
        cover: animeCover,
        userId,
      });
    }
    requestAnimationFrame(() =>
      pagesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const openFullscreen = () => {
    if (!active || chapter == null) return;
    // replace : la fiche est déjà l'entrée courante, et le lecteur la remplacera à la sortie.
    navigate(`/scan/${slug}?oeuvre=${encodeURIComponent(active.oeuvre)}&chapter=${chapter}`, {
      replace: true,
    });
  };

  const chapterDownloadStatus = (chap) =>
    active ? downloadsById[scanDownloadId(slug, active.oeuvre, chap)]?.status : undefined;

  const openDownloadSheet = () => {
    if (isGuest) return void toast.info(GUEST_FEATURE_MSG);
    if (!active || !chapters.length) return;
    setDownloadSheetOpen(true);
  };

  const downloadChapters = async (targets) => {
    if (!active || !targets.length) return;
    // `alreadyExists` : déjà acquis ou en cours, à ne pas compter comme ajouté.
    let queued = 0;
    let alreadyDone = 0;
    let failed = 0;
    for (const c of targets) {
      const res = await startDownloadAction({
        id: scanDownloadId(slug, active.oeuvre, c.chapter),
        type: "scan",
        slug,
        oeuvre: active.oeuvre,
        oeuvreLabel: active.label,
        chapter: c.chapter,
        folder: c.folder ?? c.chapter,
        pages: c.pages,
        imageBase,
        animeTitle,
        animeCover,
      });
      if (!res?.success) failed++;
      else if (res.alreadyExists) alreadyDone++;
      else queued++;
    }
    const parts = [];
    if (queued > 0) parts.push(`${queued} chapitre${queued > 1 ? "s" : ""} ajouté${queued > 1 ? "s" : ""} au téléchargement`);
    if (alreadyDone > 0) parts.push(`${alreadyDone} déjà téléchargé${alreadyDone > 1 ? "s" : ""}`);
    if (failed > 0) parts.push(`${failed} indisponible${failed > 1 ? "s" : ""}`);
    if (parts.length) {
      (queued > 0 ? toast.success : toast.info)(parts.join(" · "));
    } else {
      toast.error("Aucun chapitre n'a pu être téléchargé");
    }
  };

  if (!scans.length) {
    return <p className="px-8 py-10 text-center text-muted">Aucun scan disponible pour cet anime.</p>;
  }

  return (
    <section className="px-4 pb-6 pt-0 md:px-8 md:pb-8">
      {/* Mobile : ouverture dans le lecteur dédié. */}
      <div className="-mx-4 mb-4 md:hidden">
        {scans.length > 1 && (
          <button
            type="button"
            onClick={() => setMobileSheet("oeuvre")}
            className="flex w-full items-center gap-2 border-b border-border/70 px-4 py-3.5 text-left active:bg-white/[0.03]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted">Édition</p>
              <p className="truncate font-display text-base font-semibold text-text">{active?.label || oeuvre}</p>
            </div>
            <ChevronDown size={18} className="shrink-0 text-muted" />
          </button>
        )}

        <div className="flex items-center border-b border-border/70 px-2 py-2.5">
          <button
            onClick={() => selectChapter(prevChapter?.chapter)}
            disabled={!prevChapter}
            aria-label="Chapitre précédent"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-white/[0.06] disabled:opacity-25"
          >
            <ChevronLeft size={21} />
          </button>
          <button
            type="button"
            onClick={() => setMobileSheet("chapter")}
            disabled={!chapters.length}
            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg py-2 text-center active:bg-white/[0.04] disabled:opacity-40"
          >
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-text">
                {chapter != null ? `Chapitre ${chapter}` : "Choisir un chapitre"}
              </p>
              <p className="text-xs text-muted">
                {pages > 0 ? `${pages} page${pages > 1 ? "s" : ""}` : `${chapters.length} chapitres`}
              </p>
            </div>
            <ChevronDown size={16} className="shrink-0 text-muted" />
          </button>
          <button
            onClick={() => selectChapter(nextChapter?.chapter)}
            disabled={!nextChapter}
            aria-label="Chapitre suivant"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-white/[0.06] disabled:opacity-25"
          >
            <ChevronRight size={21} />
          </button>
        </div>

        <div className="flex gap-2 px-4 py-4">
          <button
            onClick={openFullscreen}
            disabled={chapter == null}
            className="btn-shu min-w-0 flex-1 active:scale-[0.98] disabled:opacity-40"
          >
            <BookOpen size={18} />
            Ouvrir le lecteur
          </button>
          {canDownload && (
            <button
              onClick={openDownloadSheet}
              aria-label="Télécharger des chapitres"
              className="flex w-11 shrink-0 items-center justify-center rounded-md bg-surface text-muted ring-1 ring-border active:text-primary"
            >
              <Download size={18} />
            </button>
          )}
          {onReport && (
            <button
              onClick={() => onReport({ kind: "scan", oeuvre: active?.oeuvre || null, chapter })}
              aria-label="Signaler un problème"
              className="flex w-11 shrink-0 items-center justify-center rounded-md bg-surface text-muted ring-1 ring-border active:text-primary"
            >
              <Flag size={18} />
            </button>
          )}
        </div>
      </div>

      <MobileSelectSheet
        open={mobileSheet === "oeuvre"}
        title="Édition"
        value={oeuvre}
        onChange={selectOeuvre}
        onClose={() => setMobileSheet(null)}
        options={scans.map((scan) => ({ value: scan.oeuvre, label: scan.label }))}
      />
      <MobileChapterSheet
        open={mobileSheet === "chapter"}
        chapters={chapters}
        value={chapter}
        onChange={selectChapter}
        onClose={() => setMobileSheet(null)}
      />
      <ChapterDownloadSheet
        open={downloadSheetOpen}
        chapters={chapters}
        statusOf={chapterDownloadStatus}
        onClose={() => setDownloadSheetOpen(false)}
        onConfirm={downloadChapters}
      />

      <div className="sticky top-16 z-20 -mx-8 mb-6 hidden flex-wrap items-center gap-2.5 border-b border-border bg-bg/85 px-8 py-3 backdrop-blur-md md:flex">
        {scans.length > 1 && (
          <Select
            title="Édition"
            value={oeuvre}
            onValueChange={selectOeuvre}
            className="min-w-[11rem]"
            options={scans.map((s) => ({ value: s.oeuvre, label: s.label }))}
          />
        )}

        <button
          onClick={() => selectChapter(prevChapter?.chapter)}
          disabled={!prevChapter}
          title="Chapitre précédent"
          className={`flex ${CONTROL_H} w-10 items-center justify-center rounded-md bg-surface text-muted ring-1 ring-border transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronLeft size={16} />
        </button>

        <ChapterPicker value={chapter} chapters={chapters} onChange={selectChapter} className="w-44" />

        <button
          onClick={() => selectChapter(nextChapter?.chapter)}
          disabled={!nextChapter}
          title="Chapitre suivant"
          className={`flex ${CONTROL_H} w-10 items-center justify-center rounded-md bg-surface text-muted ring-1 ring-border transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronRight size={16} />
        </button>

        <span className="text-sm text-muted">
          {pages > 0 && `${pages} page${pages > 1 ? "s" : ""}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {canDownload && (
            <button
              onClick={openDownloadSheet}
              disabled={!chapters.length}
              title="Télécharger des chapitres (tous, ou une sélection)"
              className={`flex ${CONTROL_H} items-center gap-2 rounded-md bg-surface px-3 text-sm font-medium text-text ring-1 ring-border transition-colors hover:bg-surface-2 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Download size={15} />
              <span className="hidden lg:inline">Télécharger</span>
            </button>
          )}

          {onReport && (
            <button
              onClick={() => onReport({ kind: "scan", oeuvre: active?.oeuvre || null, chapter })}
              title="Signaler un problème sur ce chapitre (décalage, page manquante…)"
              className={`flex ${CONTROL_H} w-10 items-center justify-center rounded-md bg-surface text-muted ring-1 ring-border transition-colors hover:text-primary`}
            >
              <Flag size={16} />
            </button>
          )}

          <button
            onClick={openFullscreen}
            disabled={chapter == null}
            title="Lire en plein écran"
            className={`flex ${CONTROL_H} items-center gap-2 rounded-md bg-surface px-3.5 text-sm font-medium text-text ring-1 ring-border transition-colors hover:bg-surface-2 hover:text-primary disabled:opacity-40`}
          >
            <Maximize2 size={16} />
            <span className="hidden sm:inline">Plein écran</span>
          </button>
        </div>
      </div>

      {/* Sur Android, un aperçu remplace le chargement de toutes les pages. */}
      {platform.isMobile ? (
        loading && !chapters.length ? (
          <div className="flex items-center justify-center gap-2 py-14 text-muted">
            <Loader2 className="animate-spin" size={18} />
            Chargement des chapitres…
          </div>
        ) : !pages ? (
          <p className="py-14 text-center text-muted">Aucune page disponible.</p>
        ) : (
          <button
            type="button"
            onClick={openFullscreen}
            className="group relative mx-auto block h-72 w-full max-w-sm overflow-hidden rounded-xl bg-surface ring-1 ring-border active:scale-[0.99]"
          >
            <img
              src={scanPageUrl(imageBase, active.oeuvre, folder, 1)}
              alt={`Aperçu du chapitre ${chapter}`}
              loading="eager"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover object-top opacity-75"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-4 text-left">
              <div>
                <p className="font-display text-lg font-bold text-white">Chapitre {chapter}</p>
                <p className="text-xs text-white/60">Touchez pour continuer la lecture</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg">
                <BookOpen size={19} />
              </span>
            </div>
          </button>
        )
      ) : loading && !chapters.length ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted">
          <Loader2 className="animate-spin" size={18} />
          Chargement des chapitres…
        </div>
      ) : !pages ? (
        <p className="py-16 text-center text-muted">Aucune page disponible.</p>
      ) : (
        <div
          ref={pagesRef}
          key={`${active.oeuvre}:${chapter}`}
          className="mx-auto flex max-w-3xl animate-fade-in flex-col gap-2 scroll-mt-32"
        >
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <img
              key={p}
              src={scanPageUrl(imageBase, active.oeuvre, folder, p)}
              alt={`Page ${p}`}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="cv-auto block w-full"
            />
          ))}

          <div className="flex items-center justify-between gap-3 pt-4">
            <button
              onClick={() => selectChapter(prevChapter?.chapter)}
              disabled={!prevChapter}
              className="flex items-center gap-1.5 rounded-md bg-surface px-4 py-2.5 text-sm font-semibold text-text ring-1 ring-border transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Précédent
            </button>
            <button
              onClick={() => selectChapter(nextChapter?.chapter)}
              disabled={!nextChapter}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-fg transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Chapitre suivant <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
