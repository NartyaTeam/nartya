import { lazy, Suspense, useEffect, useRef } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";
import { useBanStore } from "@/stores/useBanStore";
import BanScreen from "@/components/BanScreen";
import { useDeviceStore } from "@/stores/useDeviceStore";
import UpdateRequiredScreen from "@/components/UpdateRequiredScreen";
import { useFavoritesStore } from "@/stores/useFavoritesStore";
import { revalidateAll } from "@/hooks/useCachedResource";
import { useClientHeartbeat } from "@/hooks/useClientHeartbeat";
import { useVersionGate } from "@/hooks/useVersionGate";
import { useNetworkStore } from "@/stores/useNetworkStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { setMaxConcurrentDownloads } from "@/api/downloads";
import { downloadConcurrency } from "@/lib/premium";
import { platform } from "@/platform";
import { useSettingsStore } from "@/stores/useSettingsStore";
import AppLayout from "@/components/layout/AppLayout";
import MobileLayout from "@/mobile/MobileLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import OfflineBanner from "@/components/OfflineBanner";
import { WatchPartyProvider } from "@/contexts/WatchPartyProvider";
import { UpdatePolicyProvider } from "@/contexts/UpdatePolicyContext";
import SignOutModal from "@/components/SignOutModal";
import { useSignOutModalStore } from "@/stores/useSignOutModalStore";
import { asset } from "@/lib/asset";

