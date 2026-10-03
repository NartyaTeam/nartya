import { useEffect, useMemo, useState } from "react";
import { platform } from "@/platform";
import {
  CHANGELOG_SEEN_EVENT,
  changelogTargetForPlatform,
  getChangelog,
  getUnreadChangelog,
  readLastSeenChangelogVersion,
} from "@/lib/changelog";

/** Commun à la page Nouveautés, la pastille de navigation et la popup post-MAJ. */
export function useChangelog({ isPremium = false } = {}) {
  const [currentVersion, setCurrentVersion] = useState(null);
  const target = changelogTargetForPlatform(platform);
  const [lastSeenVersion, setLastSeenVersion] = useState(() =>
    readLastSeenChangelogVersion(target),
  );

  useEffect(() => {
    let cancelled = false;
    platform
      .getVersion()
      .then((version) => {
        if (!cancelled) setCurrentVersion(version || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refresh = (event) => {
      if (event?.detail?.target && event.detail.target !== target) return;
      setLastSeenVersion(readLastSeenChangelogVersion(target));
    };
    window.addEventListener(CHANGELOG_SEEN_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGELOG_SEEN_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [target]);

  const entries = useMemo(
    () =>
      getChangelog({
        target,
        currentVersion,
        isPremium,
      }),
    [target, currentVersion, isPremium],
  );
  const unreadEntries = useMemo(
    () => getUnreadChangelog(entries, lastSeenVersion),
    [entries, lastSeenVersion],
  );

  return {
    currentVersion,
    lastSeenVersion,
    entries,
    unreadEntries,
    hasUnread: unreadEntries.length > 0,
  };
}
