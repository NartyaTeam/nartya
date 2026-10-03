import { Check, Gauge, Sparkles } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { THEME_PRESETS, tripletToCss } from "@/utils/theme";
import { Section, SettingRow, Toggle } from "./SettingsLayout";

function ThemeChoice({ id, palette, selected, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(id)}
      className={`relative min-h-[72px] overflow-hidden rounded-xl border p-2.5 text-left transition-colors md:min-h-[82px] md:rounded-[5px] md:p-3 ${
        selected
          ? "border-primary/65 bg-surface-2/80"
          : "border-border/70 bg-bg/25 hover:border-border hover:bg-surface-2/55"
      }`}
    >
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: tripletToCss(palette.primary) }}
      />
      <span
        className="mt-1 block h-6 w-6 rounded-full md:h-7 md:w-7 md:rounded-[4px]"
        style={{ backgroundColor: tripletToCss(palette.primary) }}
      />
      <span className="mt-2 block truncate text-[0.68rem] font-bold text-text/80 md:mt-2.5 md:text-xs">{palette.label}</span>
      {selected && (
        <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-fg md:right-3 md:top-3 md:rounded-[4px]">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

export default function AppearanceSection({ number }) {
  const themePreset = useSettingsStore((s) => s.themePreset);
  const customColor = useSettingsStore((s) => s.customColor);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const setSetting = useSettingsStore((s) => s.setSetting);

  return (
    <Section
      id="appearance"
      number={number}
      eyebrow="Interface"
      title="Apparence"
      description="Choisis la couleur d'accent et le niveau d'animation de l'application."
    >
      <div
        role="radiogroup"
        aria-label="Couleur d'accent"
        className="grid grid-cols-3 gap-2 py-4 md:py-6 xl:grid-cols-6"
      >
        {Object.entries(THEME_PRESETS).map(([key, palette]) => (
          <ThemeChoice
            key={key}
            id={key}
            palette={palette}
            selected={themePreset === key}
            onSelect={(value) => setSetting("themePreset", value)}
          />
        ))}
      </div>

      <SettingRow
        icon={Sparkles}
        label="Couleur personnalisée"
        description="Choisis une teinte d'accent personnalisée."
      >
        <div className="flex items-center gap-3">
          <label
            title="Couleur personnalisée"
            className={`relative flex h-10 w-14 cursor-pointer items-center justify-center rounded-[5px] border ${
              themePreset === "custom" ? "border-primary/60" : "border-border"
            }`}
            style={{ backgroundColor: customColor }}
          >
            <input
              type="color"
              value={customColor}
              onChange={(e) => {
                setSetting("customColor", e.target.value);
                setSetting("themePreset", "custom");
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <button
            type="button"
            onClick={() => setSetting("themePreset", "custom")}
            className={`h-10 rounded-[5px] border px-3 font-mono text-xs uppercase ${
              themePreset === "custom"
                ? "border-primary/45 text-primary"
                : "border-border text-muted"
            }`}
          >
            {customColor}
          </button>
        </div>
      </SettingRow>

      <SettingRow
        icon={Gauge}
        label="Mode performance"
        description="Allège les effets visuels pour améliorer la fluidité."
        details="Désactive le grain de pellicule et les animations. Recommandé sur les machines modestes."
        inlineControl
      >
        <Toggle
          label="Mode performance"
          checked={reduceMotion}
          onChange={(v) => setSetting("reduceMotion", v)}
        />
      </SettingRow>
    </Section>
  );
}
