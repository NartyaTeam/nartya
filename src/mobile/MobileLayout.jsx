import { useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MobileNavigation from "@/components/layout/MobileNavigation";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

const PRIMARY_ROUTES = new Set(["/", "/search", "/planning", "/downloads", "/profile", "/login"]);

export default function MobileLayout() {
  const mainRef = useRef(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useScrollRestoration(mainRef);
  const isPrimaryTab = PRIMARY_ROUTES.has(pathname);
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/", { replace: true });
  };

  return (
    <div className="mobile-shell flex h-full w-full overflow-hidden bg-bg">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(100% 55% at 85% -10%, rgb(255 74 45 / 0.16), transparent 62%)",
        }}
      />
      {/* Lisibilité de la barre système quand les cartes défilent dessous. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 h-[calc(env(safe-area-inset-top)+1rem)] bg-gradient-to-b from-bg via-bg/85 to-transparent" />
      {!isPrimaryTab ? (
        <button
          onClick={goBack}
          aria-label="Retour"
          className="fixed left-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-white shadow-lg ring-1 ring-white/15 active:scale-90"
          style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          <ArrowLeft size={21} />
        </button>
      ) : null}
      <main
        ref={mainRef}
        className="relative z-10 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-[calc(4rem+env(safe-area-inset-bottom))]"
      >
        <Outlet />
      </main>
      {/* Pas de Sidebar dans cette coque : la barre reste visible sur tablette. */}
      <MobileNavigation searchPath="/search" forceVisible />
    </div>
  );
}
