import { useEffect, useState } from "react";
import { checkVersionPolicy } from "@/lib/versionPolicy";
import { updateTargetForPlatform } from "@/lib/appUpdate";
import { platform } from "@/platform";

/**
 * Au démarrage, puis à chaque retour au premier plan. `"ok"` tant qu'on ne sait pas.
 * @returns {{status: "ok"|"outdated"|"blocked", currentVersion?, latest?, message?, downloadUrl?}}
 */
export function useVersionGate() {
  const [state, setState] = useState({ status: "ok" });

  useEffect(() => {
    if (typeof platform.getVersion !== "function") return undefined;

    let cancelled = false;
    let requestId = 0;
    const run = async () => {
      const currentRequest = ++requestId;
      try {
        const currentVersion = await platform.getVersion();
        if (!currentVersion) return;
        const result = await checkVersionPolicy(currentVersion, {
          target: updateTargetForPlatform(platform),
        });
        if (!cancelled && currentRequest === requestId) {
          setState({ ...result, currentVersion });
        }
      } catch {
        if (!cancelled && currentRequest === requestId) {
          setState((previous) => ({ status: "ok", currentVersion: previous.currentVersion }));
        }
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void run();
    };

    void run();
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return state;
}
