import { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Compass,
  Film,
  Wifi,
  WifiOff,
  Download,
  Trash2,
  Play,
  Loader2,
  X,
  HardDrive,
  ImageOff,
  ChevronDown,
  AlertTriangle,
  RotateCcw,
  CheckSquare,
  Square,
  ListChecks,
  Eraser,
  BookOpen,
} from "lucide-react";
import PageLoader from "@/components/ui/PageLoader";
import { downloadsAvailable } from "@/api/downloads";
import { useNetworkStore } from "@/stores/useNetworkStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { toast } from "@/lib/toast";

const FAILED_STATUSES = new Set(["error", "interrupted"]);
const ACTIVE_STATUSES = new Set(["downloading", "queued", "resolving"]);
const CONFIRM_TIMEOUT_MS = 4000;

const COLLAPSE_KEY = "nartya_downloads_collapsed";

function formatSize(bytes) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(0)} Mo`;
  return `${(mb / 1024).toFixed(1)} Go`;
}

/** « · ≈ 480 Mo · encore 3 min », d'après l'estimation envoyée en cours de téléchargement. */
function downloadEstimate(it) {
  let out = "";
  if (it.estimatedBytes) out += ` · ≈ ${formatSize(it.estimatedBytes)}`;
  if (it.etaSeconds != null) {
    const min = Math.ceil(it.etaSeconds / 60);
    out += it.etaSeconds < 60 ? " · moins d'une minute" : ` · encore ${min} min`;
  }
  return out;
}

/** Vignette réelle, sinon affiche de l'anime, sinon placeholder. */
function EpisodeThumb({ item, fallbackCover }) {
  const candidates = [item.epThumb, fallbackCover].filter(Boolean);
  const [failedCount, setFailedCount] = useState(0);
  useEffect(() => setFailedCount(0), [item.epThumb, fallbackCover]);
  const src = candidates[failedCount] || null;
  return (
    <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:w-36">
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailedCount((n) => n + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          <ImageOff size={18} />
        </div>
      )}
      <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[0.65rem] font-bold backdrop-blur-sm">
        {item.ep}
      </span>
    </div>
  );
}

function EpisodeRow({ it, cover, selecting, selected, onToggleSelect, onPlay, onRetry, onCancel, onRemove }) {
  const inProgress = ACTIVE_STATUSES.has(it.status);
  const failed = FAILED_STATUSES.has(it.status);
  const pct = Math.round(it.percent || 0);
  return (
    <div className="group flex items-center gap-3 px-4 py-2 transition-colors hover:bg-white/[0.04]">
      {selecting && (
        <button
          onClick={() => !inProgress && onToggleSelect(it.id)}
          disabled={inProgress}
          title={inProgress ? "En cours — annule le téléchargement pour le retirer" : "Sélectionner"}
          className="shrink-0 disabled:opacity-30"
        >
          {selected ? <CheckSquare size={19} className="text-primary" /> : <Square size={19} className="text-muted" />}
        </button>
      )}
      <button
        onClick={() => (selecting ? !inProgress && onToggleSelect(it.id) : !inProgress && !failed && onPlay(it))}
        disabled={inProgress || (!selecting && failed)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        <div className="relative">
          <EpisodeThumb item={it} fallbackCover={cover} />
          {!inProgress && !failed && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-150 will-change-[opacity] group-hover:opacity-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-fg">
                <Play size={13} className="ml-0.5 fill-current" />
              </span>
            </div>
          )}
          {inProgress && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
              <span className="block h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-medium">
            {it.epTitle || `Épisode ${it.ep}`}
            <span className="ml-2 text-xs uppercase text-muted">{it.lang}</span>
          </p>
          {inProgress ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <Loader2 size={11} className="animate-spin" />
              {it.status === "resolving"
                ? "Recherche d'une nouvelle source…"
                : it.processing
                  ? "Finalisation…"
                  : `Téléchargement… ${pct}%${downloadEstimate(it)}`}
            </p>
          ) : failed ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-primary">
              <AlertTriangle size={11} />
              {it.error || "Échec du téléchargement"}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted">{formatSize(it.sizeBytes)}</p>
          )}
        </div>
      </button>

      {failed && (
        <button
          onClick={() => onRetry(it)}
          title="Reprendre"
          className="shrink-0 rounded p-2 text-muted transition-colors hover:bg-white/[0.06] hover:text-primary"
        >
          <RotateCcw size={16} />
        </button>
      )}
      <button
        onClick={() => (inProgress ? onCancel(it.id) : onRemove(it.id))}
        title={inProgress ? "Annuler" : "Supprimer"}
        className="shrink-0 rounded p-2 text-muted transition-colors hover:bg-white/[0.06] hover:text-primary"
      >
        {inProgress ? <X size={16} /> : <Trash2 size={16} />}
      </button>
    </div>
  );
}

function ScanRow({ it, selecting, selected, onToggleSelect, onPlay, onRetry, onCancel, onRemove }) {
  const inProgress = ACTIVE_STATUSES.has(it.status);
  const failed = FAILED_STATUSES.has(it.status);
  const pct = Math.round(it.percent || 0);
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.04]">
      {selecting && (
        <button
          onClick={() => !inProgress && onToggleSelect(it.id)}
          disabled={inProgress}
          title={inProgress ? "En cours — annule le téléchargement pour le retirer" : "Sélectionner"}
          className="shrink-0 disabled:opacity-30"
        >
          {selected ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} className="text-muted" />}
        </button>
      )}
      <button
        onClick={() => (selecting ? !inProgress && onToggleSelect(it.id) : !inProgress && !failed && onPlay(it))}
        disabled={inProgress || (!selecting && failed)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
            failed ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted"
          }`}
        >
          {inProgress ? (
            <Loader2 size={16} className="animate-spin" />
          ) : failed ? (
            <AlertTriangle size={16} />
          ) : (
            <BookOpen size={16} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">Chapitre {it.chapter}</span>
          {inProgress ? (
            <span className="mt-0.5 block text-xs text-muted">
              {it.status === "resolving" ? "Recherche…" : it.processing ? "Finalisation…" : `${pct}%`}
            </span>
          ) : failed ? (
            <span className="mt-0.5 block truncate text-xs text-primary">{it.error || "Échec du téléchargement"}</span>
          ) : (
            <span className="mt-0.5 block text-xs text-muted">{formatSize(it.sizeBytes)}</span>
          )}
        </span>
      </button>

      {failed && (
        <button
          onClick={() => onRetry(it)}
          title="Reprendre"
          className="shrink-0 rounded p-2 text-muted transition-colors hover:bg-white/[0.06] hover:text-primary"
        >
          <RotateCcw size={16} />
        </button>
      )}
      <button
        onClick={() => (inProgress ? onCancel(it.id) : onRemove(it.id))}
        title={inProgress ? "Annuler" : "Supprimer"}
        className="shrink-0 rounded p-2 text-muted transition-colors hover:bg-white/[0.06] hover:text-primary"
      >
        {inProgress ? <X size={16} /> : <Trash2 size={16} />}
      </button>
    </div>
  );
}

