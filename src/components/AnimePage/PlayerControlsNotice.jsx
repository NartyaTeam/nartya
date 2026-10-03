import { ListVideo, SlidersHorizontal } from "lucide-react";
import NartyaNote from "@/components/ui/NartyaNote";
import { useSettingsStore } from "@/stores/useSettingsStore";

/** Affichée une fois : retrait du bouton « épisode précédent », sélecteur de source en option. */
export default function PlayerControlsNotice({ onClose }) {
  const advancedPlayerControls = useSettingsStore((state) => state.advancedPlayerControls);
  const setSetting = useSettingsStore((state) => state.setSetting);

  return (
    <NartyaNote title="Le lecteur s'allège un peu" onClose={onClose}>
      {/* Compense le demi-interligne de `leading-relaxed`. */}
      <ul className="flex flex-col gap-3.5">
        <li className="flex items-start gap-3">
          <ListVideo size={16} className="mt-[3px] shrink-0 text-primary" />
          <span>
            Le bouton « épisode précédent » a été retiré — la liste des épisodes fait le même
            travail, en un clic.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <SlidersHorizontal size={16} className="mt-[3px] shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p>
              Le choix de la source (hébergeur) est maintenant masqué par défaut, ici comme dans le
              lecteur. Vous pourrez toujours retrouver ce réglage dans{" "}
              <span className="font-medium text-text">
                Paramètres → Lecture → Contrôles avancés du lecteur
              </span>
              .
            </p>

            <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-border bg-bg/30 px-3.5 py-3">
              <label
                htmlFor="notice-advanced-player-controls"
                className="cursor-pointer font-medium leading-snug text-text"
              >
                Afficher le choix des sources
              </label>
              <button
                id="notice-advanced-player-controls"
                type="button"
                role="switch"
                aria-checked={advancedPlayerControls}
                aria-label="Afficher le choix des sources"
                onClick={() => setSetting("advancedPlayerControls", !advancedPlayerControls)}
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors active:scale-95 ${
                  advancedPlayerControls
                    ? "border-primary bg-primary"
                    : "border-border bg-surface-2"
                }`}
              >
                <span
                  className={`absolute left-1 top-1 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
                    advancedPlayerControls ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </li>
      </ul>
    </NartyaNote>
  );
}
