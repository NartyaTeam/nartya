import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { isPremiumActive } from "@/lib/premium";
import { phaseForHour } from "@/utils/timeAmbiance";
import TimeAmbience from "@/components/ambient/TimeAmbience";
import ProfileAmbience from "@/components/ambient/ProfileAmbience";

/** Phase de la journée, relue chaque minute tant que le réglage est actif. */
function useTimePhase(enabled) {
  const [phase, setPhase] = useState(() => phaseForHour(new Date().getHours()));
  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => setPhase(phaseForHour(new Date().getHours()));
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [enabled]);
  return phase;
}

// Les pages de profil affichent déjà l'ambiance du profil visité.
const isProfileRoute = (pathname) => pathname === "/profile" || pathname.startsWith("/profile/") || pathname.startsWith("/u/");

/**
 * Fond commun aux layouts desktop et mobile : la lueur du thème ou l'ambiance selon l'heure,
 * et l'ambiance du profil (pluie, neige, pétales…) sur toute l'app quand l'utilisateur le
 * veut. Le lecteur, les scans et les Watch Party sont hors des layouts : rien n'y apparaît.
 */
export default function AppBackdrop({ defaultGlow }) {
  const { pathname } = useLocation();
  const timeAmbiance = useSettingsStore((s) => s.timeAmbiance);
  const everywhere = useSettingsStore((s) => s.profileAmbienceEverywhere);
  const liteMode = useSettingsStore((s) => s.liteMode);
  const user = useAuthStore((s) => s.user);
  const phase = useTimePhase(timeAmbiance);

  const profileAmbience =
    everywhere && !liteMode && user?.ambient_theme && isPremiumActive(user) && !isProfileRoute(pathname)
      ? user.ambient_theme
      : null;

  return (
    <>
      {timeAmbiance ? (
        <TimeAmbience phase={phase} />
      ) : (
        <div className="pointer-events-none fixed inset-0 z-0" style={{ background: defaultGlow }} />
      )}
      {profileAmbience && <ProfileAmbience id={profileAmbience} />}
    </>
  );
}
