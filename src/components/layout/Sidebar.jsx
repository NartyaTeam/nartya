import { useState, useEffect, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Heart, User, LogIn, LogOut, Clapperboard, Download, Settings, ListChecks, HelpCircle, CalendarDays, Bug, Trophy, Compass, Sparkles, ChevronDown, UserPlus, BookOpen, Search, Library, MessagesSquare, Activity, Users } from "lucide-react";
import BugReportModal from "@/components/BugReportModal";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNetworkStore } from "@/stores/useNetworkStore";
import { usePlanningStore } from "@/stores/usePlanningStore";
import { useFriendsStore } from "@/stores/useFriendsStore";
import { useFollowedReleases } from "@/hooks/useFollowedReleases";
import { countNewReleases } from "@/utils/planning";
import { Fox } from "@/components/brand/NartyaMark";
import { Avatar } from "@/components/ui/Avatar";
import { resolveAvatar } from "@/api/profile";
import RoleBadge from "@/components/profile/RoleBadge";
import SupporterBadge from "@/components/profile/SupporterBadge";
import NotificationBell from "@/components/announcements/NotificationBell";
import { useAnnouncementsStore } from "@/stores/useAnnouncementsStore";
import { guestBlockToast } from "@/lib/guest";
import { useSignOutModalStore } from "@/stores/useSignOutModalStore";
import { DISCORD_INVITE } from "@/config/instance";
import DiscordIcon from "@/components/icons/DiscordIcon";

const TRANS = "250ms cubic-bezier(0.4,0,0.2,1)";

// Pour ouvrir le bon groupe. Le préfixe le plus long l'emporte.
const GROUP_ROUTES = {
  parcourir: ["/", "/mangas", "/recherche", "/planning", "/prochainement", "/party", "/leaderboard"],
  bibliotheque: ["/favorites", "/my-lists", "/downloads"],
  profil: ["/profile", "/communaute"],
  studio: ["/reports", "/uptime", "/faq"],
};

function groupForPath(pathname) {
  let best = "parcourir";
  let bestLen = -1;
  for (const [id, routes] of Object.entries(GROUP_ROUTES)) {
    for (const r of routes) {
      const match = r === "/" ? pathname === "/" : pathname === r || pathname.startsWith(r + "/");
      if (match && r.length > bestLen) {
        best = id;
        bestLen = r.length;
      }
    }
  }
  return best;
}

