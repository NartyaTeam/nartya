import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { useNetworkStore } from "@/stores/useNetworkStore";
import { platform } from "@/platform";
import { toast } from "@/lib/toast";

// Avant que la carte ne se réduise à une icône.
const EXPANDED_MS = 4000;

// Dégage le bouton « remonter en haut ».
const DESKTOP_POSITION = "fixed bottom-20 right-6 z-40";

/**
 * Mobile : un toast à la coupure. Desktop : une carte réduite à une icône après quelques
 * secondes. Jamais sur le lecteur.
 */
export default function OfflineBanner() {
  const online = useNetworkStore((s) => s.online);
  const checked = useNetworkStore((s) => s.checked);
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(true);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (online || !checked) {
      wasOfflineRef.current = false;
      setExpanded(true);
      return undefined;
    }

    if (platform.isMobile) {
      if (!wasOfflineRef.current) {
        toast.info("Mode hors ligne — seuls tes épisodes téléchargés restent disponibles.");
      }
      wasOfflineRef.current = true;
      return undefined;
    }

    setExpanded(true);
    const timer = setTimeout(() => setExpanded(false), EXPANDED_MS);
    return () => clearTimeout(timer);
  }, [online, checked]);

  if (platform.isMobile) return null;
  if (online || !checked || pathname.startsWith("/watch")) return null;

  if (!expanded) {
    return (
      <div
        role="status"
        aria-label="Mode hors ligne — seuls tes épisodes téléchargés sont disponibles"
        title="Mode hors ligne"
        className={`${DESKTOP_POSITION} flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/25 bg-surface/95 text-amber-300 shadow-lg backdrop-blur-sm animate-fade-in`}
      >
        <WifiOff size={15} />
      </div>
    );
  }

  return (
    <div
      className={`${DESKTOP_POSITION} flex items-center gap-2 rounded-lg border border-amber-500/25 bg-surface/95 px-3.5 py-2.5 text-xs font-medium text-amber-300 shadow-lg backdrop-blur-sm animate-fade-in`}
    >
      <WifiOff size={14} />
      Mode hors ligne — seuls tes épisodes téléchargés sont disponibles.
    </div>
  );
}
