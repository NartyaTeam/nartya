import { electronPlatform } from "./electron.js";
import { capacitorLazyPlatform, preloadCapacitor } from "./capacitorLazy.js";
import { webPlatform } from "./web.js";

function detectPlatform() {
  if (typeof window !== "undefined" && window.electronAPI) return electronPlatform;
  if (typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.()) {
    preloadCapacitor();
    return capacitorLazyPlatform;
  }
  return webPlatform;
}

export const platform = detectPlatform();
