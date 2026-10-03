import {
  Clapperboard,
  FastForward,
  Gauge,
  Languages,
  ListVideo,
  MonitorPlay,
  Radio,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { Select } from "@/components/ui/Select";
import { Flag, getLanguageLabel } from "@/components/ui/Flag";
import { platform } from "@/platform";
import { SELECTABLE_SOURCE_KEYS, getSourceLabel } from "@/utils/videoSourceUtils";
import { Section, SettingRow, Toggle } from "./SettingsLayout";

const LANGUAGE_OPTIONS = ["vostfr", "vf"];

const RESUME_LIMIT_OPTIONS = [5, 10, 15, 20, 30].map((n) => ({ value: String(n), label: String(n) }));

const PLAYBACK_QUALITY_OPTIONS = [
  { value: "auto", label: "Automatique" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
  { value: "360", label: "360p" },
];

const ANIME4K_QUALITY_OPTIONS = [
  { value: "max", label: "Maximale disponible" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
  { value: "360", label: "360p" },
];

export default function PlaybackSection({ number }) {
  const defaultLanguage = useSettingsStore((s) => s.defaultLanguage);
  const prioritySource = useSettingsStore((s) => s.prioritySource);
  const playbackQuality = useSettingsStore((s) => s.playbackQuality);
  const anime4kQuality = useSettingsStore((s) => s.anime4kQuality);
  const autoSkip = useSettingsStore((s) => s.autoSkip);
  const skipButtonEnabled = useSettingsStore((s) => s.skipButtonEnabled);
  const autoSkipOpEd = useSettingsStore((s) => s.autoSkipOpEd);
  const nartyaIntro = useSettingsStore((s) => s.nartyaIntro);
  const resumeLimit = useSettingsStore((s) => s.resumeLimit);
  const liteMode = useSettingsStore((s) => s.liteMode);
  const advancedPlayerControls = useSettingsStore((s) => s.advancedPlayerControls);
  const setSetting = useSettingsStore((s) => s.setSetting);

  return (
    <Section
      id="playback"
      number={number}
      eyebrow="Lecteur"
      title="Lecture"
      description="Définis la langue, la source et le comportement par défaut du lecteur."
    >
      <SettingRow
        icon={Languages}
        label="Langue par défaut"
        description="Langue choisie automatiquement lorsqu'elle est disponible."
      >
        <Select
          title="Langue par défaut"
          value={defaultLanguage}
          onValueChange={(v) => setSetting("defaultLanguage", v)}
          align="end"
          className="min-w-[9rem]"
          options={LANGUAGE_OPTIONS.map((lang) => ({
            value: lang,
            label: getLanguageLabel(lang),
            icon: <Flag lang={lang} size={14} />,
          }))}
        />
      </SettingRow>

      <SettingRow
        icon={Radio}
        label="Source prioritaire"
        description="Hébergeur essayé en premier lors de la lecture."
        details="Si cette source échoue, Nartya essaie automatiquement les autres hébergeurs disponibles."
      >
        <Select
          title="Source prioritaire"
          value={prioritySource}
          onValueChange={(v) => setSetting("prioritySource", v)}
          align="end"
          className="min-w-[9rem]"
          options={[
            { value: "auto", label: "Automatique" },
            ...SELECTABLE_SOURCE_KEYS.map((key) => ({
              value: key,
              label: getSourceLabel(key),
            })),
          ]}
        />
      </SettingRow>

      <SettingRow
        icon={SlidersHorizontal}
        label="Contrôles avancés du lecteur"
        description="Ajoute le choix de la source dans les réglages du lecteur."
        details="Masqué par défaut : la bascule automatique vers un autre hébergeur en cas d'échec reste active de toute façon, ce réglage ne sert qu'à en choisir un précis à la main."
        inlineControl
      >
        <Toggle
          label="Contrôles avancés du lecteur"
          checked={advancedPlayerControls}
          onChange={(v) => setSetting("advancedPlayerControls", v)}
        />
      </SettingRow>

      <SettingRow
        icon={MonitorPlay}
        label="Qualité de lecture"
        description="Qualité maximale utilisée pendant le streaming."
        details="En mode automatique, Nartya adapte la qualité au débit. Une limite plus basse peut réduire les coupures et soulager les machines modestes."
      >
        <Select
          title="Qualité de lecture"
          value={playbackQuality}
          onValueChange={(v) => setSetting("playbackQuality", v)}
          align="end"
          className="min-w-[9rem]"
          options={PLAYBACK_QUALITY_OPTIONS}
        />
      </SettingRow>

      {!platform.isMobile && (
        <SettingRow
          icon={Sparkles}
          label="Qualité source Anime4K"
          description="Qualité vidéo utilisée comme source pour l'upscale Anime4K."
          details="Anime4K verrouille cette qualité pendant la lecture. Si elle n'est pas disponible, Nartya choisit la meilleure variante inférieure."
        >
          <Select
            title="Qualité source Anime4K"
            value={anime4kQuality}
            onValueChange={(v) => setSetting("anime4kQuality", v)}
            align="end"
            className="min-w-[11rem]"
            options={ANIME4K_QUALITY_OPTIONS}
          />
        </SettingRow>
      )}

      <SettingRow
        icon={FastForward}
        label="Lecture automatique"
        description="Lance l'épisode suivant à la fin de la lecture."
        details="Un compte à rebours s'affiche avant le changement et peut être annulé."
        inlineControl
      >
        <Toggle
          label="Lecture automatique"
          checked={autoSkip}
          onChange={(v) => setSetting("autoSkip", v)}
        />
      </SettingRow>

      <SettingRow
        icon={SkipForward}
        label="Bouton « Passer l'intro / l'ending »"
        description="Affiche une pastille pendant le générique pour le sauter en un clic."
        details="Désactive uniquement le bouton de saut manuel — la lecture automatique de l'épisode suivant (ci-dessus) n'est pas concernée."
        inlineControl
      >
        <Toggle
          label="Bouton de saut du générique"
          checked={skipButtonEnabled}
          onChange={(v) => setSetting("skipButtonEnabled", v)}
        />
      </SettingRow>

      <SettingRow
        icon={Gauge}
        label="Autoskip intro / ending"
        description="Saute automatiquement le générique, sans clic — pour enchaîner les épisodes en marathon."
        details="Remplace le bouton manuel « Passer l'intro / l'ending » : le saut se fait tout seul dès que le générique commence, avec une petite notification à l'écran."
        inlineControl
      >
        <Toggle
          label="Autoskip intro / ending"
          checked={autoSkipOpEd}
          onChange={(v) => setSetting("autoSkipOpEd", v)}
        />
      </SettingRow>

      <SettingRow
        icon={Clapperboard}
        label="Intro Nartya"
        description="Courte animation Nartya à l'ouverture de l'app."
        details="Jouée pendant que l'app se charge. Passable d'un clic ou avec Échap."
        inlineControl
      >
        <Toggle
          label="Intro Nartya"
          checked={nartyaIntro}
          onChange={(v) => setSetting("nartyaIntro", v)}
        />
      </SettingRow>

      <SettingRow
        icon={ListVideo}
        label="Animes dans « Reprendre »"
        description="Nombre maximum d'animes affichés dans la rangée « Reprendre » de l'accueil."
      >
        <Select
          title="Animes dans Reprendre"
          value={String(resumeLimit)}
          onValueChange={(v) => setSetting("resumeLimit", Number(v))}
          align="end"
          className="min-w-[9rem]"
          options={RESUME_LIMIT_OPTIONS}
        />
      </SettingRow>

      <SettingRow
        icon={Zap}
        label="Mode no beauty"
        description="Ouvre les fiches anime/manga plus vite en sautant bannière, synopsis traduit et vignettes d'épisode."
        details="Les fiches ne récupèrent plus que l'essentiel pour lancer la lecture : langues disponibles, liste des épisodes, infos générales de l'œuvre. Les images par défaut remplacent la bannière et les vignettes. Les autres onglets (recommandations, musiques) ne sont pas concernés."
        inlineControl
      >
        <Toggle
          label="Mode no beauty"
          checked={liteMode}
          onChange={(v) => setSetting("liteMode", v)}
        />
      </SettingRow>

    </Section>
  );
}
