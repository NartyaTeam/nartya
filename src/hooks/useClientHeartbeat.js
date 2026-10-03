import { useEffect } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNetworkStore } from "@/stores/useNetworkStore";
import { useBanStore } from "@/stores/useBanStore";
import { useDeviceStore } from "@/stores/useDeviceStore";
import { clientHeartbeat } from "@/api/heartbeat";
import { checkBan } from "@/api/ban";

// La fenêtre serveur du créneau d'appareil est de 2 min : à 60 s, un battement manqué passe.
const SESSION_MS = 60_000;

// Hors session, seul un ban machine peut tomber.
const ANON_MS = 5 * 60_000;

export async function pulseHeartbeat() {
  const hasSession = !!useAuthStore.getState().session;
  try {
    if (hasSession) {
      const { ban, device } = await clientHeartbeat();
      useBanStore.getState().apply(ban);
      useDeviceStore.getState().apply(device);
    } else {
      useBanStore.getState().apply(await checkBan());
    }
  } catch {
    // Réseau indisponible : on débloque l'UI sans rien inférer.
    useBanStore.getState().markChecked();
    useDeviceStore.getState().markChecked();
  }
}

/**
 * Ban, créneau d'appareil et présence en une requête. Les stores portent l'état, la
 * minuterie vit ici.
 */
export function useClientHeartbeat() {
  const session = useAuthStore((s) => s.session);
  const online = useNetworkStore((s) => s.online);

  useEffect(() => {
    // Pas de ban inféré d'une panne réseau.
    if (!online) {
      useBanStore.getState().markChecked();
      useDeviceStore.getState().markChecked();
      return;
    }

    let timer = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      if (document.visibilityState === "hidden") return;
      stop();
      pulseHeartbeat();
      timer = setInterval(pulseHeartbeat, session ? SESSION_MS : ANON_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session, online]);
}
