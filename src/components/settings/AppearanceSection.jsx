import { CloudRain, Check, Gauge, Languages, Sparkles, Sunset } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { isPremiumActive } from "@/lib/premium";
import { THEME_PRESETS, tripletToCss } from "@/utils/theme";
import { Select } from "@/components/ui/Select";
import { Section, SettingRow, Toggle } from "./SettingsLayout";

const TITLE_LANGUAGE_OPTIONS = [
  { value: "default", label: "D'origine" },
  { value: "romaji", label: "Romaji" },
  { value: "english", label: "Anglais" },
];

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
  const titleLanguage = useSettingsStore((s) => s.titleLanguage);
  const timeAmbiance = useSettingsStore((s) => s.timeAmbiance);
  const profileAmbienceEverywhere = useSettingsStore((s) => s.profileAmbienceEverywhere);
  // Le réglage n'a de sens que pour qui a choisi une ambiance de profil.
  const hasProfileAmbience = useAuthStore((s) => !!s.user?.ambient_theme && isPremiumActive(s.user));
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

      <SettingRow
        icon={Sunset}
        label="Ambiance selon l'heure"
        description="Le fond suit la journée : matin clair, après-midi d'automne, coucher de soleil, puis lanternes la nuit."
        details="Remplace la lueur aux couleurs du thème par une ambiance qui change avec l'heure de ton appareil. Les animations s'arrêtent en mode performance ou si tu réduis les animations."
        inlineControl
      >
        <Toggle
          label="Ambiance selon l'heure"
          checked={timeAmbiance}
          onChange={(v) => setSetting("timeAmbiance", v)}
        />
      </SettingRow>

      {hasProfileAmbience && (
        <SettingRow
          icon={CloudRain}
          label="Ambiance du profil partout"
          description="L'ambiance de ton profil (pluie, neige, pétales…) en fond de toute l'app."
          details="Elle n'apparaît ni pendant un épisode, ni pendant la lecture d'un scan, ni sur les pages de profil, qui ont déjà la leur. Désactivée en mode performance."
          inlineControl
        >
          <Toggle
            label="Ambiance du profil partout"
            checked={profileAmbienceEverywhere}
            onChange={(v) => setSetting("profileAmbienceEverywhere", v)}
          />
        </SettingRow>
      )}

      <SettingRow
        icon={Languages}
        label="Langue des titres"
        description="Titre affiché sur les cartes d'animes et de mangas."
        details="« D'origine » garde le titre du catalogue. Romaji et anglais viennent d'AniList : quand une œuvre n'en a pas, son titre d'origine est conservé."
      >
        <Select
          title="Langue des titres"
          value={titleLanguage}
          onValueChange={(v) => setSetting("titleLanguage", v)}
          align="end"
          className="min-w-[9rem]"
          options={TITLE_LANGUAGE_OPTIONS}
        />
      </SettingRow>
    </Section>
  );
}
