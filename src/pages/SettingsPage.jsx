import {
  Settings as SettingsIcon,
  Play,
  Download,
  Palette,
  ShieldCheck,
  RotateCcw,
  DatabaseBackup,
  Bell,
  BellRing,
  UserRound,
  KeyRound,
} from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { getLanguageLabel } from "@/components/ui/Flag";
import { platform } from "@/platform";
import { downloadsAvailable } from "@/api/downloads";
import { THEME_PRESETS } from "@/utils/theme";
import { getHomeSections } from "@/api/animeApi";
import { useCachedResource } from "@/hooks/useCachedResource";
import { Section, SettingRow, Toggle } from "@/components/settings/SettingsLayout";
import AccountSection from "@/components/settings/AccountSection";
import PlaybackSection from "@/components/settings/PlaybackSection";
import DownloadsSection from "@/components/settings/DownloadsSection";
import AppearanceSection from "@/components/settings/AppearanceSection";
import BackupSection from "@/components/settings/BackupSection";
import ApiKeysSection from "@/components/settings/ApiKeysSection";
import { useHasAccount } from "@/lib/guest";

export default function SettingsPage() {
  const defaultLanguage = useSettingsStore((s) => s.defaultLanguage);
  const playbackQuality = useSettingsStore((s) => s.playbackQuality);
  const themePreset = useSettingsStore((s) => s.themePreset);
  const releaseNotifications = useSettingsStore((s) => s.releaseNotifications);
  const discordPresence = useSettingsStore((s) => s.discordPresence);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const reset = useSettingsStore((s) => s.reset);
  const canDownload = downloadsAvailable();
  const isDesktop = platform.isDesktop;

  const session = useAuthStore((s) => s.session);
  const hasAccount = useHasAccount();
  const { data: homeData } = useCachedResource(
    "home:sections:v2",
    getHomeSections,
    10 * 60 * 1000
  );
  const navigationItems = [
    session && { id: "account", label: "Compte", icon: UserRound },
    { id: "playback", label: "Lecture", icon: Play },
    { id: "notifications", label: "Notifications", icon: Bell },
    canDownload && { id: "downloads", label: "Téléchargements", icon: Download },
    { id: "appearance", label: "Apparence", icon: Palette },
    isDesktop && { id: "privacy", label: "Confidentialité", icon: ShieldCheck },
    session && { id: "backup", label: "Sauvegarde", icon: DatabaseBackup },
    hasAccount && { id: "api-keys", label: "Clés d'API", icon: KeyRound },
  ].filter(Boolean);
  const sectionNumber = (id) =>
    String(navigationItems.findIndex((item) => item.id === id) + 1).padStart(2, "0");
  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };
  const accentLabel =
    themePreset === "custom" ? "Libre" : THEME_PRESETS[themePreset]?.label || "Vermillon";
  const heroAnime =
    homeData?.hero?.find(
      (item, index) => index > 0 && (item?.fanart || item?.banner || item?.cover)
    ) || homeData?.hero?.find((item) => item?.fanart || item?.banner || item?.cover);
  const heroImage = heroAnime?.fanart || heroAnime?.banner || heroAnime?.cover || null;

  return (
    <div className="min-h-full animate-fade-in pb-28 md:pb-20 md:pt-16">
      <header className="relative overflow-hidden border-b border-border/70 bg-surface px-4 pb-5 pt-[calc(env(safe-area-inset-top)+4.75rem)] md:min-h-[390px] md:px-8 md:pb-14 md:pt-20 lg:px-10">
        {heroImage && (
          <div
            className="absolute inset-y-0 right-0 hidden w-[92%] overflow-hidden md:block"
            style={{
              WebkitMaskImage:
                "linear-gradient(90deg, transparent 0%, rgb(0 0 0 / 0.12) 20%, rgb(0 0 0 / 0.72) 42%, black 58%)",
              maskImage:
                "linear-gradient(90deg, transparent 0%, rgb(0 0 0 / 0.12) 20%, rgb(0 0 0 / 0.72) 42%, black 58%)",
            }}
          >
            <img src={heroImage} alt="" className="h-full w-full object-cover object-center opacity-85" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgb(var(--surface))_0%,transparent_48%,rgb(var(--surface)/0.25)_100%)]" />
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-0 hidden md:block"
          style={{
            background:
              "linear-gradient(90deg, rgb(var(--surface)) 0%, rgb(var(--surface) / 0.96) 25%, rgb(var(--surface) / 0.68) 43%, rgb(var(--surface) / 0.16) 68%, transparent 86%), radial-gradient(55% 90% at 82% 18%, rgb(var(--primary) / 0.16), transparent 72%)",
          }}
        />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(75%_120%_at_100%_0%,rgb(var(--primary)/0.18),transparent_68%)] md:hidden" />

        <div className="relative mx-auto grid max-w-6xl gap-5 md:min-h-[255px] md:gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
          <div>
            <div className="hidden items-center gap-3 md:flex">
              <SettingsIcon size={15} className="text-primary" />
              <span className="text-[0.62rem] font-bold uppercase tracking-[0.25em] text-primary">
                Réglages Nartya
              </span>
              <span className="h-px w-14 bg-primary/40" />
            </div>
            <h1 className="font-display text-[2.15rem] font-black tracking-[-0.035em] text-white md:mt-6 md:text-5xl">
              Paramètres
            </h1>
            <p className="mt-1.5 max-w-xl text-xs leading-5 text-white/48 md:mt-4 md:text-sm md:leading-6">
              Lecture, téléchargements, apparence et données du compte. Les changements sont
              appliqués immédiatement.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg/55 px-4 py-3.5 backdrop-blur-md md:rounded-none md:border-y md:border-x-0 md:border-l-2 md:border-l-primary/55 md:px-5 md:py-5">
            <p className="text-[0.55rem] font-bold uppercase tracking-[0.18em] text-primary md:text-[0.58rem] md:tracking-[0.2em]">
              Configuration active
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-3 md:mt-4 md:gap-4">
              <div>
                <p className="font-display text-sm font-black text-white md:text-lg">
                  {playbackQuality === "auto" ? "AUTO" : `${playbackQuality}p`}
                </p>
                <p className="mt-1 text-[0.54rem] uppercase tracking-[0.14em] text-white/30">Image</p>
              </div>
              <div>
                <p className="font-display text-sm font-black uppercase text-white md:text-lg">
                  {getLanguageLabel(defaultLanguage)}
                </p>
                <p className="mt-1 text-[0.54rem] uppercase tracking-[0.14em] text-white/30">Langue</p>
              </div>
              <div>
                <p className="truncate font-display text-sm font-black text-white md:text-lg">{accentLabel}</p>
                <p className="mt-1 text-[0.54rem] uppercase tracking-[0.14em] text-white/30">Accent</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-7 px-4 pt-5 md:gap-12 md:px-8 md:pt-12 lg:grid-cols-[210px_minmax(0,1fr)] lg:px-10">
        <aside className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-20 -mx-4 min-w-0 overflow-hidden bg-bg/95 py-2 backdrop-blur-xl md:static md:mx-0 md:overflow-visible md:bg-transparent md:py-0 md:backdrop-blur-none lg:sticky lg:top-24 lg:self-start">
          <p className="mb-4 hidden text-[0.56rem] font-bold uppercase tracking-[0.2em] text-muted md:block">
            Rubriques
          </p>
          <nav className="no-scrollbar flex gap-2 overflow-x-auto px-4 md:block md:border-y md:border-border/70 md:bg-white/[0.018] md:px-3 md:py-2">
            {navigationItems.map(({ id, label, icon: Icon }, index) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id)}
                className="group flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-surface/80 px-3 py-2 text-left active:scale-95 md:w-full md:gap-3 md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:border-b-border/40 md:bg-transparent md:px-1 md:py-3 md:last:border-b-0"
              >
                <span className="hidden w-5 text-[0.56rem] font-bold tabular-nums text-muted/60 md:block">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Icon size={14} className="text-muted transition-colors group-hover:text-primary" />
                <span className="text-[0.7rem] font-semibold text-muted transition-colors group-hover:text-text md:text-xs">
                  {label}
                </span>
              </button>
            ))}
          </nav>
          <p className="mt-5 hidden text-[0.62rem] leading-5 text-muted/70 md:block">
            Les préférences de lecture restent propres à cet appareil.
          </p>
        </aside>

        <main className="min-w-0 space-y-8 md:space-y-16">
        {session && <AccountSection number={sectionNumber("account")} />}

        <PlaybackSection number={sectionNumber("playback")} />

        <Section
          id="notifications"
          number={sectionNumber("notifications")}
          eyebrow="Alertes"
          title="Notifications"
          description="Choisis les événements pour lesquels Nartya peut te prévenir."
        >
          <SettingRow
            icon={BellRing}
            label="Sorties d'épisodes"
            description="Prévient lorsqu'un nouvel épisode sort pour un anime suivi."
            details="Les favoris et les animes placés dans tes listes sont suivis. Une pastille apparaît également sur le calendrier."
            inlineControl
          >
            <Toggle
              label="Notifications de sorties"
              checked={releaseNotifications}
              onChange={(v) => {
                setSetting("releaseNotifications", v);
                // Permission système demandée à l'activation.
                if (v && typeof Notification !== "undefined" && Notification.permission === "default") {
                  Notification.requestPermission().catch(() => {});
                }
              }}
            />
          </SettingRow>
        </Section>

        {canDownload && <DownloadsSection number={sectionNumber("downloads")} />}

        <AppearanceSection number={sectionNumber("appearance")} />

        {/* Bureau uniquement. */}
        {isDesktop && (
          <Section
            id="privacy"
            number={sectionNumber("privacy")}
            eyebrow="Bureau"
            title="Confidentialité"
            description="Contrôle les informations visibles dans les intégrations externes."
          >
            <SettingRow
              icon={ShieldCheck}
              label="Présence Discord"
              description="Affiche l'épisode en cours sur ton profil Discord."
              details="Cette activité utilise la Rich Presence de Discord. Tu peux la désactiver à tout moment pour rester discret."
              inlineControl
            >
              <Toggle
                label="Présence Discord"
                checked={discordPresence}
                onChange={(v) => setSetting("discordPresence", v)}
              />
            </SettingRow>
          </Section>
        )}

        {session && <BackupSection number={sectionNumber("backup")} />}

        {hasAccount && <ApiKeysSection number={sectionNumber("api-keys")} />}

        <div className="flex justify-stretch border-t border-border/60 pt-4 md:justify-end md:pt-5">
          <button
            onClick={reset}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3.5 text-xs font-medium text-muted transition-colors hover:bg-primary/[0.06] hover:text-primary md:h-auto md:w-auto md:rounded-[5px] md:py-2 md:text-sm"
          >
            <RotateCcw size={15} />
            Réinitialiser les paramètres
          </button>
        </div>
        </main>
      </div>
    </div>
  );
}
