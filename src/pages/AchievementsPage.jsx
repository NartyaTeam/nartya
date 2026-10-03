import { useMemo, useState } from "react";
import { ArrowLeft, Check, LockKeyhole, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";
import { getAchievements } from "@/api/achievements";
import { useCachedResource } from "@/hooks/useCachedResource";
import {
  ACHIEVEMENT_FAMILIES,
  formatAchievementValue,
  tierId,
} from "@/data/achievements";

const FILTERS = [
  ["all", "Tous"],
  ["unlocked", "Débloqués"],
  ["in_progress", "En cours"],
  ["locked", "Cachés"],
];

// Les trois paliers de la famille suivie.
const HERO_FAMILY = ACHIEVEMENT_FAMILIES.find((f) => f.id === "watch_time");
const [HERO_T1, HERO_T2, HERO_T3] = HERO_FAMILY.tiers;

function metricFor(family, data) {
  return Number(data?.[family.metric] || 0);
}

/** `currentColor` : teinte et opacité viennent du className. */
function ToriiMark({ className }) {
  return (
    <svg viewBox="0 0 320 420" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <rect x="8" y="38" width="304" height="20" rx="10" fill="currentColor" />
      <rect x="26" y="66" width="268" height="10" rx="5" fill="currentColor" />
      <rect x="58" y="150" width="204" height="14" rx="7" fill="currentColor" />
      <rect x="66" y="86" width="26" height="340" rx="8" fill="currentColor" />
      <rect x="228" y="86" width="26" height="340" rx="8" fill="currentColor" />
    </svg>
  );
}

function HeroFigure({ value, label, tone = "text" }) {
  return (
    <div>
      <div
        className={`font-display text-2xl font-extrabold leading-none tabular-nums drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)] sm:text-3xl ${
          tone === "accent" ? "text-accent" : tone === "primary" ? "text-primary" : "text-text"
        }`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[0.65rem] font-bold uppercase tracking-kana text-text/60">{label}</div>
    </div>
  );
}

/** Attribution serveur : un palier obtenu le reste. */
function TierBadge({ family, tier, unlocked }) {
  return (
    <div className="group/tier flex min-w-0 flex-1 flex-col items-center">
      <div
        className={`relative aspect-square w-full max-w-[96px] transition duration-300 sm:max-w-[112px] ${
          unlocked ? "drop-shadow-[0_0_16px_rgb(var(--primary)/0.3)]" : "grayscale opacity-[0.28]"
        }`}
      >
        <img
          src={tier.badge}
          alt=""
          className={`h-full w-full object-contain transition-transform duration-300 ${
            unlocked ? "group-hover/tier:scale-105" : ""
          }`}
        />
        {!unlocked && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white/55 backdrop-blur">
              <LockKeyhole size={12} />
            </span>
          </span>
        )}
        {unlocked && (
          <span className="absolute right-1 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg">
            <Check size={11} strokeWidth={3} />
          </span>
        )}
      </div>
      <p className={`mt-1 min-h-8 line-clamp-2 text-center font-display text-[0.7rem] font-bold leading-4 sm:min-h-0 sm:truncate sm:text-xs ${unlocked ? "text-text" : "text-muted/55"}`}>
        {tier.name}
      </p>
      <p className="mt-0.5 text-[0.66rem] tabular-nums text-muted/55">
        {formatAchievementValue(family, tier.threshold)}
      </p>
    </div>
  );
}

function AchievementCard({ family, value, unlockedIds }) {
  const unlocked = family.tiers.filter((tier) => unlockedIds.has(tierId(family.id, tier.level)));
  // Sur le compteur, pas sur les badges : l'attribution n'arrive qu'au battement suivant.
  const next = family.tiers.find((tier) => value < tier.threshold) || null;
  const previous = family.tiers.reduce(
    (acc, tier) => (value >= tier.threshold ? tier.threshold : acc),
    0
  );
  const progress = next
    ? Math.max(0, Math.min(100, ((value - previous) / (next.threshold - previous)) * 100))
    : 100;

  return (
    <article className="group relative overflow-hidden rounded-[1.15rem] border border-primary/25 bg-surface/45 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow sm:rounded-xl sm:bg-surface/55">
      <header className="relative flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <span className="mt-1 h-7 w-[3px] shrink-0 rounded-full bg-primary shadow-[0_0_12px_rgb(var(--primary)/0.7)]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-display text-base font-bold tracking-tight text-text">{family.name}</h2>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.15em] text-primary">
              {unlocked.length}/{family.tiers.length}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">{family.description}</p>
        </div>
      </header>

      <div className="relative px-3.5 pb-4 pt-3 sm:px-4 sm:pb-5">
        <div className="flex items-start justify-between gap-2">
          {family.tiers.map((tier) => (
            <TierBadge
              key={tier.level}
              family={family}
              tier={tier}
              unlocked={unlockedIds.has(tierId(family.id, tier.level))}
            />
          ))}
        </div>
        <div className="mt-3 border-t border-border/45 pt-3">
          <div className="mb-2 flex items-end justify-between gap-3">
            {next ? (
              <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted sm:text-[0.65rem] sm:tracking-[0.15em]">
                Prochain · {formatAchievementValue(family, next.threshold)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-amber-300">
                <Sparkles size={12} /> Famille complétée
              </span>
            )}
            <span className="shrink-0 font-display text-xs font-bold tabular-nums text-text">
              {formatAchievementValue(family, value)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg sm:h-1">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/65 to-primary shadow-[0_0_9px_rgb(var(--primary)/0.55)] transition-[width] duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AchievementsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [filter, setFilter] = useState("all");
  const { data, loading } = useCachedResource(
    user?.id ? `achievements:${user.id}` : null,
    getAchievements,
    2 * 60 * 1000
  );
  const metrics = useMemo(() => {
    const unlockedIds = new Set(Object.keys(data?.unlocked || {}));
    return ACHIEVEMENT_FAMILIES.map((family) => ({
      family,
      value: metricFor(family, data),
      unlockedIds,
      count: family.tiers.filter((tier) => unlockedIds.has(tierId(family.id, tier.level))).length,
    }));
  }, [data]);
  const unlockedTotal = metrics.reduce((sum, item) => sum + item.count, 0);
  const total = ACHIEVEMENT_FAMILIES.reduce((sum, family) => sum + family.tiers.length, 0);
  const completed = metrics.filter((item) => item.count === item.family.tiers.length).length;
  const visible = metrics.filter((item) => {
    if (filter === "unlocked") return item.count > 0;
    if (filter === "in_progress") return item.count < item.family.tiers.length;
    if (filter === "locked") return item.count === 0;
    return true;
  });
  const percent = total ? Math.round((unlockedTotal / total) * 100) : 0;

  return (
    <div className="animate-fade-in pb-24 md:pb-16">
      <section className="relative h-[350px] w-full overflow-hidden sm:h-[400px]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.24] via-bg to-bg" />
        <div className="absolute inset-0 bg-[radial-gradient(62%_70%_at_16%_10%,rgb(var(--primary)/0.32),transparent_68%)]" />
        <ToriiMark className="pointer-events-none absolute -right-20 bottom-0 h-[118%] w-auto text-primary/[0.12] sm:right-14 sm:h-[128%] md:right-24" />

        <img
          src={HERO_T3.badge}
          alt=""
          className="pointer-events-none absolute -right-6 bottom-5 h-[152px] w-[152px] object-contain opacity-40 drop-shadow-[0_12px_28px_rgb(var(--primary)/0.45)] sm:hidden"
        />

        {/* ≤ 190 px : jamais au-delà de la résolution source (512 px). */}
        <div className="pointer-events-none absolute bottom-0 right-2 hidden items-end gap-1 sm:flex md:right-10 lg:right-20">
          <img
            src={HERO_T1.badge}
            alt=""
            className="mb-4 h-[104px] w-[104px] -rotate-6 object-contain opacity-75 drop-shadow-[0_10px_22px_rgba(0,0,0,0.55)]"
          />
          <img
            src={HERO_T3.badge}
            alt=""
            className="h-[188px] w-[188px] object-contain drop-shadow-[0_16px_34px_rgb(var(--primary)/0.4)]"
          />
          <img
            src={HERO_T2.badge}
            alt=""
            className="mb-8 h-[104px] w-[104px] rotate-6 object-contain opacity-75 drop-shadow-[0_10px_22px_rgba(0,0,0,0.55)]"
          />
        </div>

        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/50 to-transparent sm:via-bg/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent" />

        <div className="relative z-10 flex h-full flex-col justify-between px-4 pb-7 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 sm:py-6 md:px-14 md:py-8">
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="hidden w-fit items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/85 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white md:inline-flex"
          >
            <ArrowLeft size={14} /> Retour au profil
          </button>

          <div className="max-w-lg">
            <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary sm:hidden">
              Collection personnelle
            </p>
            <div className="mb-2.5 hidden items-center gap-2 text-primary sm:inline-flex">
              <Trophy size={16} />
              <span className="eyebrow">Collection personnelle</span>
            </div>
            <h1 className="font-display text-[2.1rem] font-extrabold leading-[1.05] tracking-tight text-glow sm:text-5xl">
              Tes succès
            </h1>
            <p className="mt-2.5 max-w-[18rem] text-[0.78rem] leading-5 text-text/65 sm:mt-3 sm:max-w-md sm:text-sm sm:leading-6">
              Chaque épisode laisse une trace. Explore, termine des saisons et fais évoluer
              tes emblèmes de l'encre noire jusqu'à l'or.
            </p>

            <div className="mt-6 hidden flex-wrap items-end gap-x-8 gap-y-4 sm:flex">
              <HeroFigure value={loading ? "—" : `${percent}%`} label="Progression" tone="primary" />
              <HeroFigure value={loading ? "—" : `${unlockedTotal}/${total}`} label="Débloqués" />
              <HeroFigure value={`${completed}/${ACHIEVEMENT_FAMILIES.length}`} label="Familles complètes" tone="accent" />
            </div>

            <div className="mt-5 w-[min(18rem,78vw)] sm:hidden">
              <div className="flex items-end justify-between">
                <div>
                  <span className="font-display text-2xl font-extrabold tabular-nums text-primary">
                    {loading ? "—" : `${percent}%`}
                  </span>
                  <span className="ml-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-text/50">
                    accompli
                  </span>
                </div>
                <span className="pb-1 text-[0.68rem] font-semibold tabular-nums text-text/60">
                  {loading ? "—" : `${unlockedTotal}/${total}`} emblèmes
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary shadow-[0_0_10px_rgb(var(--primary)/0.6)] transition-[width] duration-700"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            <p className="mt-3 inline-flex items-center gap-1.5 text-[0.68rem] text-text/50 sm:mt-4 sm:text-xs sm:text-text/55">
              <ShieldCheck size={13} className="text-primary" /> Seul le temps réellement regardé compte.
            </p>
          </div>
        </div>
      </section>

      <div className="px-4 py-6 sm:px-6 sm:py-8 md:px-14">
        <div className="flex items-center justify-between gap-3">
          <div className="no-scrollbar -mx-4 flex min-w-0 flex-1 overflow-x-auto px-4 sm:mx-0 sm:inline-flex sm:flex-none sm:rounded-full sm:border sm:border-border sm:bg-surface/60 sm:p-1">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`shrink-0 border-b-2 px-3 py-2 text-xs font-bold transition-colors sm:rounded-full sm:border-b-0 sm:px-3.5 sm:py-1.5 ${
                  filter === id
                    ? "border-primary text-primary sm:bg-primary sm:text-primary-fg"
                    : "border-transparent text-muted hover:text-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="hidden shrink-0 text-xs text-muted/65 sm:block">{visible.length} famille{visible.length > 1 ? "s" : ""}</p>
        </div>

        {visible.length ? (
          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            {visible.map(({ family, value, unlockedIds }) => (
              <AchievementCard key={family.id} family={family} value={value} unlockedIds={unlockedIds} />
            ))}
          </section>
        ) : (
          <section className="mt-5 flex flex-col items-center rounded-xl border border-border/50 bg-surface/25 px-6 py-14 text-center">
            <Trophy size={28} className="text-muted/35" />
            <h2 className="mt-3 font-display text-base font-bold text-text">Rien ici pour le moment</h2>
            <p className="mt-1 text-xs text-muted">Continue à regarder des animes : tes prochains emblèmes apparaîtront ici.</p>
          </section>
        )}
      </div>
    </div>
  );
}
