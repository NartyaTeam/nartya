import { Clock, Film, Layers } from "lucide-react";

/** « 12 h 34 » / « 34 min » / « 0 min » */
export function formatWatchTime(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")}`;
  return `${m} min`;
}

function Stat({ icon: Icon, value, label, mobileLabel }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-md bg-surface-2/50 px-2 py-3 text-center sm:flex-row sm:gap-3 sm:px-4 sm:py-3.5 sm:text-left">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-primary ring-1 ring-primary/25 sm:h-9 sm:w-9 sm:rounded-md">
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <div className="font-display text-base font-bold leading-none tracking-tight tabular-nums sm:text-xl">
          {value}
        </div>
        <div className="mt-1 truncate text-[0.58rem] uppercase tracking-[0.12em] text-muted sm:text-[0.65rem] sm:tracking-kana">
          <span className="sm:hidden">{mobileLabel || label}</span>
          <span className="hidden sm:inline">{label}</span>
        </div>
      </div>
    </div>
  );
}

export default function StatsRow({ stats }) {
  return (
    <section className="flex gap-2 p-3 sm:gap-2.5 sm:p-4">
      <Stat
        icon={Clock}
        value={stats ? formatWatchTime(stats.totalWatchSeconds) : "—"}
        label="Visionnage"
        mobileLabel="Temps"
      />
      <Stat icon={Film} value={stats ? stats.totalEpisodes : "—"} label="Épisodes vus" mobileLabel="Épisodes" />
      <Stat icon={Layers} value={stats ? stats.totalAnimes : "—"} label="Animes suivis" mobileLabel="Animés" />
    </section>
  );
}
