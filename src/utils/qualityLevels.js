/** À défaut, le niveau le plus bas disponible. */
export function pickLevelForHeight(levels, targetHeight) {
  if (!levels || levels.length === 0) return -1;
  let best = -1;
  let bestHeight = -1;
  let lowest = 0;
  let lowestHeight = Infinity;

  levels.forEach((level, index) => {
    const height = level.height || 0;
    if (height <= targetHeight && height > bestHeight) {
      bestHeight = height;
      best = index;
    }
    if (height < lowestHeight) {
      lowestHeight = height;
      lowest = index;
    }
  });

  return best !== -1 ? best : lowest;
}

export function pickHighestLevel(levels) {
  if (!levels || levels.length === 0) return -1;
  return levels.reduce((best, level, index) => {
    if (best < 0) return index;
    const current = levels[best];
    const height = level.height || 0;
    const currentHeight = current.height || 0;
    if (height !== currentHeight) return height > currentHeight ? index : best;
    return (level.bitrate || 0) > (current.bitrate || 0) ? index : best;
  }, -1);
}

export function pickFixedQualityLevel(levels, preference = "max") {
  if (preference === "max") return pickHighestLevel(levels);
  const target = parseInt(preference, 10);
  return Number.isFinite(target) ? pickLevelForHeight(levels, target) : pickHighestLevel(levels);
}
