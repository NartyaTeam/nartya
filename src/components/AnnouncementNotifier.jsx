import { useEffect, useState } from "react";
import { Bell, X, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAnnouncementsStore } from "@/stores/useAnnouncementsStore";
import AnnouncementMarkdown from "@/components/announcements/AnnouncementMarkdown";

/**
 * Pilote aussi le rafraîchissement : lancement, focus, intervalle. « Plus tard » masque le toast
 * pour la session ; « Voir » ouvre la cloche et marque l'annonce comme lue.
 */

const TYPE_META = {
  info: { icon: Info, cls: "text-sky-300" },
  success: { icon: CheckCircle2, cls: "text-emerald-300" },
  warning: { icon: AlertTriangle, cls: "text-amber-300" },
};

const POLL_MS = 5 * 60 * 1000;

export default function AnnouncementNotifier() {
  const session = useAuthStore((s) => s.session);
  const items = useAnnouncementsStore((s) => s.items);
  const refresh = useAnnouncementsStore((s) => s.refresh);
  const reset = useAnnouncementsStore((s) => s.reset);
  const openPanel = useAnnouncementsStore((s) => s.openPanel);
  const markSeen = useAnnouncementsStore((s) => s.markSeen);
  const panelOpen = useAnnouncementsStore((s) => s.panelOpen);

  const [whatsNewDone, setWhatsNewDone] = useState(false);
  const [dismissed, setDismissed] = useState(() => new Set());

  // Pas par-dessus « Quoi de neuf ».
  useEffect(() => {
    const done = () => setWhatsNewDone(true);
    window.addEventListener("nartya:whatsnew-done", done);
    const t = setTimeout(done, 2500);
    return () => {
      window.removeEventListener("nartya:whatsnew-done", done);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      reset();
      return;
    }
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(refresh, POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
  }, [session, refresh, reset]);

  if (!session || !whatsNewDone || panelOpen) return null;

  const latest = items.find((a) => !a.isRead);
  if (!latest || dismissed.has(latest.id)) return null;

  const hide = () => setDismissed((prev) => new Set(prev).add(latest.id));
  const voir = () => {
    hide();
    markSeen(latest.id);
    openPanel();
  };

  const meta = TYPE_META[latest.type] || TYPE_META.info;
  const Icon = meta.icon;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-80 rounded-lg border border-border bg-surface p-4 shadow-2xl animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon size={18} className={"mt-0.5 shrink-0 " + meta.cls} />
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold tracking-tight">
              {latest.title || "Nouvelle annonce"}
            </h3>
            <div className="mt-0.5 max-h-16 overflow-hidden text-muted [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
              <AnnouncementMarkdown className="text-xs">{latest.body}</AnnouncementMarkdown>
            </div>
          </div>
        </div>
        <button
          onClick={hide}
          className="shrink-0 text-muted transition-colors hover:text-text"
          title="Plus tard"
        >
          <X size={16} />
        </button>
      </div>
      <button
        onClick={voir}
        className="btn-shu mt-3 flex w-full items-center justify-center gap-2"
      >
        <Bell size={15} /> Voir
      </button>
    </div>
  );
}
