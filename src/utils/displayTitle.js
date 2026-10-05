/** Corps du titre en Anton : diminue avec la longueur pour tenir dans le bloc. */
export function titleSizeClass(title = "", scale = "hero") {
  const n = title.length;
  const sizes =
    scale === "hero"
      ? ["text-5xl md:text-8xl", "text-4xl md:text-6xl", "text-3xl md:text-5xl", "text-2xl md:text-4xl"]
      : ["text-4xl md:text-6xl", "text-3xl md:text-5xl", "text-2xl md:text-4xl", "text-xl md:text-3xl"];
  if (n <= 14) return sizes[0];
  if (n <= 28) return sizes[1];
  if (n <= 48) return sizes[2];
  return sizes[3];
}

/** Évite qu'un titre démesuré ne déborde. */
export function clipTitle(title = "", max = 80) {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}
