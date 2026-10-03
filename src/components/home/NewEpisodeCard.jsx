import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import { Flag, getLanguageLabel } from "@/components/ui/Flag";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * La carte ouvre la fiche sur l'épisode sorti ; le Play ouvre l'épisode, seulement si le flux
 * donne son numéro.
 */
export default function NewEpisodeCard({ anime }) {
  const navigate = useNavigate();
  const defaultLanguage = useSettingsStore((s) => s.defaultLanguage);
  const langs = Array.from(new Set(anime.langs || []));

  // Les langues ne sont pas au même point : la langue du spectateur, à défaut la sortie la plus
  // récente.
  const releases = anime.releases || [];
  const release = releases.find((r) => r.lang === defaultLanguage) || releases[0] || null;

  const season = release?.season || anime.season || null;
  const lang = release?.lang || langs[0] || null;
  const episode = release?.episode ?? null;
  const canPlay = Boolean(season && episode);

  // Même sortie que le bouton Play.
  const label = release?.seasonLabel || anime.seasonLabel || "";
  const badgeEpisode = episode ?? (label.match(/episode\s+(\d+)/i)?.[1] ?? null);
  const badge = badgeEpisode ? `Ép. ${badgeEpisode}` : label || null;

  const openSheet = () => {
    const params = new URLSearchParams();
    if (season) params.set("season", season);
    if (lang) params.set("lang", lang);
    if (season && episode) params.set("focus", String(episode));
    const query = params.toString();
    navigate(`/anime/${anime.slug}${query ? `?${query}` : ""}`);
  };

  const play = (event) => {
    event.stopPropagation();
    navigate(`/watch/${anime.slug}?season=${season}&ep=${episode}&lang=${lang}`);
  };

  return (
    <div className="group w-full text-left">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-2">
        {anime.cover ? (
          <img
            src={anime.cover}
            alt={anime.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full skeleton" />
        )}

        {/* Le Play passe au-dessus. */}
        <button
          onClick={openSheet}
          title={anime.title}
          aria-label={`Ouvrir la fiche de ${anime.title}`}
          className="absolute inset-0 transition-transform active:scale-[0.98] md:active:scale-100"
        />

        {/* Ne doit pas intercepter le clic. */}
        <div className="pointer-events-none absolute inset-0 hidden bg-black/0 transition-colors duration-200 group-hover:bg-black/45 md:block" />

        {canPlay && (
          <button
            onClick={play}
            title={`Lire l'épisode ${episode}${lang ? ` (${getLanguageLabel(lang)})` : ""}`}
            aria-label={`Lire l'épisode ${episode} de ${anime.title}`}
            className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg transition-[opacity,transform] hover:scale-105 active:scale-95 md:opacity-0 md:group-hover:opacity-100"
          >
            <Play size={18} className="ml-0.5 fill-current" />
          </button>
        )}

        {badge && (
          <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-primary/90 px-1.5 py-0.5 text-[0.68rem] font-bold text-primary-fg backdrop-blur-sm">
            {badge}
          </span>
        )}

        {langs.length > 0 && (
          <div className="pointer-events-none absolute bottom-1.5 right-1.5 flex gap-1">
            {langs.slice(0, 4).map((l) => (
              <Flag
                key={l}
                lang={l}
                countryOfOrigin={anime.countryOfOrigin}
                size={13}
                title={getLanguageLabel(l)}
              />
            ))}
          </div>
        )}
      </div>

      <button onClick={openSheet} className="block w-full text-left">
        <h3 className="mt-2 line-clamp-1 text-sm font-semibold text-text transition-colors group-hover:text-primary">
          {anime.title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">
          {langs.length ? langs.map(getLanguageLabel).join(" / ") : anime.seasonLabel}
        </p>
      </button>
    </div>
  );
}
