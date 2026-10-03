import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Film, Layers, Trophy, Crown, CalendarDays, Infinity as InfinityIcon } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { getLeaderboard } from "@/api/leaderboard";
import { resolveAvatar } from "@/api/profile";
import { formatWatchTime } from "@/components/profile/StatsRow";
import { Avatar } from "@/components/ui/Avatar";
import RoleBadge from "@/components/profile/RoleBadge";
import SupporterBadge from "@/components/profile/SupporterBadge";

const nf = new Intl.NumberFormat("fr-FR");

/** `value(row)` = valeur affichée, `unit` = libellé sous le podium. */
const METRICS = [
  { key: "watch_time", label: "Temps de visionnage", shortLabel: "Temps", kana: "視聴時間", icon: Clock, value: (r) => formatWatchTime(r.totalWatchSeconds), unit: "de visionnage" },
  { key: "episodes", label: "Épisodes vus", shortLabel: "Épisodes", kana: "エピソード", icon: Film, value: (r) => nf.format(r.totalEpisodes), unit: "épisodes vus" },
  { key: "animes", label: "Animes suivis", shortLabel: "Animés", kana: "アニメ", icon: Layers, value: (r) => nf.format(r.totalAnimes), unit: "animes suivis" },
];

/** `week` = semaine calendaire en cours. */
const PERIODS = [
  { key: "week", label: "Cette semaine", icon: CalendarDays },
  { key: "all", label: "Depuis toujours", icon: InfinityIcon },
];

// Indépendantes de l'accent.
const MEDALS = {
  1: { ring: "#d6aa68", glow: "214 170 104", label: "1" },
  2: { ring: "#c3c8d2", glow: "195 200 210", label: "2" },
  3: { ring: "#c08457", glow: "192 132 87", label: "3" },
};

/** `place` ∈ {1,2,3} ; le premier est surélevé. */
function PodiumCard({ row, place, metric, onOpen }) {
  const m = MEDALS[place];
  const first = place === 1;
  return (
    <button
      onClick={() => onOpen(row)}
      className={`group relative flex flex-1 flex-col items-center rounded-xl border bg-surface/70 px-3 pb-4 pt-8 text-center backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 ${
        first ? "border-[#d6aa68]/40 shadow-glow sm:-translate-y-3" : "border-border/70"
      }`}
    >
      <span
        className="absolute -top-4 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full font-display text-sm font-extrabold text-black ring-4 ring-surface"
        style={{ backgroundColor: m.ring, boxShadow: `0 0 20px rgb(${m.glow} / 0.55)` }}
      >
        {first ? <Crown size={15} /> : m.label}
      </span>

      <div className="relative">
        <Avatar
          src={resolveAvatar(row)}
          name={row.username}
          className={`rounded-full ${first ? "h-20 w-20" : "h-16 w-16"}`}
          textClassName={first ? "text-2xl" : "text-xl"}
          style={{ boxShadow: `0 0 0 3px rgb(${m.glow} / 0.6), 0 8px 26px rgb(${m.glow} / 0.35)` }}
        />
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-1.5">
        <span className="truncate font-display text-base font-bold text-text">{row.username || "—"}</span>
        <SupporterBadge profile={row} />
      </div>
      {row.handle && <span className="mt-0.5 truncate text-xs text-muted">@{row.handle}</span>}

      <div className="mt-3 font-display text-xl font-extrabold tracking-tight tabular-nums text-primary">
        {metric.value(row)}
      </div>
      <div className="text-[0.65rem] uppercase tracking-kana text-muted">{metric.unit}</div>
    </button>
  );
}

/** Mobile : une ligne par membre. */
function MobilePodiumRow({ row, metric, onOpen }) {
  const medal = MEDALS[row.rank];
  const first = row.rank === 1;
  return (
    <button
      onClick={() => onOpen(row)}
      className={`relative flex w-full items-center gap-3 overflow-hidden rounded-xl border p-3 text-left active:scale-[0.99] ${
        first
          ? "border-[#d6aa68]/40 bg-[#d6aa68]/[0.07]"
          : "border-border/60 bg-surface/45"
      }`}
    >
      {first && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-3 -top-8 font-display text-[7rem] leading-none text-[#d6aa68]/[0.06]"
        >
          王
        </span>
      )}
      <span
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold text-black"
        style={{
          backgroundColor: medal.ring,
          boxShadow: `0 0 16px rgb(${medal.glow} / 0.4)`,
        }}
      >
        {first ? <Crown size={15} /> : medal.label}
      </span>
      <Avatar
        src={resolveAvatar(row)}
        name={row.username}
        className={`shrink-0 rounded-full ${first ? "h-14 w-14" : "h-12 w-12"}`}
        textClassName={first ? "text-lg" : "text-base"}
        style={{ boxShadow: `0 0 0 2px rgb(${medal.glow} / 0.55)` }}
      />
      <div className="relative min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-display text-sm font-bold text-text">
            {row.username || "—"}
          </span>
          <SupporterBadge profile={row} />
        </div>
        {row.handle && <span className="mt-0.5 block truncate text-xs text-muted">@{row.handle}</span>}
      </div>
      <div className="relative max-w-[7rem] shrink-0 text-right">
        <div className="font-display text-base font-extrabold tabular-nums text-primary">
          {metric.value(row)}
        </div>
        <div className="truncate text-[0.55rem] uppercase tracking-[0.1em] text-muted">
          {metric.unit}
        </div>
      </div>
    </button>
  );
}

