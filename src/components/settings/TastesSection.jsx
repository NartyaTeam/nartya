import { Section } from "@/components/settings/SettingsLayout";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { MAIN_GENRES, SECONDARY_GENRES } from "@/utils/genres";

const MAX_FAVORITES = 8;

/** Thèmes préférés : chacun devient une rangée sur l'accueil des animes et des mangas. */
export default function TastesSection({ number }) {
  const favorites = useSettingsStore((s) => s.favoriteGenres) || [];
  const setSetting = useSettingsStore((s) => s.setSetting);
  const full = favorites.length >= MAX_FAVORITES;

  const toggle = (genre) => {
    if (favorites.includes(genre)) setSetting("favoriteGenres", favorites.filter((g) => g !== genre));
    else if (!full) setSetting("favoriteGenres", [...favorites, genre]);
  };

  const chip = (genre) => {
    const active = favorites.includes(genre);
    return (
      <button
        key={genre}
        type="button"
        aria-pressed={active}
        disabled={!active && full}
        onClick={() => toggle(genre)}
        className={`rounded-md border-2 px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
          active
            ? "border-primary bg-primary/15 text-primary"
            : "border-border bg-surface/60 text-muted hover:border-text/35 hover:text-text"
        }`}
      >
        {genre}
      </button>
    );
  };

  return (
    <Section
      id="tastes"
      number={number}
      eyebrow="Accueil"
      title="Mes thèmes préférés"
      description={`Choisis jusqu'à ${MAX_FAVORITES} thèmes : ils sont mis en avant sur l'accueil, en animes comme en mangas.`}
    >
      <div className="space-y-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-text/80">
            {favorites.length
              ? `${favorites.length} / ${MAX_FAVORITES} choisi${favorites.length > 1 ? "s" : ""}`
              : "Aucun thème choisi"}
          </p>
          {favorites.length > 0 && (
            <button
              type="button"
              onClick={() => setSetting("favoriteGenres", [])}
              className="text-xs font-medium text-muted transition-colors hover:text-text"
            >
              Tout retirer
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">{MAIN_GENRES.map(chip)}</div>
        <p className="text-2xs font-bold uppercase tracking-[0.16em] text-muted/70">Plus précis</p>
        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto pr-1">{SECONDARY_GENRES.map(chip)}</div>
      </div>
    </Section>
  );
}
