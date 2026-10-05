import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BookOpen,
  CircleHelp,
  Download,
  LayoutDashboard,
  LibraryBig,
  Loader2,
  Plus,
  Play,
  UserCog,
  ClipboardList,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuthStore } from "@/stores/useAuthStore";
import ReportConversation from "@/components/reports/ReportConversation";
import BugReportModal from "@/components/BugReportModal";
import {
  getReportMessages,
  listMyReports,
  sendReportMessage,
  subscribeMyReports,
  subscribeReport,
} from "@/api/reports";
import { BUG_CATEGORY_MAP } from "@/utils/bugCategories";
import { toast } from "@/lib/toast";

const CAT_ICONS = { Play, BookOpen, Download, LibraryBig, UserCog, LayoutDashboard, CircleHelp };

// Ajustable à la souris.
const LIST_W_MIN = 220;
const LIST_W_MAX = 480;
const LIST_W_DEFAULT = 320;
const LIST_W_STORAGE_KEY = "nartya-reports-list-w";

const STATUS_DOT = {
  open: "bg-primary",
  handled: "bg-sky-400",
  resolved: "bg-emerald-400",
  rejected: "bg-muted/60",
};

function friendlyError(error) {
  const message = String(error?.message || "");
  const cooldown = message.match(/cooldown:(\d+)/);
  if (cooldown) return `Doucement, réessaie dans ${cooldown[1]} s.`;
  if (message.includes("message_trop_long")) return "Le message est trop long (4000 caractères maximum).";
  if (message.includes("report_closed")) return "Ce signalement est déjà traité.";
  if (message.includes("forbidden")) return "Tu n’as pas accès à ce signalement.";
  if (message.includes("too_many_attachments")) return "4 images maximum par message.";
  return "Le support est momentanément indisponible. Réessaie dans un instant.";
}

function relativeDate(value) {
  if (!value) return "à l’instant";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: fr });
  } catch {
    return "récemment";
  }
}

