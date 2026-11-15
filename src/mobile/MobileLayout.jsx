import { useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MobileNavigation from "@/components/layout/MobileNavigation";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import AppBackdrop from "@/components/layout/AppBackdrop";

const DEFAULT_GLOW = "radial-gradient(100% 55% at 85% -10%, rgb(var(--primary) / 0.16), transparent 62%)";

const PRIMARY_ROUTES = new Set(["/", "/search", "/planning", "/downloads", "/profile", "/login"]);

// Pages du menu « Plus » : des destinations à part, sans page précédente à retrouver.
const MORE_ROUTES = new Set([
  "/mangas",
  "/prochainement",
  "/tierlists",
  "/leaderboard",
  "/favorites",
  "/my-lists",
  "/history",
  "/profile/achievements",
  "/settings",
  "/nouveautes",
  "/communaute",
  "/faq",
]);

export default function MobileLayout() {
  const mainRef = useRef(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useScrollRestoration(mainRef);
  const isPrimaryTab = PRIMARY_ROUTES.has(pathname);
  // Le centre de signalements tient dans l'écran : seule la conversation défile.
  const fitsScreen = pathname.startsWith("/reports");
  const showBack = !isPrimaryTab && !MORE_ROUTES.has(pathname) && !pathname.startsWith("/reports");
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/", { replace: true });
  };

  return (
    <div className="mobile-shell flex h-full w-full overflow-hidden bg-bg">
      <AppBackdrop defaultGlow={DEFAULT_GLOW} />
      {/* Lisibilité de la barre système quand les cartes défilent dessous. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 h-[calc(env(safe-area-inset-top)+1rem)] bg-gradient-to-b from-bg via-bg/85 to-transparent" />
      {showBack ? (
        <button
          onClick={goBack}
          aria-label="Retour"
          className="fixed left-3 z-30 flex h-11 w-11 items-center justify-center text-white active:scale-90"
          style={{
            top: "calc(env(safe-area-inset-top) + 0.5rem)",
            filter: "drop-shadow(0 1px 3px rgb(0 0 0 / 0.85))",
          }}
        >
          <ArrowLeft size={28} strokeWidth={2.6} />
        </button>
      ) : null}
      <main
        ref={mainRef}
        className={`relative z-10 flex-1 overflow-x-hidden overscroll-y-contain pb-[calc(4rem+env(safe-area-inset-bottom))] ${fitsScreen ? "overflow-y-hidden" : "overflow-y-auto"}`}
      >
        <Outlet />
      </main>
      {/* Pas de Sidebar dans cette coque : la barre reste visible sur tablette. */}
      <MobileNavigation searchPath="/search" forceVisible />
    </div>
  );
}
