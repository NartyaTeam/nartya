/** L'API donne une date « jj/mm » sans année et une heure « HHhMM ». */

const HALF_YEAR_MS = 182 * 24 * 60 * 60 * 1000;

/**
 * Année courante, corrigée d'un an si la date tombe à plus de six mois.
 * @returns {Date|null}
 */
export function parseReleaseDate(dateStr, timeStr, now = new Date()) {
  const dm = /^(\d{1,2})\/(\d{1,2})$/.exec((dateStr || "").trim());
  if (!dm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]) - 1;

  let hh = 0;
  let mm = 0;
  const tm = /^(\d{1,2})h(\d{2})?$/.exec((timeStr || "").trim());
  if (tm) {
    hh = Number(tm[1]);
    mm = tm[2] ? Number(tm[2]) : 0;
  }

  const year = now.getFullYear();
  let d = new Date(year, month, day, hh, mm, 0, 0);
  const diff = d.getTime() - now.getTime();
  if (diff < -HALF_YEAR_MS) d = new Date(year + 1, month, day, hh, mm);
  else if (diff > HALF_YEAR_MS) d = new Date(year - 1, month, day, hh, mm);
  return d;
}

/** `at` = timestamp ms, ou null sans heure. */
export function collectFollowedReleases(planning, followedSet, now = new Date()) {
  const out = [];
  for (const day of planning?.days || []) {
    for (const it of day.items || []) {
      if (!followedSet.has(it.slug)) continue;
      const d = parseReleaseDate(day.date, it.time, now);
      out.push({ ...it, dayName: day.name, date: day.date, at: d ? d.getTime() : null });
    }
  }
  out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  return out;
}

/** Sortis depuis la dernière ouverture du calendrier. */
export function countNewReleases(releases, lastSeenAt, now = Date.now()) {
  const slugs = new Set();
  for (const r of releases) {
    if (r.at != null && r.at <= now && r.at > (lastSeenAt || 0)) slugs.add(r.slug);
  }
  return slugs.size;
}
