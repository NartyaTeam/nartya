import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  Download,
  Heart,
  HelpCircle,
  Home,
  ListChecks,
  LogIn,
  Loader2,
  Megaphone,
  Menu,
  MessagesSquare,
  Search,
  Settings,
  Sparkles,
  Trophy,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNetworkStore } from "@/stores/useNetworkStore";
import { useChangelog } from "@/hooks/useChangelog";
import { useUpdatePolicy } from "@/contexts/UpdatePolicyContext";
import { installAppUpdate } from "@/lib/installAppUpdate";
import { isPremiumActive } from "@/lib/premium";
import { platform } from "@/platform";
import { toast } from "@/lib/toast";

// Exacte : "/profile" et "/profile/achievements" sont deux destinations.
function routeIsActive(pathname, to) {
  if (to === "/reports") return pathname === to || pathname.startsWith("/reports/");
  return pathname === to;
}

function BottomItem({ to, icon: Icon, label }) {
  const { pathname } = useLocation();
  const active = routeIsActive(pathname, to);
  return (
    <NavLink
      to={to}
      aria-label={label}
      className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[0.62rem] font-medium transition-colors active:scale-95 ${
        active ? "text-primary" : "text-muted"
      }`}
    >
      {active && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />}
      <Icon size={20} strokeWidth={active ? 2.4 : 2} />
      <span className="max-w-full truncate">{label}</span>
    </NavLink>
  );
}

function SheetItem({ to, icon: Icon, label, badge = false }) {
  const { pathname } = useLocation();
  const active = routeIsActive(pathname, to);
  return (
    <NavLink
      to={to}
      className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl px-2 text-center text-xs font-medium ring-1 transition-colors active:scale-[0.98] ${
        active
          ? "bg-primary/15 text-primary ring-primary/35"
          : "bg-white/[0.035] text-text ring-border/70 active:bg-white/[0.08]"
      }`}
    >
      <span className="relative">
        <Icon size={20} />
        {badge ? (
          <span
            className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface"
            aria-label="Nouveautés non consultées"
          />
        ) : null}
      </span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function MobileNavigation({ searchPath = "/recherche", forceVisible = false }) {
  const { pathname } = useLocation();
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.user);
  const online = useNetworkStore((state) => state.online);
  const { hasUnread: hasUnreadChangelog } = useChangelog({
    isPremium: isPremiumActive(profile),
  });
  const updatePolicy = useUpdatePolicy();
  const updateAvailable = online && updatePolicy.status === "outdated";
  const [open, setOpen] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const sheetItems = useMemo(
    () =>
      [
        online && { to: "/mangas", icon: BookOpen, label: "Mangas" },
        online && { to: "/prochainement", icon: Sparkles, label: "À venir" },
        online && { to: "/leaderboard", icon: Trophy, label: "Classement" },
        online && session && { to: "/favorites", icon: Heart, label: "Favoris" },
        online && session && { to: "/my-lists", icon: ListChecks, label: "Mes listes" },
        session && { to: "/profile", icon: User, label: "Profil" },
        session && { to: "/profile/achievements", icon: Trophy, label: "Succès" },
        session && { to: "/settings", icon: Settings, label: "Paramètres" },
        { to: "/nouveautes", icon: Megaphone, label: "Nouveautés", badge: hasUnreadChangelog },
        online && session && { to: "/communaute", icon: UserPlus, label: "Amis" },
        online && session && { to: "/reports", icon: MessagesSquare, label: "Signalements" },
        online && { to: "/faq", icon: HelpCircle, label: "Aide" },
      ].filter(Boolean),
    [online, session, hasUnreadChangelog],
  );

  const moreActive = sheetItems.some((item) => routeIsActive(pathname, item.to));
  const hasMenuBadge = hasUnreadChangelog || updateAvailable;

  const openUpdate = async () => {
    if (updateBusy) return;
    platform.haptic?.("light");
    setUpdateBusy(true);
    try {
      const result = await installAppUpdate(updatePolicy);
      if (result?.permissionRequired) {
        toast.info("Autorise Nartya à installer des APK, puis relance la mise à jour.");
      }
      if (result?.started) setOpen(false);
    } catch (error) {
      toast.error(error?.message || "Mise à jour impossible");
    } finally {
      setUpdateBusy(false);
    }
  };

  return (
    <>
      <nav
        aria-label="Navigation mobile"
        className={`fixed inset-x-0 bottom-0 z-[70] flex border-t border-border/80 bg-bg/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_35px_rgba(0,0,0,0.45)] backdrop-blur-xl ${forceVisible ? "" : "md:hidden"}`}
      >
        {online && <BottomItem to="/" icon={Home} label="Accueil" />}
        {online && <BottomItem to={searchPath} icon={Search} label="Recherche" />}
        {online && <BottomItem to="/planning" icon={CalendarDays} label="Calendrier" />}
        {session ? (
          <BottomItem to="/downloads" icon={Download} label="Hors ligne" />
        ) : (
          <BottomItem to="/login" icon={LogIn} label="Connexion" />
        )}
        {!online && session && <BottomItem to="/profile" icon={User} label="Profil" />}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Plus de destinations"
          aria-expanded={open}
          className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[0.62rem] font-medium transition-colors active:scale-95 ${
            open || moreActive ? "text-primary" : "text-muted"
          }`}
        >
          {(open || moreActive) && (
            <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />
          )}
          <span className="relative">
            <Menu size={20} strokeWidth={open || moreActive ? 2.4 : 2} />
            {hasMenuBadge ? (
              <span
                className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-bg"
                aria-label={updateAvailable ? "Mise à jour disponible" : "Nouveautés non consultées"}
              />
            ) : null}
          </span>
          <span>Plus</span>
        </button>
      </nav>

      {open && (
        <div className={`fixed inset-0 z-[80] ${forceVisible ? "" : "md:hidden"}`} role="dialog" aria-modal="true" aria-label="Plus de destinations">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[78dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl animate-slide-up">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-display text-lg font-bold">Explorer Nartya</p>
                <p className="text-xs text-muted">Toutes les destinations</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-muted active:bg-white/[0.12]"
              >
                <X size={20} />
              </button>
            </div>
            {updateAvailable ? (
              <button
                type="button"
                onClick={openUpdate}
                disabled={updateBusy}
                className="mb-3 flex w-full items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.08] px-4 py-3 text-left active:bg-primary/[0.14]"
              >
                {updateBusy ? (
                  <Loader2 size={21} className="shrink-0 animate-spin text-primary" />
                ) : (
                  <Download size={21} className="shrink-0 text-primary" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">Mise à jour disponible</span>
                  <span className="block truncate text-xs text-muted">
                    {updatePolicy.latest ? `Version ${updatePolicy.latest}` : "Nouvelle version Android"}
                  </span>
                </span>
                <span className="text-xs font-bold text-primary">
                  {updateBusy ? "Préparation…" : "Installer"}
                </span>
              </button>
            ) : null}
            <div className="grid grid-cols-3 gap-2.5">
              {sheetItems.map((item) => (
                <SheetItem key={item.to} {...item} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
