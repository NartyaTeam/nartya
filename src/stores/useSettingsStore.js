import { create } from "zustand";
import { applyTheme, applyReduceMotion, DEFAULT_PRESET, DEFAULT_CUSTOM_COLOR } from "@/utils/theme";

/** Persisté par machine. Un nouveau réglage s'ajoute dans DEFAULTS, sans autre câblage. */

const STORAGE_KEY = "nartya_settings";

const DEFAULTS = {
  defaultLanguage: "vostfr",
  prioritySource: "auto", // "auto" ou clé opaque de source (s1, s2, …)
  downloadQuality: "max", // "max" | "1080" | "720" | "480", HLS uniquement
  downloadParallelism: "auto", // "auto" ou entier, borné par le forfait
  playbackQuality: "auto", // "auto" (ABR) | "1080" | "720" | "480" | "360", HLS uniquement
  themePreset: DEFAULT_PRESET, // clé de THEME_PRESETS, ou "custom"
  customColor: DEFAULT_CUSTOM_COLOR, // teinte hex quand themePreset === "custom"
  autoSkip: true,
  skipButtonEnabled: true,
  autoSkipOpEd: false,
  discordPresence: true,
  reduceMotion: false, // coupe le grain et les animations
  resumeLimit: 10,
  volumeBoost: 1,
  anime4kMode: "off", // "off" | "a" | "b" | "c" | "aa" | "bb" | "ca"
  anime4kQuality: "max", // qualité source verrouillée sous Anime4K
  anime4kWarningAcknowledged: false, // avertissement matériel déjà confirmé
  releaseNotifications: true, // notif système à la sortie d'un épisode d'un anime suivi
  liteMode: false,
  advancedPlayerControls: false, // affiche le sélecteur d'hébergeur
  playerUpdateNoticeSeen: false,
  spoilerMode: false, // floute les vignettes des épisodes non vus
  nartyaIntro: true,
};

/** Une valeur persistée sous l'ancienne forme (nom d'hébergeur) est remise sur « auto ». */
const isOpaqueSourceKey = (value) => /^s\d+$/.test(value);

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const stored = { ...DEFAULTS, ...JSON.parse(raw) };
    if (stored.prioritySource !== "auto" && !isOpaqueSourceKey(stored.prioritySource)) {
      stored.prioritySource = DEFAULTS.prioritySource;
    }
    return stored;
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(state) {
  try {
    const values = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, state[k]]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {}
}

export const useSettingsStore = create((set, get) => ({
  ...load(),

  setSetting: (key, value) => {
    if (!(key in DEFAULTS)) return;
    set({ [key]: value });
    persist(get());
    if (key === "themePreset" || key === "customColor") applyTheme(get());
    if (key === "reduceMotion") applyReduceMotion(value);
  },

  reset: () => {
    set({ ...DEFAULTS });
    persist(DEFAULTS);
    applyTheme(DEFAULTS);
    applyReduceMotion(DEFAULTS.reduceMotion);
  },
}));

// Appliqué au chargement du module, avant le premier rendu.
applyTheme(useSettingsStore.getState());
applyReduceMotion(useSettingsStore.getState().reduceMotion);
