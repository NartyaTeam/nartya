import { BookOpen, Play } from "lucide-react";
import SegmentedControl from "@/components/ui/SegmentedControl";

/** `media_type` des favoris et des listes ; les lignes anciennes n'en ont pas : anime. */
export const mediaOf = (row) => (row?.media_type === "manga" ? "manga" : "anime");

const TABS = [
  { value: "anime", label: "Animes", Icon: Play },
  { value: "manga", label: "Mangas", Icon: BookOpen },
];

/** Onglets Animes / Mangas des favoris, des listes et de l'historique. */
export default function MediaTabs({ value, onChange, counts, className = "" }) {
  const options = counts ? TABS.map((tab) => ({ ...tab, count: counts[tab.value] ?? 0 })) : TABS;
  return (
    <SegmentedControl
      label="Type de contenu"
      options={options}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}
