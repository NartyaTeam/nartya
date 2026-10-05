import { useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import MobileNavigation from "./MobileNavigation";
import TopBar from "./TopBar";
import ScrollToTopButton from "./ScrollToTopButton";
import ReleaseNotifier from "@/components/ReleaseNotifier";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

export default function AppLayout() {
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef(null);
  useScrollRestoration(mainRef);

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(80% 50% at 80% -10%, rgb(var(--primary) / 0.14), transparent 60%)",
        }}
      />
      <Sidebar />
      <MobileNavigation />
      <ReleaseNotifier />
      <main
        ref={mainRef}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 40)}
        className="relative z-10 flex-1 overflow-x-hidden overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        <TopBar scrolled={scrolled} />
        {/* Remonte sous la TopBar transparente. */}
        <div className="-mt-16">
          <Outlet />
        </div>
        <ScrollToTopButton scrollContainerRef={mainRef} />
      </main>
    </div>
  );
}