function ReportsList({ reports, selectedId, onSelect, loading }) {
  return (
    <aside
      // Via `--report-list-w`, à partir de md.
      className={`${selectedId ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-border/70 bg-surface/45 md:w-[var(--report-list-w)]`}
    >
      <div className="flex min-h-[4.5rem] items-center gap-3 border-b border-border/70 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary ring-2 ring-primary/30">
          <ClipboardList size={17} />
        </div>
        <div>
          <p className="text-sm font-bold text-text">Mes signalements</p>
          <p className="text-xs text-muted">{reports.length} au total</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : reports.length ? (
          <div className="space-y-1.5">
            {reports.map((r) => {
              const selected = r.reportId === selectedId;
              const cat = BUG_CATEGORY_MAP[r.category];
              const Icon = CAT_ICONS[cat?.icon] || CircleHelp;
              return (
                <button
                  type="button"
                  key={r.reportId}
                  onClick={() => onSelect(r.reportId)}
                  className={`w-full rounded-md border-2 p-3 text-left transition-colors ${
                    selected
                      ? "border-primary/35 bg-primary/[0.08]"
                      : "border-transparent hover:border-border/70 hover:bg-white/[0.035]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-primary ring-1 ring-border">
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
                          {cat?.label || "Autre"}
                        </p>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[r.status] || STATUS_DOT.open}`} />
                        <span className="shrink-0 text-[0.6rem] text-muted/55">
                          {relativeDate(r.lastMessageAt || r.openedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{r.message}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center px-5 text-center">
            <ClipboardList size={22} className="text-muted/50" />
            <p className="mt-3 text-sm font-semibold text-text">Aucun signalement</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Un souci dans l'app ? Décris-le et suis son traitement ici.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * Superposée sur la bordure : une vraie colonne casserait la ligne des en-têtes. Largeur
 * recalculée depuis le départ du drag : cumuler `movementX` dérive une fois une borne atteinte.
 */
function ResizeHandle({ width, onResize }) {
  const dragRef = useRef(null); // { startX, startWidth } pendant un drag

  const onPointerDown = (event) => {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: width };
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (e) => {
      if (!dragRef.current) return;
      const { startX, startWidth } = dragRef.current;
      onResize(startWidth + (e.clientX - startX));
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      title="Glisser pour redimensionner"
      style={{ left: "var(--report-list-w)" }}
      className="group absolute top-0 bottom-0 z-10 hidden w-2.5 -translate-x-1/2 cursor-col-resize items-center justify-center md:flex"
    >
      <div className="h-10 w-1 rounded-full bg-border/70 transition-colors group-hover:bg-primary/60" />
    </div>
  );
}

export default function ReportsPage() {
  const profile = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const { reportId: routeReportId } = useParams();
  const [listWidth, setListWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(LIST_W_STORAGE_KEY));
      if (saved) return Math.min(LIST_W_MAX, Math.max(LIST_W_MIN, saved));
    } catch (_) {}
    return LIST_W_DEFAULT;
  });
  // Largeur absolue ; seul le bornage se fait ici.
  const resizeList = useCallback((nextWidth) => {
    const next = Math.min(LIST_W_MAX, Math.max(LIST_W_MIN, nextWidth));
    setListWidth(next);
    try {
      localStorage.setItem(LIST_W_STORAGE_KEY, String(next));
    } catch (_) {}
  }, []);
  const [reports, setReports] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  const selectedReport = useMemo(
    () => reports.find((r) => r.reportId === routeReportId) || null,
    [reports, routeReportId],
  );

  const refresh = useCallback(async () => {
    const rows = (await listMyReports()) || [];
    setReports(rows);
    return rows;
  }, []);

  useEffect(() => {
    if (!profile) return undefined;
    let alive = true;
    setLoading(true);
    refresh()
      .then((rows) => {
        if (!alive) return;
        if (!routeReportId && rows.length) navigate(`/reports/${rows[0].reportId}`, { replace: true });
      })
      .catch((error) => alive && toast.error(friendlyError(error)))
      .finally(() => alive && setLoading(false));

    const unsubscribe = subscribeMyReports(() => {
      refresh().catch(() => {});
    });
    return () => {
      alive = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, refresh]);

  useEffect(() => {
    const reportId = selectedReport?.reportId;
    if (!reportId) {
      setMessages([]);
      return undefined;
    }

    let alive = true;
    const loadMessages = async (showLoader = true) => {
      if (showLoader) setConversationLoading(true);
      try {
        const rows = (await getReportMessages(reportId)) || [];
        if (alive) setMessages(rows);
      } catch (error) {
        if (alive) toast.error(friendlyError(error));
      } finally {
        if (alive && showLoader) setConversationLoading(false);
      }
    };

    loadMessages();
    const unsubscribe = subscribeReport(reportId, () => {
      loadMessages(false);
      refresh().catch(() => {});
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [selectedReport?.reportId, refresh]);

  const sendMessage = async (body, files) => {
    if (!selectedReport) return;
    setSending(true);
    try {
      await sendReportMessage(selectedReport.reportId, body, files);
      setMessages((await getReportMessages(selectedReport.reportId)) || []);
      await refresh();
    } catch (error) {
      toast.error(friendlyError(error));
      throw error;
    } finally {
      setSending(false);
    }
  };

  const onNewReport = async () => {
    setComposerOpen(false);
    const rows = await refresh();
    if (rows[0]) navigate(`/reports/${rows[0].reportId}`);
  };

  if (!profile || loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col px-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-20 md:px-5 md:pb-5">
      <div className="mx-auto mb-3 flex w-full max-w-[96rem] items-end justify-between gap-4 px-1">
        <div>
          <p className="eyebrow">Support · Signalements</p>
          <h1 className="t-impact mt-2 text-4xl sm:text-5xl">Signalements</h1>
        </div>
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-fg transition-colors hover:bg-primary/90 active:scale-[0.98]"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nouveau signalement</span>
        </button>
      </div>

      <div
        style={{ "--report-list-w": `${listWidth}px` }}
        className="relative mx-auto flex min-h-0 w-full max-w-[96rem] flex-1 overflow-hidden rounded-md border-2 border-border bg-surface/30 shadow-[0_18px_45px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl"
      >
        <ReportsList
          reports={reports}
          selectedId={routeReportId}
          onSelect={(id) => navigate(`/reports/${id}`)}
          loading={loading}
        />
        <ResizeHandle width={listWidth} onResize={resizeList} />
        <div className={`${routeReportId ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>
          <ReportConversation
            report={selectedReport}
            messages={messages}
            loading={conversationLoading}
            sending={sending}
            onSend={sendMessage}
          />
        </div>
      </div>

      {composerOpen && <BugReportModal onClose={() => setComposerOpen(false)} onSubmitted={onNewReport} />}
    </div>
  );
}
