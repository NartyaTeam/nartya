import { useEffect, useRef } from "react";
import { usePlanningStore } from "@/stores/usePlanningStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useFollowedReleases } from "@/hooks/useFollowedReleases";
import { asset } from "@/lib/asset";

const TICK_MS = 60 * 1000;
// Seulement la dernière heure, pour ne pas notifier en rafale au lancement.
const NOTIFY_WINDOW_MS = 60 * 60 * 1000;
const NOTIFIED_KEY = "nartya_planning_notified";
const PRUNE_MS = 8 * 24 * 60 * 60 * 1000;

function loadNotified() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveNotified(map) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
  } catch {}
}

/** Sans UI. Dédupliqué par (slug, date). */
export default function ReleaseNotifier() {
  const session = useAuthStore((s) => s.session);
  const load = usePlanningStore((s) => s.load);
  const enabled = useSettingsStore((s) => s.releaseNotifications);
  const releases = useFollowedReleases();

  const releasesRef = useRef(releases);
  releasesRef.current = releases;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!session) return;
    load();
    const id = setInterval(() => load(), 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [session, load]);

  useEffect(() => {
    if (!enabled || typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [enabled]);

  useEffect(() => {
    if (!session) return;
    const tick = () => {
      if (!enabledRef.current || typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;

      const now = Date.now();
      const notified = loadNotified();
      let changed = false;

      for (const r of releasesRef.current) {
        if (r.at == null) continue;
        const age = now - r.at;
        if (age < 0 || age > NOTIFY_WINDOW_MS) continue; // pas encore sortie, ou trop ancienne
        const key = `${r.slug}:${r.date}`;
        if (notified[key]) continue;

        try {
          const n = new Notification("Nouvel épisode disponible", {
            body: `${r.title} — un nouvel épisode vient de sortir sur Nartya`,
            icon: r.image || asset("icon.png"),
            tag: key,
          });
          n.onclick = () => {
            window.focus?.();
            window.location.hash = `#/anime/${r.slug}`;
          };
        } catch {
          /* Notification refusée : marquée comme vue quand même. */
        }
        notified[key] = now;
        changed = true;
      }

      for (const [k, ts] of Object.entries(notified)) {
        if (now - ts > PRUNE_MS) {
          delete notified[k];
          changed = true;
        }
      }
      if (changed) saveNotified(notified);
    };

    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [session]);

  return null;
}