// Chargées à l'ouverture de leur route : Artplayer et hls.js restent hors du démarrage.
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const HomePage = lazy(() => import("@/pages/HomePage"));
const MangaHomePage = lazy(() => import("@/pages/MangaHomePage"));
const AnimePage = lazy(() => import("@/pages/AnimePage"));
const GenrePage = lazy(() => import("@/pages/GenrePage"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));
const MobileSearchPage = lazy(() => import("@/mobile/MobileSearchPage"));
const MobileChangelogPage = lazy(() => import("@/mobile/MobileChangelogPage"));
const SearchHubPage = lazy(() => import("@/pages/SearchHubPage"));
const PlanningPage = lazy(() => import("@/pages/PlanningPage"));
const UpcomingPage = lazy(() => import("@/pages/UpcomingPage"));
const WatchPage = lazy(() => import("@/pages/WatchPage"));
const ScanReaderPage = lazy(() => import("@/pages/ScanReaderPage"));
const FavoritesPage = lazy(() => import("@/pages/FavoritesPage"));
const MyListsPage = lazy(() => import("@/pages/MyListsPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const AchievementsPage = lazy(() => import("@/pages/AchievementsPage"));
const PublicProfilePage = lazy(() => import("@/pages/PublicProfilePage"));
const LeaderboardPage = lazy(() => import("@/pages/LeaderboardPage"));
const CommunautePage = lazy(() => import("@/pages/CommunautePage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const FAQPage = lazy(() => import("@/pages/FAQPage"));
const EquipePage = lazy(() => import("@/pages/EquipePage"));
const UptimePage = lazy(() => import("@/pages/UptimePage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const DownloadsPage = lazy(() => import("@/pages/DownloadsPage"));
const PartyHomePage = lazy(() => import("@/pages/party/PartyHomePage"));
const PartyRoomPage = lazy(() => import("@/pages/party/PartyRoomPage"));
// Outil de dev, absent du build de production.
const ProfileArtPreviewPage = import.meta.env.DEV
  ? lazy(() => import("@/pages/ProfileArtPreviewPage"))
  : null;

// Les composants propres au desktop n'alourdissent pas le mobile.
const DiscordPresence = lazy(() => import("@/components/DiscordPresence"));
const WhatsNew = lazy(() => import("@/components/WhatsNew"));
const DiscoverHub = lazy(() => import("@/components/DiscoverHub"));
const MilestoneGift = lazy(() => import("@/components/MilestoneGift"));
const AnnouncementNotifier = lazy(() => import("@/components/AnnouncementNotifier"));
const AnnouncementsPanel = lazy(() => import("@/components/announcements/AnnouncementsPanel"));

// Hors ligne, les autres routes renvoient vers les téléchargements.
const OFFLINE_ALLOWED_PREFIXES = [
  "/downloads",
  "/watch",
  "/scan/",
  "/profile",
  "/settings",
  "/login",
  "/nouveautes",
];

function RouteFallback() {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg" aria-label="Chargement">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

export default function App() {
  const init = useAuthStore((s) => s.init);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const loading = useAuthStore((s) => s.loading);
  const session = useAuthStore((s) => s.session);
  const sessionUserId = session?.user?.id ?? null;
  const user = useAuthStore((s) => s.user);
  const banned = useBanStore((s) => s.banned);
  const banKind = useBanStore((s) => s.kind);
  const banReason = useBanStore((s) => s.reason);
  const banUntil = useBanStore((s) => s.until);
  const deviceReset = useDeviceStore((s) => s.reset);
  const netInit = useNetworkStore((s) => s.init);
  const online = useNetworkStore((s) => s.online);
  const checked = useNetworkStore((s) => s.checked);
  const downloadsInit = useDownloadsStore((s) => s.init);
  const downloadsLoaded = useDownloadsStore((s) => s.loaded);
  const resumeInterruptedDownloads = useDownloadsStore((s) => s.resumeInterrupted);
  const downloadParallelism = useSettingsStore((s) => s.downloadParallelism);
  const location = useLocation();
  const navigate = useNavigate();
  const signOutModalOpen = useSignOutModalStore((s) => s.open);
  const hideSignOutModal = useSignOutModalStore((s) => s.hide);
  const ensureFavoritesLoaded = useFavoritesStore((s) => s.ensureLoaded);

  useClientHeartbeat();

  const versionGate = useVersionGate();

  useEffect(() => {
    init();
    netInit();
  }, [init, netInit]);

  // Pas nécessaire à la première image : chargé pendant un temps mort.
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => downloadsInit(), { timeout: 1_500 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(() => downloadsInit(), 250);
    return () => clearTimeout(id);
  }, [downloadsInit]);

  // Après un redémarrage, Android ne garde que les fragments et les métadonnées : on
  // récupère de nouveaux jetons de source avant de reprendre la file.
  useEffect(() => {
    if (!platform.isMobile || !checked || !online || !downloadsLoaded || !sessionUserId) return;
    void resumeInterruptedDownloads();
  }, [checked, online, downloadsLoaded, sessionUserId, resumeInterruptedDownloads]);

  // iOS fige les téléchargements quand l'app quitte l'écran.
  useEffect(() => {
    if (platform.os !== "ios" || !checked || !online || !downloadsLoaded || !sessionUserId) return undefined;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void useDownloadsStore
        .getState()
        .refresh()
        .catch(() => {})
        .then(() => resumeInterruptedDownloads());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checked, online, downloadsLoaded, sessionUserId, resumeInterruptedDownloads]);

  useEffect(() => {
    if (!sessionUserId) deviceReset();
  }, [sessionUserId, deviceReset]);

  // Le forfait fixe le plafond ; l'utilisateur peut choisir moins.
  const entitlement = downloadConcurrency(user);
  useEffect(() => {
    const requested = Number(downloadParallelism);
    const effective =
      downloadParallelism === "auto" || !Number.isFinite(requested)
        ? entitlement
        : Math.max(1, Math.min(entitlement, Math.floor(requested)));
    setMaxConcurrentDownloads(effective);
  }, [entitlement, downloadParallelism]);

  useEffect(() => {
    const onUnload = () => {
      if (useAuthStore.getState().session) {
        import("@/api/devices").then((m) => m.releaseDeviceSlot()).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // Sur desktop, DiscordPresence a son propre listener.
  useEffect(() => {
    if (!platform.isMobile) return undefined;
    return platform.onNavigate((route) => {
      if (typeof route === "string" && route.startsWith("/")) navigate(route);
    });
  }, [navigate]);

  useEffect(() => {
    if (!checked || online) return;
    const allowed = OFFLINE_ALLOWED_PREFIXES.some((p) => location.pathname.startsWith(p));
    if (!allowed) navigate("/downloads", { replace: true });
  }, [checked, online, location.pathname, navigate]);

  // Retour en ligne : profil rechargé et cache invalidé, sans recharger l'app.
  const prevOnline = useRef(online);
  useEffect(() => {
    const wasOnline = prevOnline.current;
    prevOnline.current = online;
    if (checked && !wasOnline && online) {
      loadProfile();
      revalidateAll();
    }
  }, [online, checked, loadProfile]);

  useEffect(() => {
    if (session?.user?.id && !session.user.is_anonymous) ensureFavoritesLoaded();
  }, [session?.user?.id, session?.user?.is_anonymous, ensureFavoritesLoaded]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-bg">
        <img src={asset("icon.png")} alt="Nartya" className="h-24 w-24 animate-pulse object-contain" />
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  // Avant le ban : un banni sur une version morte doit d'abord mettre à jour.
  if (versionGate.status === "blocked") {
    return (
      <UpdateRequiredScreen
        latest={versionGate.latest}
        message={versionGate.message}
        downloadUrl={versionGate.downloadUrl}
        sha256={versionGate.sha256}
      />
    );
  }

  if (banned) {
    return <BanScreen kind={banKind} reason={banReason} until={banUntil} />;
  }

  return (
    <UpdatePolicyProvider value={versionGate}>
      <WatchPartyProvider>
      <Suspense fallback={null}>
        <WhatsNew />
      </Suspense>
      {!platform.isMobile && (
        <Suspense fallback={null}>
          <DiscordPresence />
          <MilestoneGift />
          <AnnouncementNotifier />
          <AnnouncementsPanel />
          <DiscoverHub />
        </Suspense>
      )}
      <OfflineBanner />
      {/* Hors des routes : `signOut()` démonte la route courante, la modale doit y survivre. */}
      {signOutModalOpen && <SignOutModal onClose={hideSignOutModal} />}
      <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Sans session, pour tester une collection avant qu'elle existe côté serveur. */}
      {ProfileArtPreviewPage && (
        <Route path="/profile/atelier" element={<ProfileArtPreviewPage />} />
      )}
      <Route
        path="/watch/:slug"
        element={
          <ProtectedRoute>
            <WatchPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scan/:slug"
        element={
          <ProtectedRoute>
            <ScanReaderPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/party/:code"
        element={
          <ProtectedRoute requireAccount feature="party">
            <PartyRoomPage />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            {platform.isMobile ? <MobileLayout /> : <AppLayout />}
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/mangas" element={<MangaHomePage />} />
        <Route path="/anime/:slug" element={<AnimePage />} />
        <Route path="/genre/:genre" element={<GenrePage />} />
        <Route path="/search" element={platform.isMobile ? <MobileSearchPage /> : <SearchPage />} />
        <Route path="/planning" element={<PlanningPage />} />
        <Route path="/prochainement" element={<UpcomingPage />} />
        <Route path="/recherche" element={<SearchHubPage />} />
        <Route path="/conseiller" element={<Navigate to="/recherche" replace />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/nouveautes" element={<MobileChangelogPage />} />
        {/* Un invité voit l'écran GuestGate. */}
        <Route
          path="/downloads"
          element={
            <ProtectedRoute requireAccount feature="downloads">
              <DownloadsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/party"
          element={
            <ProtectedRoute requireAccount feature="party">
              <PartyHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/favorites"
          element={
            <ProtectedRoute requireAccount feature="favorites">
              <FavoritesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-lists"
          element={
            <ProtectedRoute requireAccount feature="lists">
              <MyListsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute requireAccount feature="profile">
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/achievements"
          element={
            <ProtectedRoute requireAccount feature="profile">
              <AchievementsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/u/:handle" element={<PublicProfilePage />} />
        <Route
          path="/communaute"
          element={
            <ProtectedRoute requireAccount feature="friends">
              <CommunautePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute requireAccount feature="settings">
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/:reportId?"
          element={
            <ProtectedRoute requireAccount feature="reports">
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/equipe" element={<EquipePage />} />
        <Route path="/uptime" element={<UptimePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </WatchPartyProvider>
    </UpdatePolicyProvider>
  );
}
