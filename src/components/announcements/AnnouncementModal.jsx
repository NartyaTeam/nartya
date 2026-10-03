import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Info, CheckCircle2, AlertTriangle, Link as LinkIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Avatar } from "@/components/ui/Avatar";
import AnnouncementMarkdown from "@/components/announcements/AnnouncementMarkdown";
import { platform } from "@/platform";

const TYPE_META = {
  info: { icon: Info, iconClass: "text-sky-400" },
  success: { icon: CheckCircle2, iconClass: "text-emerald-400" },
  warning: { icon: AlertTriangle, iconClass: "text-amber-400" },
};

function openLink(url) {
  platform.openExternal(url);
}

export default function AnnouncementModal({ announcement, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!announcement) return null;
  const a = announcement;
  const meta = TYPE_META[a.type] || TYPE_META.info;
  const Icon = meta.icon;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in-fast" onClick={onClose} />

      <div className="animate-slide-up relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-md border border-border bg-surface shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <Icon size={17} className={`mt-0.5 shrink-0 ${meta.iconClass}`} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold tracking-tight text-text">
              {a.title || "Annonce"}
            </h2>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              {a.authorAvatar || a.authorName ? (
                <>
                  <Avatar
                    src={a.authorAvatar}
                    name={a.authorName}
                    className="h-4 w-4 shrink-0 rounded-full"
                    textClassName="text-[0.5rem]"
                  />
                  <span className="truncate">{a.authorName || "Nartya"}</span>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span className="whitespace-nowrap">
                {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: fr })}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Fermer"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <AnnouncementMarkdown className="text-sm">{a.body}</AnnouncementMarkdown>

          {a.buttons?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {a.buttons.map((b, i) => (
                <button
                  key={i}
                  onClick={() => openLink(b.url)}
                  className="inline-flex items-center gap-1.5 rounded bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary/90"
                >
                  <LinkIcon size={14} />
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
