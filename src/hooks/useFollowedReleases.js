import { useMemo } from "react";
import { usePlanningStore } from "@/stores/usePlanningStore";
import { useNotifyStore } from "@/stores/useNotifyStore";
import { collectFollowedReleases } from "@/utils/planning";

/** Suivis pour les notifications (cloche), distincts des favoris. */
function useFollowedSet() {
  return useNotifyStore((s) => s.slugs);
}

export function useFollowedReleases() {
  const planning = usePlanningStore((s) => s.planning);
  const followed = useFollowedSet();
  return useMemo(() => collectFollowedReleases(planning, followed), [planning, followed]);
}
