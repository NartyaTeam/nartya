import { getLanguageLabel, getFlagSvg } from "@/components/ui/Flag";
import { setAudioBoost } from "@/utils/audioBoost";
import { ANIME4K_MODES } from "@/utils/anime4k";
import { pickFixedQualityLevel } from "@/utils/qualityLevels";
import { useSettingsStore } from "@/stores/useSettingsStore";

// En chaînes HTML : ArtPlayer n'accepte pas de JSX.

// `style="fill:none"` : ArtPlayer force `.art-video-player svg{fill}`. `<i class="art-icon">`
// reçoit l'échelle du plein écran.
const icon = (name, path, extra = "") =>
  `<i class="art-icon art-icon-${name}"><svg width="22" height="22" viewBox="0 0 24 24" style="fill:none" stroke="currentColor" stroke-width="2" stroke-linecap="${extra || "round"}" stroke-linejoin="round">${path}</svg></i>`;

export const NEXT_SVG = icon("next", '<path d="M5 12h14M12 5l7 7-7 7"/>', "butt");
export const EPISODES_SVG = icon(
  "episodes",
  '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'
);

// 1 = 100 %.
const BOOST_OPTIONS = [1, 1.5, 2, 2.5, 3].map((v) => ({
  html: v === 1 ? "100 % (aucun)" : `${Math.round(v * 100)} %`,
  value: v,
}));
const BOOST_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

// Celui que l'upstream active par défaut, pour la majorité des anime 1080p.
const RECOMMENDED_ANIME4K_MODE = "a";
const ANIME4K_OPTIONS = [
  { html: "Désactivé", value: "off" },
  ...ANIME4K_MODES.map((m) => ({
    html:
      m.value === RECOMMENDED_ANIME4K_MODE
        ? `<span class="art-anime4k-option">${m.label}<small>Recommandé</small></span>`
        : m.label,
    value: m.value,
  })),
];
const ANIME4K_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>';
const anime4kLabel = (value) =>
  value === "off" ? "Désactivé" : value.toUpperCase().split("").join("+");

const langHtml = (lang, country) =>
  `<div class="art-lang-control">${getFlagSvg(lang, country)}<span>${getLanguageLabel(lang)}</span></div>`;

const SOURCES_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" style="fill:none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>';

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
const sourceItemHtml = (label) =>
  `<div class="art-lang-control"><span>${escapeHtml(label || "Source")}</span></div>`;

export function boostSettingOption(art) {
  const initBoost = useSettingsStore.getState().volumeBoost || 1;
  return {
    name: "boost",
    width: 220,
    html: "Boost audio",
    tooltip: `${Math.round(initBoost * 100)} %`,
    icon: BOOST_ICON,
    selector: BOOST_OPTIONS.map((o) => ({ ...o, default: o.value === initBoost })),
    onSelect: (item) => {
      setAudioBoost(art, item.value);
      try {
        useSettingsStore.getState().setSetting("volumeBoost", item.value);
      } catch (_) {}
      return item.html;
    },
  };
}

/**
 * `onNeedsWarning` : première activation sur cet appareil, l'avertissement matériel passe
 * avant toute allocation.
 */
export function anime4kSettingOption(art, selectedMode, onNeedsWarning) {
  return {
    name: "anime4k",
    // Pour les descriptions.
    width: 340,
    html: "Anime4K",
    tooltip: anime4kLabel(selectedMode),
    icon: ANIME4K_ICON,
    selector: ANIME4K_OPTIONS.map((option) => ({
      ...option,
      default: option.value === selectedMode,
    })),
    onSelect: (item) => {
      const settings = useSettingsStore.getState();
      const currentMode = settings.anime4kMode || "off";
      if (item.value === "off" || currentMode !== "off" || settings.anime4kWarningAcknowledged) {
        settings.setSetting("anime4kMode", item.value);
        return anime4kLabel(item.value);
      }
      // Le diagnostic porte sur les dimensions visées par la préférence Anime4K.
      const targetIndex = pickFixedQualityLevel(art.hls?.levels, settings.anime4kQuality || "max");
      const targetLevel = targetIndex >= 0 ? art.hls?.levels?.[targetIndex] : null;
      onNeedsWarning({
        mode: item.value,
        sourceWidth: targetLevel?.width || art.video?.videoWidth || 0,
        sourceHeight: targetLevel?.height || art.video?.videoHeight || 0,
      });
      return anime4kLabel(currentMode);
    },
  };
}

export function languageSettingOption({ languages, language, countryOfOrigin, onChange }) {
  return {
    name: "language",
    width: 220,
    html: "Langue",
    tooltip: getLanguageLabel(language),
    icon: getFlagSvg(language, countryOfOrigin),
    selector: languages.map((l) => ({
      html: langHtml(l, countryOfOrigin),
      value: l,
      default: l === language,
    })),
    onSelect: (item) => {
      onChange(item.value);
      return getLanguageLabel(item.value);
    },
  };
}

export function sourceSettingOption({ sources, sourceId, onChange }) {
  const current = sources.find((s) => s.id === sourceId) || sources[0];
  return {
    name: "sources",
    width: 220,
    html: "Source",
    tooltip: escapeHtml(current?.label || "Source"),
    icon: SOURCES_ICON,
    selector: sources.map((s) => ({
      html: sourceItemHtml(s.label),
      value: s.id,
      default: s.id === (current?.id ?? sourceId),
    })),
    onSelect: (item) => {
      onChange(item.value);
      return escapeHtml(sources.find((s) => s.id === item.value)?.label || "Source");
    },
  };
}

/** `option` nul retire l'entrée ; `addedRef` dit si elle existe. */
export function syncSetting(art, name, option, addedRef) {
  if (option) {
    if (addedRef.current) art.setting.update(option);
    else {
      art.setting.add(option);
      addedRef.current = true;
    }
  } else if (addedRef.current) {
    art.setting.remove(name);
    addedRef.current = false;
  }
}