/** Une seule catégorie ouverte à la fois. `badge` s'affiche quand le groupe est fermé. */
function Group({ icon: Icon, label, expanded, open, onToggle, badge = 0, children }) {
  return (
    <div className="shrink-0">
      <button
        onClick={onToggle}
        title={!expanded ? label : undefined}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 rounded-md px-[15px] py-2 text-sm font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
      >
        <span className="relative shrink-0">
          <Icon size={18} strokeWidth={2} />
          {badge > 0 && (!open || !expanded) && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-bg" />
          )}
        </span>
        <span
          className="flex-1 truncate whitespace-nowrap text-left text-[0.6rem] uppercase tracking-kana text-muted/70"
          style={{ opacity: expanded ? 1 : 0, transition: `opacity ${TRANS}` }}
        >
          {label}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0"
          style={{
            opacity: expanded ? 1 : 0,
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: `opacity ${TRANS}, transform ${TRANS}`,
          }}
        />
      </button>
      {/* Grille 0fr ↔ 1fr : anime la hauteur sans mesurer le contenu. */}
      <div
        className="grid"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transition: `grid-template-rows ${TRANS}` }}
      >
        <div className="overflow-hidden">
          <div className="relative flex flex-col gap-0.5 pt-0.5">
            {/* Masqué quand le rail est replié. */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1.5 left-[23px] top-1 w-px rounded-full bg-border/70"
              style={{ opacity: expanded ? 1 : 0, transition: `opacity ${TRANS}` }}
            />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** `nested` = enfant d'une catégorie. */
function Item({ to, icon: Icon, label, expanded, badge = 0, nested = false, end = true }) {
  const iconSize = nested ? 16 : 18;
  // Aligné sur les catégories rail replié (15 px), glissé à droite (34 px) une fois ouvert.
  const nestedStyle = nested
    ? {
        paddingLeft: expanded ? "34px" : "15px",
        transition: `padding-left ${TRANS}, background-color ${TRANS}, color ${TRANS}`,
      }
    : undefined;
  return (
    <NavLink
      to={to}
      end={end}
      title={!expanded ? label : undefined}
      style={nestedStyle}
      className={({ isActive }) =>
        `group relative flex items-center rounded-md ${
          nested ? "gap-2.5 py-1.5 pr-3 text-[0.8rem] font-normal" : "gap-3 px-[15px] py-2 text-sm font-medium transition-colors"
        } ${
          isActive
            ? "bg-primary font-bold text-primary-fg"
            : `hover:bg-white/[0.04] hover:text-text ${nested ? "text-muted/90" : "text-muted"}`
        }`
      }
    >
      {() => (
        <>
          <span className="relative shrink-0">
            <Icon size={iconSize} strokeWidth={2} />
            {badge > 0 && !expanded && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-bg" />
            )}
          </span>
          <span
            className="flex-1 whitespace-nowrap"
            style={{ opacity: expanded ? 1 : 0, transition: `opacity ${TRANS}` }}
          >
            {label}
          </span>
          {badge > 0 && expanded && (
            <span
              className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.65rem] font-bold text-primary-fg ring-2 ring-bg"
              style={{ opacity: expanded ? 1 : 0, transition: `opacity ${TRANS}` }}
            >
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const showSignOut = useSignOutModalStore((s) => s.show);
  const refreshAvatar = useAuthStore((s) => s.refreshAvatarFromDiscord);
  const online = useNetworkStore((s) => s.online);

  // `unreadCount` est une fonction et ne re-rendrait pas.
  const announcements = useAnnouncementsStore((s) => s.items);
  const unreadAnnouncements = announcements.reduce((n, a) => n + (a.isRead ? 0 : 1), 0);

  // Invité : les onglets restent visibles, le blocage se fait au clic.
  const isGuest = !!session?.user?.is_anonymous;

  // Le planning est chargé par ReleaseNotifier.
  const lastSeenAt = usePlanningStore((s) => s.lastSeenAt);
  const followedReleases = useFollowedReleases();
  const newReleases = countNewReleases(followedReleases, lastSeenAt);

  const pendingRequests = useFriendsStore((s) => s.pendingCount);
  const refreshFriendCount = useFriendsStore((s) => s.refreshCount);
  // L'ID de compte, pas `session`, qui change à chaque rotation de jeton.
  const sessionUserId = session?.user?.id ?? null;
  useEffect(() => {
    if (!sessionUserId || isGuest || !online) return;
    refreshFriendCount();
    const onFocus = () => refreshFriendCount();
    window.addEventListener("focus", onFocus);
    const id = setInterval(refreshFriendCount, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
  }, [sessionUserId, isGuest, online, refreshFriendCount]);

  // La catégorie de la page active est ouverte, et suivie à chaque navigation.
  const { pathname } = useLocation();
  const activeGroup = useMemo(() => groupForPath(pathname), [pathname]);
  const [openGroup, setOpenGroup] = useState(activeGroup);
  useEffect(() => setOpenGroup(activeGroup), [activeGroup]);
  const toggleGroup = (id) => setOpenGroup((cur) => (cur === id ? null : id));

  const fade = { opacity: expanded ? 1 : 0, transition: `opacity ${TRANS}` };
  // Montée mais invisible pendant l'animation de largeur du footer.
  const notificationFade = {
    opacity: expanded ? 1 : 0,
    pointerEvents: expanded ? "auto" : "none",
    transition: expanded ? "opacity 100ms ease 180ms" : "opacity 70ms ease",
  };

  return (
    // Toujours en w-16 dans le flux : aucun reflow quand la sidebar s'ouvre par-dessus.
    <div className="relative z-30 hidden w-16 shrink-0 md:block">
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className="absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-border/60 bg-bg"
        style={{
          width: expanded ? "240px" : "64px",
          transition: `width ${TRANS}`,
          contain: "layout paint",
          boxShadow: expanded ? "4px 0 20px rgba(0,0,0,0.25)" : "none",
        }}
      >
        <div className="app-drag flex h-[84px] shrink-0 items-center gap-3 px-[14px]">
          <Fox className="h-9 w-9 shrink-0 text-primary" />
          <div className="min-w-0 leading-none" style={fade}>
            <p className="whitespace-nowrap text-[0.62rem] font-bold uppercase tracking-[0.42em] text-primary">Nartya</p>
            <p className="t-impact mt-1.5 whitespace-nowrap text-xl">Anime</p>
          </div>
        </div>

        <nav className="app-no-drag flex flex-1 flex-col gap-0.5 px-2">
            {/* Hors ligne : seuls les téléchargements et le profil restent accessibles. */}
            {online && (
              <Group
                icon={Compass}
                label="Parcourir"
                expanded={expanded}
                open={openGroup === "parcourir"}
                onToggle={() => toggleGroup("parcourir")}
                badge={session ? newReleases : 0}
              >
                <Item to="/" icon={Clapperboard} label="Animes" expanded={expanded} nested />
                <Item to="/mangas" icon={BookOpen} label="Mangas" expanded={expanded} nested />
                <Item to="/recherche" icon={Search} label="Recherche" expanded={expanded} nested />
                <Item
                  to="/planning"
                  icon={CalendarDays}
                  label="Calendrier"
                  expanded={expanded}
                  badge={session ? newReleases : 0}
                  nested
                />
                <Item to="/prochainement" icon={Sparkles} label="Prochainement" expanded={expanded} nested />
                {session && (
                  <Item to="/party" icon={Clapperboard} label="Watch Party" expanded={expanded} nested />
                )}
                <Item to="/leaderboard" icon={Trophy} label="Classement" expanded={expanded} nested />
              </Group>
            )}

              {session && (
                <Group
                  icon={Library}
                  label="Bibliothèque"
                  expanded={expanded}
                  open={openGroup === "bibliotheque"}
                  onToggle={() => toggleGroup("bibliotheque")}
                >
                  {online && (
                    <Item to="/favorites" icon={Heart} label="Favoris" expanded={expanded} nested />
                  )}
                  {online && (
                    <Item to="/my-lists" icon={ListChecks} label="Mes listes" expanded={expanded} nested />
                  )}
                  <Item to="/downloads" icon={Download} label="Téléchargements" expanded={expanded} nested />
                </Group>
              )}

              {session && (
                <Group
                  icon={User}
                  label="Profil"
                  expanded={expanded}
                  open={openGroup === "profil"}
                  onToggle={() => toggleGroup("profil")}
                  badge={pendingRequests}
                >
                  <Item to="/profile" icon={User} label="Profil" expanded={expanded} nested />
                  <Item to="/profile/achievements" icon={Trophy} label="Succès" expanded={expanded} nested />
                  {online && (
                    <Item
                      to="/communaute"
                      icon={UserPlus}
                      label="Amis"
                      expanded={expanded}
                      badge={pendingRequests}
                      nested
                    />
                  )}
                </Group>
              )}

          {online && session && (
            <Group
              icon={Sparkles}
              label="Studio"
              expanded={expanded}
              open={openGroup === "studio"}
              onToggle={() => toggleGroup("studio")}
            >
              <Item to="/reports" icon={MessagesSquare} label="Signalements" expanded={expanded} nested end={false} />
              <Item to="/uptime" icon={Activity} label="Uptime" expanded={expanded} nested />
              <Item to="/equipe" icon={Users} label="Équipe" expanded={expanded} nested />
              <Item to="/faq" icon={HelpCircle} label="Aide & FAQ" expanded={expanded} nested />
            </Group>
          )}
        </nav>

        {session && (
          <NavLink
            to="/settings"
            title={!expanded ? "Paramètres" : undefined}
            className={({ isActive }) =>
              `app-no-drag relative mx-2 flex items-center gap-3 rounded-md px-[15px] py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-primary font-bold text-primary-fg" : "text-muted hover:bg-white/[0.04] hover:text-text"
              }`
            }
          >
            {() => (
              <>
                <Settings size={18} className="shrink-0" />
                <span
                  className="whitespace-nowrap"
                  style={{ opacity: expanded ? 1 : 0, transition: `opacity ${TRANS}` }}
                >
                  Paramètres
                </span>
              </>
            )}
          </NavLink>
        )}

        {/* Visible pour l'invité ; l'envoi exige un compte. */}
        {session && online && (
          <button
            onClick={() => (isGuest ? guestBlockToast() : setBugOpen(true))}
            title={!expanded ? "Signaler un bug" : undefined}
            className="app-no-drag mx-2 flex items-center gap-3 rounded-md px-[15px] py-2 text-sm font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-primary"
          >
            <Bug size={18} className="shrink-0" />
            <span
              className="whitespace-nowrap"
              style={{ opacity: expanded ? 1 : 0, transition: `opacity ${TRANS}` }}
            >
              Signaler un bug
            </span>
          </button>
        )}

        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer"
          title={!expanded ? "Rejoindre le Discord" : undefined}
          className="app-no-drag mx-2 mb-2 flex items-center gap-3 rounded-md px-[15px] py-2 text-sm font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
        >
          <DiscordIcon className="h-[18px] w-[18px] shrink-0 text-[#5865F2]" />
          <span
            className="whitespace-nowrap"
            style={{ opacity: expanded ? 1 : 0, transition: `opacity ${TRANS}` }}
          >
            Discord
          </span>
        </a>

        <div className="app-no-drag border-t border-border/60 p-3">
          {isGuest ? (
            // `/settings` étant fermé à l'invité, c'est son seul moyen de quitter le mode visiteur.
            <div className="flex items-center gap-3 px-1 py-1.5">
              <NavLink
                to="/login"
                title={!expanded ? "Créer un compte" : undefined}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:opacity-90"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30">
                  <User size={16} />
                </span>
                <div className="min-w-0 flex-1 leading-none" style={fade}>
                  <p className="whitespace-nowrap text-sm font-semibold">Mode visiteur</p>
                  <p className="mt-1 whitespace-nowrap text-[0.62rem] text-muted">Créer un compte</p>
                </div>
              </NavLink>
              <button
                onClick={showSignOut}
                title="Se déconnecter"
                className="shrink-0 text-muted hover:text-primary"
                style={{ ...fade, pointerEvents: expanded ? "auto" : "none" }}
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : session ? (
            <div className="flex items-center gap-3 px-1 py-1.5">
              <NavLink
                to="/profile"
                title={!expanded ? "Mon profil" : undefined}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:opacity-90"
              >
                {/* Rail replié : la cloche ne tient pas à côté de l'avatar. */}
                <span className="relative shrink-0">
                  <Avatar
                    src={resolveAvatar(user)}
                    name={user?.username}
                    onError={refreshAvatar}
                    className="h-8 w-8 max-w-none shrink-0 rounded-full"
                    textClassName="text-xs"
                  />
                  {unreadAnnouncements > 0 && !expanded && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-bg" />
                  )}
                </span>
                <div className="min-w-0 flex-1 leading-none" style={fade}>
                  <p className="whitespace-nowrap text-sm font-semibold">{user?.username || "—"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <RoleBadge role={user?.role} showMember />
                    <SupporterBadge profile={user} />
                  </div>
                </div>
              </NavLink>
              {/* Révélée quand l'élargissement du rail est presque terminé. */}
              <NotificationBell className="ml-auto" style={notificationFade} />
            </div>
          ) : (
            <NavLink
              to="/login"
              title={!expanded ? "Se connecter" : undefined}
              className="flex items-center gap-3 rounded-md bg-surface px-[11px] py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-2"
            >
              <LogIn size={17} className="shrink-0" />
              <span className="whitespace-nowrap" style={fade}>Se connecter</span>
            </NavLink>
          )}
        </div>
      </aside>

      {bugOpen && <BugReportModal onClose={() => setBugOpen(false)} />}
    </div>
  );
}
