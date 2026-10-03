import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDiscordPresence } from "@/hooks/useDiscordPresence";
import { platform } from "@/platform";

/**
 * État « navigation » par défaut, sauf sur /watch et /anime qui poussent le leur. Écoute aussi
 * le deep-link nartya://anime/<slug>.
 */
export default function DiscordPresence() {
  const location = useLocation();
  const navigate = useNavigate();

  const ownsItsPresence =
    location.pathname.startsWith("/watch/") || location.pathname.startsWith("/anime/");

  useDiscordPresence(ownsItsPresence ? null : { type: "home" }, [ownsItsPresence]);

  // Lu côté renderer : le main n'a pas accès aux variables Vite.
  useEffect(() => {
    const clientId = import.meta.env.VITE_DISCORD_RPC_CLIENT_ID;
    if (clientId && platform.discord?.connect) {
      platform.discord.connect(clientId).catch(() => {});
    }
  }, []);

  useEffect(() => {
    return platform.onNavigate((route) => {
      if (typeof route === "string" && route.startsWith("/")) navigate(route);
    });
  }, [navigate]);

  return null;
}
