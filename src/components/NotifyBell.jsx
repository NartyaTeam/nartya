import { Bell, BellRing } from "lucide-react";
import { toast } from "@/lib/toast";
import { useNotifyStore } from "@/stores/useNotifyStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useIsGuest, guestBlockToast } from "@/lib/guest";
import { debouncedToast } from "@/lib/debouncedToast";

/** `variant="button"` : bouton libellé ; `variant="icon"` : cloche compacte. */
export default function NotifyBell({
  slug,
  title,
  variant = "icon",
  iconSize = 14,
  subtle = false,
  className = "",
}) {
  const following = useNotifyStore((s) => s.slugs.has(slug));
  const toggle = useNotifyStore((s) => s.toggle);
  const isGuest = useIsGuest();

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isGuest) {
      guestBlockToast();
      return;
    }
    toggle(slug);
    // Un seul toast pour des appuis répétés, reflétant l'état final.
    debouncedToast(`notify:${slug}`, () => {
      const now = useNotifyStore.getState().slugs.has(slug);
      if (now) {
        toast.success(`Notifications activées${title ? ` pour ${title}` : ""}`);
        // Permission système demandée au premier abonnement.
        const enabled = useSettingsStore.getState().releaseNotifications;
        if (enabled && typeof Notification !== "undefined" && Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
      } else {
        toast.info("Notifications désactivées");
      }
    });
  };

  if (variant === "button") {
    return (
      <button
        onClick={onClick}
        className={`flex w-44 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold transition-colors md:w-52 ${
          following
            ? "bg-primary/15 text-primary ring-1 ring-primary/40"
            : "bg-surface text-text ring-1 ring-border hover:bg-surface-2"
        } ${className}`}
      >
        {following ? <BellRing size={16} /> : <Bell size={16} />}
        {following ? "Sorties suivies" : "Suivre les sorties"}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      title={following ? "Ne plus être notifié des sorties" : "Être notifié des sorties"}
      aria-label={following ? "Ne plus suivre les sorties" : "Suivre les sorties"}
      className={`flex items-center justify-center rounded-full p-1 backdrop-blur-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] transition-colors ${
        subtle
          ? following
            ? "bg-transparent text-primary"
            : "bg-transparent text-muted"
          : following
            ? "bg-primary/20 text-primary ring-1 ring-primary/50"
            : "bg-black/45 text-white hover:bg-black/60 hover:text-primary"
      } ${className}`}
    >
      {following ? <BellRing size={iconSize} /> : <Bell size={iconSize} />}
    </button>
  );
}
