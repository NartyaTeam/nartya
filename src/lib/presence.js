import { formatFrenchDate } from "@/api/anizip";

/** `null` si inconnue ou masquée. */
export function presenceFrom(ts) {
  if (!ts) return null;
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));

  if (mins < 5) return { online: true, label: "En ligne" };
  if (mins < 60) return { online: false, label: `Actif il y a ${mins} min` };

  const hours = Math.floor(mins / 60);
  if (hours < 24) return { online: false, label: `Actif il y a ${hours} h` };

  const days = Math.floor(hours / 24);
  if (days < 7) return { online: false, label: `Actif il y a ${days} j` };

  return { online: false, label: `Vu le ${formatFrenchDate(ts)}` };
}
