/**
 * Ambiance selon l'heure (Paramètres → Apparence) : le fond de l'app suit la journée, de la
 * lumière claire du matin aux lanternes de la nuit (cf. TimeAmbience). L'encre du fond ne
 * change pas, seule la lumière qui l'éclaire et ce qui flotte devant.
 */
export const TIME_PHASES = {
  // 6 h – 11 h : matin clair, le soleil se lève à gauche.
  morning:
    "radial-gradient(90% 60% at 8% -12%, rgb(255 214 170 / 0.34), transparent 62%), radial-gradient(70% 45% at 80% -5%, rgb(255 244 222 / 0.14), transparent 62%), linear-gradient(180deg, rgb(255 236 214 / 0.07), transparent 55%)",
  // 11 h – 17 h : après-midi d'automne, lumière ambrée.
  afternoon:
    "radial-gradient(85% 55% at 88% -12%, rgb(255 152 62 / 0.30), transparent 60%), radial-gradient(70% 50% at 0% 105%, rgb(190 82 34 / 0.18), transparent 62%), linear-gradient(180deg, rgb(255 190 120 / 0.05), transparent 50%)",
  // 17 h – 21 h : coucher de soleil, orange vers magenta, horizon encore allumé.
  evening:
    "radial-gradient(85% 55% at 92% -12%, rgb(255 112 58 / 0.36), transparent 60%), radial-gradient(70% 45% at 15% -10%, rgb(206 64 134 / 0.22), transparent 65%), radial-gradient(120% 40% at 50% 115%, rgb(255 120 80 / 0.12), transparent 60%)",
  // 21 h – 6 h : nuit bleutée, éclairée par les lanternes.
  night:
    "radial-gradient(85% 55% at 70% -12%, rgb(70 92 214 / 0.30), transparent 60%), radial-gradient(60% 45% at 8% 0%, rgb(132 84 204 / 0.16), transparent 65%), radial-gradient(90% 35% at 50% -5%, rgb(255 150 70 / 0.08), transparent 60%)",
};

export function phaseForHour(hour) {
  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