function RankRow({ row, metric, onOpen, isSelf }) {
  return (
    <button
      onClick={() => onOpen(row)}
      className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors sm:gap-4 sm:px-4 ${
        isSelf
          ? "border-primary/50 bg-primary/[0.06]"
          : "border-border/60 bg-surface/40 hover:border-white/20 hover:bg-surface/70"
      }`}
    >
      <span className="w-7 shrink-0 text-center font-display text-sm font-bold tabular-nums text-muted">
        {row.rank}
      </span>
      <Avatar
        src={resolveAvatar(row)}
        name={row.username}
        className="h-9 w-9 shrink-0 rounded-full"
        textClassName="text-xs"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-text">{row.username || "—"}</span>
          <span className="hidden sm:inline-flex"><RoleBadge role={row.role} /></span>
          <SupporterBadge profile={row} />
          {isSelf && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-primary">
              Toi
            </span>
          )}
        </div>
        {row.handle && <span className="truncate text-xs text-muted">@{row.handle}</span>}
      </div>
      <span className="shrink-0 font-display text-base font-bold tabular-nums text-primary">
        {metric.value(row)}
      </span>
    </button>
  );
}

export default function LeaderboardPage() {
  const me = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [metricKey, setMetricKey] = useState("watch_time");
  const [periodKey, setPeriodKey] = useState("week");
  const [rows, setRows] = useState(null); // null = chargement
  const [error, setError] = useState(null);

  const metric = METRICS.find((m) => m.key === metricKey);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    getLeaderboard(metricKey, 50, periodKey)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e.message || "Chargement impossible."));
    return () => {
      alive = false;
    };
  }, [metricKey, periodKey]);

  const openProfile = (row) => row.handle && navigate(`/u/${row.handle}`);

  const podium = rows?.slice(0, 3) || [];
  const rest = rows?.slice(3) || [];
  // 2 — 1 — 3.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);

  return (
    <div className="animate-fade-in relative mx-auto max-w-4xl px-4 pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:py-10">
      <span className="pointer-events-none absolute -right-4 top-2 select-none font-display text-[13rem] font-extrabold leading-none text-white/[0.03]">
        位
      </span>

      <div className="relative md:text-center">
        <div className="flex items-center gap-3 md:justify-center">
          <span className="font-display text-lg font-medium text-muted/45">ランキング</span>
          <span className="h-px w-8 bg-primary/70" />
        </div>
        <h1 className="mt-3 font-display text-4xl font-extrabold text-glow md:flex md:items-center md:justify-center md:gap-2.5">
          <Trophy size={30} className="hidden text-primary md:block" /> Classement
        </h1>
        <p className="mx-auto mt-3 hidden max-w-lg text-sm leading-relaxed text-muted md:block">
          Les membres les plus assidus de la communauté. Clique sur un profil pour le visiter.
        </p>
      </div>

      <div className="relative mt-7">
        <div className="mx-auto grid max-w-xl grid-cols-3 border-b border-white/[0.1]">
          {METRICS.map((m) => {
            const on = m.key === metricKey;
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                onClick={() => setMetricKey(m.key)}
                className={`relative flex min-w-0 items-center justify-center gap-1.5 px-1 pb-3 pt-1 text-xs font-semibold transition-colors sm:text-sm ${
                  on ? "text-text" : "text-muted/65 hover:text-muted"
                }`}
              >
                {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
                <Icon size={14} />
                <span className="truncate sm:hidden">{m.shortLabel}</span>
                <span className="hidden truncate sm:inline">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative mt-4 flex justify-center">
        <div className="grid w-full max-w-sm grid-cols-2 rounded-xl border border-border/70 bg-surface/40 p-1 text-xs">
          {PERIODS.map((p) => {
            const on = p.key === periodKey;
            const Icon = p.icon;
            return (
              <button
                key={p.key}
                onClick={() => setPeriodKey(p.key)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 font-semibold transition-colors ${
                  on ? "bg-white/10 text-text" : "text-muted hover:text-text"
                }`}
              >
                <Icon size={13} />
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative mt-9">
        {error ? (
          <p className="rounded-lg border border-border/60 bg-surface/40 py-16 text-center text-sm text-primary">
            {error}
          </p>
        ) : rows === null ? (
          <div className="space-y-3">
            <div className="space-y-2 md:hidden">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[74px] skeleton rounded-xl" />
              ))}
            </div>
            <div className="hidden items-end justify-center gap-3 md:flex">
              {[16, 24, 16].map((h, i) => (
                <div key={i} className={`skeleton flex-1 rounded-xl`} style={{ height: `${h * 6}px` }} />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 skeleton rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-surface/40 py-16 text-center text-sm text-muted">
            {periodKey === "week"
              ? "Personne n'a encore été actif cette semaine."
              : "Aucun membre au classement pour l'instant."}
          </p>
        ) : (
          <>
            {podium.length > 0 && (
              <>
                <div className="mb-5 space-y-2 md:hidden">
                  {podium.map((row) => (
                    <MobilePodiumRow
                      key={row.id}
                      row={row}
                      metric={metric}
                      onOpen={openProfile}
                    />
                  ))}
                </div>
                <div className="mb-6 hidden items-stretch justify-center gap-4 md:flex">
                  {podiumOrder.map((row) => (
                    <PodiumCard
                      key={row.id}
                      row={row}
                      place={row.rank}
                      metric={metric}
                      onOpen={openProfile}
                    />
                  ))}
                </div>
              </>
            )}

            {rest.length > 0 && (
              <div className="space-y-2">
                {rest.map((row) => (
                  <RankRow
                    key={row.id}
                    row={row}
                    metric={metric}
                    onOpen={openProfile}
                    isSelf={row.id === me?.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
