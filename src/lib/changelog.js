import { CHANGELOG } from "../data/changelog.js";
import { MOBILE_CHANGELOG } from "../data/changelog.mobile.js";
import { IOS_CHANGELOG } from "../data/changelog.ios.js";
import { compareVersions } from "./semver.js";

const CHANGELOG_LAST_SEEN_KEYS = {
  android: "nartya-last-seen-version:android-v1",
  ios: "nartya-last-seen-version:ios-v1",
  desktop: "nartya-last-seen-version",
};
export const CHANGELOG_SEEN_EVENT = "nartya:changelog-seen";

const CHANGELOG_BY_TARGET = {
  android: MOBILE_CHANGELOG,
  ios: IOS_CHANGELOG,
  desktop: CHANGELOG,
};

/** Le filtrage Premium précède le retrait des versions vides. */
export function filterChangelog(
  source,
  { currentVersion = null, isPremium = false } = {},
) {
  return source
    .filter((entry) => !currentVersion || compareVersions(entry.version, currentVersion) <= 0)
    .map((entry) => ({
      ...entry,
      items: entry.items.filter((item) => !item.premiumOnly || isPremium),
    }))
    .filter((entry) => entry.items.length > 0);
}

export function changelogTargetForPlatform(currentPlatform) {
  if (!currentPlatform?.isMobile) return "desktop";
  return currentPlatform.os === "ios" ? "ios" : "android";
}

export function getChangelog({ target = "desktop", ...options } = {}) {
  const source = CHANGELOG_BY_TARGET[target] || CHANGELOG;
  return filterChangelog(source, options);
}

export function getUnreadChangelog(entries, lastSeenVersion) {
  if (!lastSeenVersion) return [];
  return entries.filter((entry) => compareVersions(entry.version, lastSeenVersion) > 0);
}

function lastSeenKey(target = "desktop") {
  return CHANGELOG_LAST_SEEN_KEYS[target] || CHANGELOG_LAST_SEEN_KEYS.desktop;
}

export function readLastSeenChangelogVersion(target = "desktop") {
  try {
    return localStorage.getItem(lastSeenKey(target));
  } catch {
    return null;
  }
}

export function markChangelogSeen(version, target = "desktop") {
  if (!version) return;
  try {
    const previous = readLastSeenChangelogVersion(target);
    if (previous && compareVersions(previous, version) >= 0) return;
    localStorage.setItem(lastSeenKey(target), version);
    window.dispatchEvent(new CustomEvent(CHANGELOG_SEEN_EVENT, { detail: { version, target } }));
  } catch {}
}
