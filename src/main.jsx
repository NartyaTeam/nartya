import React, { lazy, Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { Slide, ToastContainer } from "react-toastify";
import { useAchievementUnlockStore } from "./stores/useAchievementUnlockStore.js";
import "react-toastify/dist/ReactToastify.css";
import App from "./App.jsx";
import { platform } from "./platform/index.js";
import { installGlobalErrorLogging } from "./api/clientLogs.js";
import { useSettingsStore } from "./stores/useSettingsStore.js";
import NartyaIntro from "./components/NartyaIntro.jsx";
import "./index.css";

const AchievementUnlock = lazy(() => import("./components/achievements/AchievementUnlock.jsx"));

if (platform.isMobile) document.documentElement.classList.add("mobile-runtime");

// Avant le rendu, pour ne pas manquer une exception au montage.
installGlobalErrorLogging();

/** La fenêtre est créée cachée : on attend qu'elle soit visible pour jouer l'ident. */
function AppIntro() {
  const [state, setState] = useState(() =>
    !useSettingsStore.getState().nartyaIntro
      ? "done"
      : document.visibilityState === "visible"
        ? "playing"
        : "waiting"
  );

  useEffect(() => {
    if (state !== "waiting") return undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") setState("playing");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [state]);

  if (state !== "playing") return null;
  return <NartyaIntro onDone={() => setState("done")} />;
}

function AchievementUnlockHost() {
  const hasPending = useAchievementUnlockStore((state) => state.queue.length > 0);
  if (!hasPending) return null;
  return (
    <Suspense fallback={null}>
      <AchievementUnlock />
    </Suspense>
  );
}

/**
 * L'app n'enregistre aucun service worker, mais un reliquat peut intercepter les segments
 * vidéo et en servir une copie partielle.
 */
if (typeof navigator !== "undefined" && navigator.serviceWorker) {
  navigator.serviceWorker
    .getRegistrations()
    .then(async (regs) => {
      if (!regs.length) return;
      console.warn(`[sw] ${regs.length} service worker(s) résiduel(s) — désinscription`);
      await Promise.all(regs.map((r) => r.unregister()));
      if (typeof caches !== "undefined") {
        const noms = await caches.keys();
        await Promise.all(noms.map((n) => caches.delete(n)));
      }
    })
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
      {/* La cérémonie de succès couvre toute l'app, lecteur compris. */}
      <AchievementUnlockHost />
      <AppIntro />
      {platform.isMobile ? (
        <ToastContainer
          theme="dark"
          position="bottom-center"
          autoClose={2600}
          transition={Slide}
          icon={false}
          limit={1}
          closeButton={false}
          hideProgressBar
          pauseOnFocusLoss={false}
          pauseOnHover={false}
          draggable="touch"
          draggableDirection="y"
          draggablePercent={30}
        />
      ) : (
        <ToastContainer theme="dark" position="bottom-right" autoClose={3500} />
      )}
    </HashRouter>
  </React.StrictMode>
);
