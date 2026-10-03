import { Trophy } from "lucide-react";

/** De « #1 » à « #10 » uniquement. */
const PODIUM = {
  1: "227 179 65",
  2: "203 213 225",
  3: "205 127 50",
};
const DEFAULT_RGB = "255 74 45"; // 4e à 10e place

export default function RankBadge({ rank, size = "sm" }) {
  if (!rank || rank > 10) return null;
  const rgb = PODIUM[rank] || DEFAULT_RGB;
  const dims = size === "lg" ? "gap-1.5 px-2 py-1 text-[0.7rem]" : "gap-1 px-1.5 py-0.5 text-[0.6rem]";
  return (
    <span
      title={`#${rank} au classement général (temps de visionnage)`}
      style={{
        color: `rgb(${rgb})`,
        backgroundColor: `rgb(${rgb} / 0.10)`,
        borderColor: `rgb(${rgb} / 0.35)`,
      }}
      className={`inline-flex items-center rounded-[5px] border font-bold tabular-nums ${dims}`}
    >
      {rank <= 3 && <Trophy size={size === "lg" ? 12 : 10} strokeWidth={2.5} />}
      #{rank}
    </span>
  );
}
