import { Sparkles, Crown } from "lucide-react";
import { premiumTier } from "@/lib/premium";

// Figé : même teinte quel que soit le thème de profil.
const GOLD = "214 170 104";

/** Seulement si l'abonnement est actif : couronne pour Ultimate, étincelle pour Nartya +. */
export default function SupporterBadge({ profile, size = "sm", className = "" }) {
  const tier = premiumTier(profile);
  if (!tier) return null;

  const isUltimate = tier === "ultimate";
  const Icon = isUltimate ? Crown : Sparkles;
  const label = isUltimate ? "Ultimate" : "Supporter";
  const dims = size === "lg" ? "gap-1.5 px-2 py-1 text-[0.7rem]" : "gap-1 px-1.5 py-0.5 text-[0.6rem]";

  return (
    <span
      title={isUltimate ? "Abonné Ultimate" : "Abonné Nartya +"}
      style={{
        color: `rgb(${GOLD})`,
        backgroundColor: `rgb(${GOLD} / 0.12)`,
        borderColor: `rgb(${GOLD} / 0.35)`,
      }}
      className={`inline-flex items-center rounded-[5px] border font-semibold uppercase tracking-kana ${dims} ${className}`}
    >
      <Icon size={size === "lg" ? 12 : 10} strokeWidth={2.5} />
      {label}
    </span>
  );
}
