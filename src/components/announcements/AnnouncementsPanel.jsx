import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  X,
  Info,
  CheckCircle2,
  AlertTriangle,
  Link as LinkIcon,
  CheckCheck,
  Inbox,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow, isToday, isThisWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { useAnnouncementsStore } from "@/stores/useAnnouncementsStore";
import { Avatar } from "@/components/ui/Avatar";
import AnnouncementMarkdown from "@/components/announcements/AnnouncementMarkdown";
import AnnouncementModal from "@/components/announcements/AnnouncementModal";
import { platform } from "@/platform";

const TYPE_META = {
  info: { icon: Info, iconClass: "text-sky-400" },
  success: { icon: CheckCircle2, iconClass: "text-emerald-400" },
  warning: { icon: AlertTriangle, iconClass: "text-amber-400" },
};

function openLink(url) {
  platform.openExternal(url);
}

function groupLabel(date) {
  if (isToday(date)) return "Aujourd’hui";
  if (isThisWeek(date, { weekStartsOn: 1 })) return "Cette semaine";
  return "Plus anciennes";
}

function groupAnnouncements(items) {
  const groups = new Map();
  for (const item of items) {
    const label = groupLabel(new Date(item.createdAt));
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  return [...groups.entries()];
}

function AnnouncementItem({ announcement, onDismiss, onOpen }) {
  const a = announcement;
  const meta = TYPE_META[a.type] || TYPE_META.info;
  const Icon = meta.icon;

  return (
    <li className="group relative flex gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
      {!a.isRead && (
        <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" aria-hidden />
      )}

      <Icon size={15} className={`mt-[3px] shrink-0 ${meta.iconClass}`} />

      <div className="flex min-w-0 flex-1 flex-col">
        <button onClick={() => onOpen(a)} className="min-w-0 text-left">
          <span className="flex min-w-0 items-baseline gap-2 pr-6">
            <span className="line-clamp-1 min-w-0 flex-1 text-sm font-semibold text-text">
              {a.title || "Annonce Nartya"}
            </span>
            <span className="shrink-0 text-[0.65rem] text-muted/70">
              {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: fr })}
            </span>
          </span>

          <span className="mt-0.5 block max-h-9 overflow-hidden text-muted [mask-image:linear-gradient(to_bottom,black_65%,transparent)]">
            <AnnouncementMarkdown className="text-xs leading-[1.3rem]">{a.body}</AnnouncementMarkdown>
          </span>

          {(a.authorAvatar || a.authorName) && (
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[0.68rem] text-muted/75">
              <Avatar
                src={a.authorAvatar}
                name={a.authorName}
                className="h-4 w-4 shrink-0 rounded-full"
                textClassName="text-[0.5rem]"
              />
              <span className="max-w-24 truncate">{a.authorName || "Nartya"}</span>
            </span>
          )}
        </button>

        {a.buttons?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {a.buttons.map((button, index) => (
              <button
                key={index}
                onClick={() => openLink(button.url)}
                className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-[0.7rem] font-semibold text-text transition-colors hover:border-primary/50 hover:text-primary"
              >
                <LinkIcon size={12} />
                {button.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => onDismiss(a.id)}
        title="Supprimer"
        aria-label={`Supprimer ${a.title || "la notification"}`}
        className="absolute right-3 top-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted/40 transition-colors hover:bg-white/[0.06] hover:text-text"
      >
        <Trash2 size={13} />
      </button>
    </li>
  );
}

export default function AnnouncementsPanel() {
  const open = useAnnouncementsStore((s) => s.panelOpen);
  const items = useAnnouncementsStore((s) => s.items);
  const closePanel = useAnnouncementsStore((s) => s.closePanel);
  const dismissOne = useAnnouncementsStore((s) => s.dismissOne);
  const markSeen = useAnnouncementsStore((s) => s.markSeen);
  const markAllSeen = useAnnouncementsStore((s) => s.markAllSeen);
  const panelRef = useRef(null);

  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const unread = items.reduce((count, item) => count + (item.isRead ? 0 : 1), 0);

  useEffect(() => {
    if (open) setFilter("all");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && !expanded && closePanel();
    const onClick = (event) => {
      if (
        !expanded &&
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        !event.target.closest?.("[data-bell-toggle]")
      ) {
        closePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick, true);
    };
  }, [open, expanded, closePanel]);

  const filteredItems = useMemo(
    () => (filter === "unread" ? items.filter((item) => !item.isRead) : items),
    [filter, items]
  );
  const groups = useMemo(() => groupAnnouncements(filteredItems), [filteredItems]);

  if (!open) return null;

  const openAnnouncement = (announcement) => {
    markSeen(announcement.id);
    setExpanded({ ...announcement, isRead: true });
  };

  return createPortal(
    <>
      <div
        ref={panelRef}
        className="fixed bottom-3 left-[72px] z-[80] flex max-h-[78vh] w-[400px] flex-col overflow-hidden rounded-md border border-border bg-surface shadow-[0_24px_80px_-18px_rgba(0,0,0,0.85)] animate-fade-in-fast"
      >
        <header className="shrink-0 px-4 pb-2 pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Bell size={15} className="shrink-0 text-text" />
              <h2 className="font-display text-sm font-bold tracking-tight text-text">
                Notifications
              </h2>
              <span className="truncate text-[0.68rem] text-muted">
                · {unread ? `${unread} non lue${unread > 1 ? "s" : ""}` : "À jour"}
              </span>
            </div>

            <button
              onClick={closePanel}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
              title="Fermer"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 border-b border-border/70">
            <div className="flex" role="tablist" aria-label="Filtrer les notifications">
              {[
                ["all", "Toutes", items.length],
                ["unread", "Non lues", unread],
              ].map(([id, label, count]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                    filter === id
                      ? "border-primary text-text"
                      : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {label}
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[0.6rem] tabular-nums text-muted">
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {unread > 0 && (
              <button
                onClick={markAllSeen}
                className="mb-1.5 inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-[0.68rem] font-semibold text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
              >
                <CheckCheck size={14} />
                Tout lire
              </button>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
          {groups.length ? (
            <div className="space-y-4">
              {groups.map(([label, groupItems]) => (
                <section key={label} aria-labelledby={`notifications-${label}`}>
                  <h3
                    id={`notifications-${label}`}
                    className="sticky top-0 z-10 bg-surface px-4 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted/65"
                  >
                    {label}
                  </h3>
                  <ul className="divide-y divide-border/50">
                    {groupItems.map((announcement) => (
                      <AnnouncementItem
                        key={announcement.id}
                        announcement={announcement}
                        onDismiss={dismissOne}
                        onOpen={openAnnouncement}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-8 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-muted/50">
                {filter === "unread" ? <CheckCheck size={21} /> : <Inbox size={21} />}
              </span>
              <p className="mt-4 text-sm font-semibold text-text">
                {filter === "unread" ? "Tout est lu" : "Aucune notification"}
              </p>
              <p className="mt-1 max-w-56 text-xs leading-5 text-muted">
                {filter === "unread"
                  ? "Les nouvelles annonces apparaîtront ici."
                  : "Les actualités importantes de Nartya apparaîtront ici."}
              </p>
            </div>
          )}
        </div>
      </div>

      <AnnouncementModal announcement={expanded} onClose={() => setExpanded(null)} />
    </>,
    document.body
  );
}
