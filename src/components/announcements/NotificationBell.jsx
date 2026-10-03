import { Bell } from "lucide-react";
import { useAnnouncementsStore } from "@/stores/useAnnouncementsStore";

/** `data-bell-toggle` évite au panneau de se refermer sur ce même clic. */
export default function NotificationBell({ className = "", style }) {
  const items = useAnnouncementsStore((s) => s.items);
  const panelOpen = useAnnouncementsStore((s) => s.panelOpen);
  const togglePanel = useAnnouncementsStore((s) => s.togglePanel);

  const unread = items.reduce((n, a) => n + (a.isRead ? 0 : 1), 0);

  const onClick = () => {
    togglePanel();
  };

  return (
    <button
      data-bell-toggle
      onClick={onClick}
      title="Notifications"
      style={style}
      className={
        "relative shrink-0 transition-colors " +
        (panelOpen ? "text-primary " : "text-muted hover:text-primary ") +
        className
      }
    >
      <Bell size={18} />
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-bold leading-none text-primary-fg">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
