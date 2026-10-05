import { useNavigate } from "react-router-dom";
import { ACHIEVEMENT_FAMILIES, ACHIEVEMENT_TIER_LOOKS, formatAchievementValue } from "@/data/achievements";

const SUFFIX = {
  night_owl: "après minuit",
  marathon: "en un jour",
  watch_time: "vérifiées",
  completion: "terminées",
};

/** Disposition « Colonne », sur les mêmes données que le bloc compact. */
export default function AchievementsList({ stats, isSelf }) {
  const navigate = useNavigate();
  const tiers = stats?.achievements || {};
  const pinned = ACHIEVEMENT_FAMILIES.map((family) => {
    const level = Number(tiers[family.id] || 0);
    return level > 0 ? { family, tier: family.tiers[level - 1] } : null;
  }).filter(Boolean);
  const tierCount = pinned.reduce((n, { tier }) => n + tier.level, 0);
  const countLabel = `${pinned.length} famille${pinned.length > 1 ? "s" : ""} · ${tierCount} palier${
    tierCount > 1 ? "s" : ""
  }`;

  return (
    <div>
      <div className="flex items-baseline justify-between border-b-2 border-primary pb-2.5">
        <h3 className="section-title !text-xl">Succès</h3>
        {isSelf ? (
          <button
            type="button"
            onClick={() => navigate("/profile/achievements")}
            className="shrink-0 whitespace-nowrap text-[11px] text-muted transition-colors hover:text-primary"
          >
            {countLabel}
          </button>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">{countLabel}</span>
        )}
      </div>
      {pinned.length ? (
        <div className="mt-4 flex flex-col gap-3.5">
          {pinned.map(({ family, tier }) => (
            <div key={family.id} className="flex items-center gap-3.5">
              <img src={tier.badge} alt="" className="h-[58px] w-[58px] shrink-0 object-contain" />
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-text">{tier.name}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {family.name} · palier {ACHIEVEMENT_TIER_LOOKS[tier.level]?.numeral} ·{" "}
                  {formatAchievementValue(family, tier.threshold)} {SUFFIX[family.id]}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 font-display text-sm font-medium leading-6 text-muted/70">
          {isSelf ? "Ton premier emblème t'attend." : "Aucun emblème pour l'instant."}
        </p>
      )}
    </div>
  );
}
