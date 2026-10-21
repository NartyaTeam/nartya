import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { getCatalogTitles } from "@/api/animeApi";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * Titres romaji / anglais du catalogue, pour le réglage « Langue des titres ».
 * Chargés une fois (gardés 24 h en local) et seulement si le réglage s'écarte du titre d'origine.
 */

const STORAGE_KEY = "nartya_alt_titles";
const TTL_MS = 24 * 60 * 60 * 1000;

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && Date.now() - raw.at < TTL_MS && raw.map) return raw.map;
  } catch {}
  return null;
}

let inflight = null;

export const useTitlesStore = create((set, get) => ({
  map: readCache(),

  ensureLoaded() {
    if (get().map || inflight) return;
    inflight = getCatalogTitles()
      .then((map) => {
        set({ map });
        // Vide = colonnes pas encore remplies côté serveur : on redemandera au prochain lancement.
        if (!Object.keys(map).length) return;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), map }));
        } catch {}
      })
      .catch(() => {})
      .finally(() => {
        inflight = null;
      });
  },
}));

/**
 * `displayTitle(slug, titreParDéfaut, item?)` selon le réglage : romaji ou anglais quand on
 * les connaît, sinon le titre d'origine du catalogue. `item` apporte ses propres variantes
 * (`titleRomaji`, `titleEnglish`) : c'est le cas des mangas, absents de la table des titres.
 */
export function useDisplayTitle() {
  const language = useSettingsStore((s) => s.titleLanguage);
  const map = useTitlesStore((s) => s.map);
  useEffect(() => {
    if (language !== "default" && !map) useTitlesStore.getState().ensureLoaded();
  }, [language, map]);
  return useCallback(
    (slug, fallback, item = null) => {
      if (language === "default" || !slug) return fallback;
      const [romaji, english] = item?.titleRomaji || item?.titleEnglish
        ? [item.titleRomaji, item.titleEnglish]
        : map?.[slug] || [];
      const preferred = language === "english" ? english || romaji : romaji;
      return preferred || fallback;
    },
    [language, map]
  );
}