/** Sert aussi d'écran d'accueil quand l'app démarre sans connexion. */
function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-2">
      <span className="flex items-center gap-1.5 text-lg font-bold tabular-nums text-text">
        <Icon size={15} className="text-primary" />
        {value}
      </span>
      <span className="text-[0.7rem] uppercase tracking-[0.14em] text-muted">{label}</span>
    </div>
  );
}

export default function DownloadsPage() {
  const navigate = useNavigate();
  const online = useNetworkStore((s) => s.online);
  const items = useDownloadsStore((s) => s.items);
  const loaded = useDownloadsStore((s) => s.loaded);
  const cancel = useDownloadsStore((s) => s.cancel);
  const remove = useDownloadsStore((s) => s.remove);
  const removeMany = useDownloadsStore((s) => s.removeMany);
  const retry = useDownloadsStore((s) => s.retry);
  const loading = !loaded;

  // Persisté en localStorage.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {};
    } catch {
      return {};
    }
  });
  const toggleCollapse = (slug) =>
    setCollapsed((c) => {
      const next = { ...c, [slug]: !c[slug] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch (_) {}
      return next;
    });

  // Un anime avec épisodes et chapitres bascule entre deux onglets.
  const [activeTab, setActiveTab] = useState({});
  const tabOf = (g) => activeTab[g.slug] || (g.videos.length ? "video" : "scan");
  const setTab = (slug, tab) => setActiveTab((t) => ({ ...t, [slug]: tab }));

  // Un groupe à la fois.
  const [selectGroup, setSelectGroup] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleSelectGroup = (slug) => {
    setSelectGroup((current) => (current === slug ? null : slug));
    setSelectedIds(new Set());
  };
  const toggleSelectItem = (id) =>
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Deux clics ; le bouton se désarme après un délai.
  const [confirmGroup, setConfirmGroup] = useState(null);
  const confirmTimerRef = useRef(null);
  const armConfirm = (slug) => {
    setConfirmGroup(slug);
    clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => setConfirmGroup(null), CONFIRM_TIMEOUT_MS);
  };

  /** cancel pour les actifs, remove pour le reste. */
  const removeAll = async (targetItems, label) => {
    const active = targetItems.filter((it) => ACTIVE_STATUSES.has(it.status)).map((it) => it.id);
    const rest = targetItems.filter((it) => !ACTIVE_STATUSES.has(it.status)).map((it) => it.id);
    await Promise.all(active.map((id) => cancel(id)));
    if (rest.length) await removeMany(rest);
    const count = active.length + rest.length;
    if (count) toast.success(`${count} ${label}${count > 1 ? "s" : ""} supprimé${count > 1 ? "s" : ""}`);
  };

  const deleteGroup = (g) => {
    clearTimeout(confirmTimerRef.current);
    setConfirmGroup(null);
    removeAll(g.episodes, g.allScan ? "chapitre" : "téléchargement");
  };

  const purgeFailedInGroup = (g) => {
    const failed = g.episodes.filter((it) => FAILED_STATUSES.has(it.status));
    removeAll(failed, "échec");
  };

  const purgeAllFailed = () => {
    const failed = items.filter((it) => FAILED_STATUSES.has(it.status));
    removeAll(failed, "échec");
  };

  const deleteSelected = () => {
    const targets = items.filter((it) => selectedIds.has(it.id));
    removeAll(targets, "téléchargement");
    setSelectGroup(null);
    setSelectedIds(new Set());
  };

  const groups = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      // Un enregistrement corrompu (sans slug) ne doit pas faire planter le tri.
      if (!it || !it.slug) continue;
      if (!map.has(it.slug)) {
        map.set(it.slug, {
          slug: it.slug,
          title: it.animeTitle || it.slug,
          cover: it.coverLocal || it.animeCover || null,
          episodes: [],
          size: 0,
          done: 0,
          downloading: 0,
          allScan: true,
        });
      }
      const g = map.get(it.slug);
      g.episodes.push(it);
      g.size += it.sizeBytes || 0;
      if (it.type !== "scan") g.allScan = false;
      // « Téléchargé » = terminé.
      if (["downloading", "queued", "resolving"].includes(it.status)) g.downloading += 1;
      else if (it.status !== "error" && it.status !== "interrupted") g.done += 1;
    }
    for (const g of map.values()) {
      g.episodes.sort((a, b) => {
        if (a.type === "scan" || b.type === "scan") {
          if ((a.type === "scan") !== (b.type === "scan")) return a.type === "scan" ? 1 : -1;
          return Number(a.chapter) - Number(b.chapter);
        }
        return (
          String(a.seasonId).localeCompare(String(b.seasonId)) ||
          Number(a.ep) - Number(b.ep)
        );
      });
      g.videos = g.episodes.filter((it) => it.type !== "scan");
      g.scans = g.episodes.filter((it) => it.type === "scan");
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.title || "").localeCompare(b.title || "")
    );
  }, [items]);

  const totalSize = useMemo(
    () => items.reduce((sum, it) => sum + (it.sizeBytes || 0), 0),
    [items]
  );
  const videoCount = items.filter((it) => it.type !== "scan" && it.status === "completed").length;
  const scanCount = items.filter((it) => it.type === "scan" && it.status === "completed").length;
  const failedCount = useMemo(
    () => items.filter((it) => FAILED_STATUSES.has(it.status)).length,
    [items]
  );

  const playOffline = (it) => {
    if (it.type === "scan") {
      const params = new URLSearchParams({ oeuvre: it.oeuvre, chapter: String(it.chapter), local: "1" });
      navigate(`/scan/${it.slug}?${params.toString()}`);
      return;
    }
    const params = new URLSearchParams({
      season: it.seasonId,
      ep: String(it.ep),
      lang: it.lang,
      local: "1",
    });
    navigate(`/watch/${it.slug}?${params.toString()}`);
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="animate-fade-in px-4 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:px-8 sm:py-8">
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-px w-6 bg-primary" />
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Hors ligne</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="t-impact text-4xl md:text-5xl">Téléchargements</h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted">
              Tes épisodes et chapitres gardés sur cet appareil, lisibles sans connexion.
            </p>
          </div>
          {failedCount > 0 && (
            <button
              onClick={purgeAllFailed}
              title="Retirer toutes les entrées en échec, quel que soit l'anime"
              className="flex h-10 items-center gap-1.5 rounded-md bg-surface px-3 text-sm font-semibold text-primary ring-2 ring-border transition-colors hover:bg-primary/10"
            >
              <Eraser size={15} />
              Purger les échecs
              <span className="tabular-nums opacity-70">({failedCount})</span>
            </button>
          )}
        </div>

        {downloadsAvailable() && (
          <div className="mt-5 grid grid-cols-3 divide-x divide-border/70 rounded-md bg-surface/80 py-3 ring-2 ring-border">
            <Stat icon={HardDrive} value={totalSize ? formatSize(totalSize) : "0 Mo"} label="utilisés" />
            <Stat icon={Film} value={videoCount} label={videoCount > 1 ? "épisodes" : "épisode"} />
            <Stat icon={BookOpen} value={scanCount} label={scanCount > 1 ? "chapitres" : "chapitre"} />
          </div>
        )}
        <p
          className={`mt-3 flex items-center gap-2 text-xs font-semibold ${online ? "text-muted" : "text-primary"}`}
        >
          {online ? <Wifi size={13} /> : <WifiOff size={13} />}
          {online ? "Connecté : les téléchargements en cours avancent." : "Hors connexion : seuls les contenus téléchargés sont lisibles."}
        </p>
      </header>

      {!downloadsAvailable() ? (
        <p className="rounded-md border-2 border-border bg-surface p-6 text-center text-sm text-muted">
          Le téléchargement n'est disponible que dans l'application de bureau.
        </p>
      ) : items.length === 0 ? (
        <div className="relative flex flex-col items-center overflow-hidden rounded-md bg-surface/60 px-6 py-14 text-center ring-2 ring-border">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-md bg-primary/10 text-primary ring-2 ring-primary/30">
            <Download size={28} />
          </span>
          <p className="t-impact relative mt-5 text-2xl">Rien pour l'instant</p>
          <p className="relative mt-2 max-w-sm text-sm text-muted">
            {online
              ? "Sur la fiche d'un anime, touche l'icône de téléchargement d'un épisode ou d'un chapitre : il apparaîtra ici, prêt pour le train ou l'avion."
              : "Reconnecte-toi pour télécharger des épisodes, puis retrouve-les ici hors ligne."}
          </p>
          {online && (
            <button
              onClick={() => navigate("/recherche")}
              className="relative mt-6 flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-primary-fg transition-[filter,transform] hover:brightness-110 active:scale-95"
            >
              <Compass size={17} /> Parcourir le catalogue
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isCollapsed = !!collapsed[g.slug];
            const failedInGroup = g.episodes.filter((it) => FAILED_STATUSES.has(it.status));
            const selecting = selectGroup === g.slug;
            const confirming = confirmGroup === g.slug;
            const label = g.allScan ? "chapitre" : "épisode";
            const hasBothKinds = g.videos.length > 0 && g.scans.length > 0;
            const tab = tabOf(g);
            const visible = tab === "video" ? g.videos : g.scans;
            return (
              <div key={g.slug} className="overflow-hidden rounded-md bg-surface/60 ring-2 ring-border">
                <div className="flex items-center gap-1 px-2 py-1.5 transition-colors hover:bg-white/[0.03]">
                  <button
                    onClick={() => toggleCollapse(g.slug)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1 text-left"
                  >
                    <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-surface-2 ring-2 ring-border">
                      {g.cover ? (
                        <img src={g.cover} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted">
                          <ImageOff size={15} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-1 text-[0.95rem] font-bold text-text">{g.title}</h2>
                      <p className="mt-0.5 text-xs text-muted">
                        {g.done} {label}
                        {g.done > 1 ? "s" : ""}
                        {g.downloading > 0 && (
                          <span className="text-primary"> · {g.downloading} en cours</span>
                        )}
                        {failedInGroup.length > 0 && (
                          <span className="text-primary"> · {failedInGroup.length} en échec</span>
                        )}
                        {" · "}
                        {formatSize(g.size)}
                      </p>
                    </div>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-muted transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                    />
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
                    {failedInGroup.length > 0 && (
                      <button
                        onClick={() => purgeFailedInGroup(g)}
                        title={`Retirer les ${failedInGroup.length} entrée(s) en échec`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-primary"
                      >
                        <Eraser size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        toggleSelectGroup(g.slug);
                        if (isCollapsed) toggleCollapse(g.slug);
                      }}
                      title={selecting ? "Annuler la sélection" : "Sélectionner des éléments à supprimer"}
                      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-white/[0.06] ${
                        selecting ? "text-primary" : "text-muted"
                      }`}
                    >
                      <ListChecks size={16} />
                    </button>
                    <button
                      onClick={() => (confirming ? deleteGroup(g) : armConfirm(g.slug))}
                      title={confirming ? "Cliquer à nouveau pour confirmer" : `Supprimer tous les ${label}s de cet anime`}
                      className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
                        confirming
                          ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/40"
                          : "text-muted hover:bg-white/[0.06] hover:text-primary"
                      }`}
                    >
                      <Trash2 size={16} />
                      {confirming && "Confirmer ?"}
                    </button>
                  </div>
                </div>

                {hasBothKinds && (
                  <div className="flex gap-1.5 px-4 pb-2">
                    <button
                      onClick={() => setTab(g.slug, "video")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        tab === "video" ? "bg-primary text-primary-fg" : "text-muted hover:bg-white/[0.06]"
                      }`}
                    >
                      Épisodes · {g.videos.length}
                    </button>
                    <button
                      onClick={() => setTab(g.slug, "scan")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        tab === "scan" ? "bg-primary text-primary-fg" : "text-muted hover:bg-white/[0.06]"
                      }`}
                    >
                      Chapitres · {g.scans.length}
                    </button>
                  </div>
                )}

                {selecting && (
                  <div className="flex items-center gap-3 border-y border-border/60 bg-white/[0.02] px-4 py-2 text-sm">
                    <button
                      onClick={() => {
                        const selectableIds = visible
                          .filter((it) => !ACTIVE_STATUSES.has(it.status))
                          .map((it) => it.id);
                        const allSelected = selectableIds.every((id) => selectedIds.has(id));
                        setSelectedIds(new Set(allSelected ? [] : selectableIds));
                      }}
                      className="text-muted transition-colors hover:text-text"
                    >
                      Tout {visible.every((it) => ACTIVE_STATUSES.has(it.status) || selectedIds.has(it.id)) ? "désélectionner" : "sélectionner"}
                    </button>
                    <span className="text-muted">
                      {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={deleteSelected}
                      disabled={selectedIds.size === 0}
                      className="ml-auto flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1 font-medium text-primary ring-1 ring-border transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                      Supprimer
                    </button>
                  </div>
                )}

                {/* grid-rows 0fr ↔ 1fr. */}
                <div
                  className="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{ gridTemplateRows: isCollapsed ? "0fr" : "1fr" }}
                >
                  <div className="overflow-hidden bg-black/15">
                    {tab === "video" ? (
                      <div className="divide-y divide-border/40">
                        {g.videos.map((it) => (
                          <EpisodeRow
                            key={it.id}
                            it={it}
                            cover={g.cover}
                            selecting={selecting}
                            selected={selectedIds.has(it.id)}
                            onToggleSelect={toggleSelectItem}
                            onPlay={playOffline}
                            onRetry={retry}
                            onCancel={cancel}
                            onRemove={remove}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="divide-y divide-border/30">
                        {g.scans.map((it) => (
                          <ScanRow
                            key={it.id}
                            it={it}
                            selecting={selecting}
                            selected={selectedIds.has(it.id)}
                            onToggleSelect={toggleSelectItem}
                            onPlay={playOffline}
                            onRetry={retry}
                            onCancel={cancel}
                            onRemove={remove}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
