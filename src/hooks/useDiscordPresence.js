import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { platform } from "@/platform";

/** Electron uniquement, avec un léger debounce. Réglage coupé : la présence est effacée. */
export function useDiscordPresence(params, deps = []) {
  const timer = useRef(null);
  const enabled = useSettingsStore((s) => s.discordPresence);

  useEffect(() => {
    const discord = platform.discord;
    if (!discord?.setPresence) return;
    if (!enabled) {
      discord.clearPresence?.().catch(() => {});
      return;
    }
    if (!params) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      discord.setPresence(params).catch(() => {});
    }, 500);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
}
