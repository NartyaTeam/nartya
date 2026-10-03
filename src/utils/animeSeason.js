// Calendrier AniList : WINTER = jan-mar, SPRING = avr-juin, SUMMER = juil-sept, FALL = oct-déc.
const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];

export const SEASON_LABELS = {
  WINTER: "Hiver",
  SPRING: "Printemps",
  SUMMER: "Été",
  FALL: "Automne",
};

export function getCurrentSeason(date = new Date()) {
  const season = SEASONS[Math.floor(date.getMonth() / 3)];
  return { season, year: date.getFullYear() };
}

export function getNextSeason(date = new Date()) {
  const { season, year } = getCurrentSeason(date);
  const idx = SEASONS.indexOf(season);
  return idx === 3 ? { season: "WINTER", year: year + 1 } : { season: SEASONS[idx + 1], year };
}
