/** `min`/`max` inclusifs, `null` = pas de borne. L'URL porte la clé (`?eps=13-26`). */
export const EPISODE_RANGES = [
  { value: "", label: "Peu importe", min: null, max: null },
  { value: "1-12", label: "Moins de 13", min: 1, max: 12 },
  { value: "13-26", label: "13 à 26", min: 13, max: 26 },
  { value: "27-50", label: "27 à 50", min: 27, max: 50 },
  { value: "51-100", label: "51 à 100", min: 51, max: 100 },
  { value: "101-200", label: "101 à 200", min: 101, max: 200 },
  { value: "201-", label: "Plus de 200", min: 201, max: null },
];

export function episodeRangeFor(value) {
  if (!value) return null;
  return EPISODE_RANGES.find((r) => r.value === value && r.min !== null) || null;
}
