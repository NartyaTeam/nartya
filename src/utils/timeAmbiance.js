/**
 * Ambiance selon l'heure (Paramètres → Apparence) : la lueur de fond de l'app suit la
 * journée. L'encre du fond ne change pas, seule la lumière qui l'éclaire.
 */
export const TIME_PHASES = {
  // 6 h – 9 h : aube rosée, à gauche comme le soleil qui se lève.
  dawn: "radial-gradient(85% 55% at 10% -10%, rgb(255 168 150 / 0.24), transparent 60%), radial-gradient(60% 40% at 90% 0%, rgb(255 210 170 / 0.08), transparent 65%)",
  // 9 h – 17 h : ciel clair en haut.
  day: "radial-gradient(90% 55% at 50% -15%, rgb(150 200 255 / 0.22), transparent 60%), radial-gradient(50% 35% at 85% -5%, rgb(255 236 190 / 0.14), transparent 60%)",
  // 17 h – 21 h : coucher de soleil, orange vers magenta.
  sunset: "radial-gradient(85% 55% at 90% -10%, rgb(255 128 64 / 0.28), transparent 60%), radial-gradient(70% 45% at 20% -10%, rgb(214 80 140 / 0.14), transparent 65%)",
  // 21 h – 6 h : nuit bleutée.
  night: "radial-gradient(85% 55% at 70% -10%, rgb(90 110 220 / 0.24), transparent 60%), radial-gradient(55% 40% at 10% 0%, rgb(140 90 200 / 0.10), transparent 65%)",
};

export function phaseForHour(hour) {
  if (hour >= 6 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 17) return "day";
  if (hour >= 17 && hour < 21) return "sunset";
  return "night";
}
