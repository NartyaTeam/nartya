import { useState } from "react";
import { ArrowUpRight, Tv } from "lucide-react";

/** Pour les œuvres du catalogue qui ne sont qu'un lien sortant vers le diffuseur officiel. */

// Clé = hôte sans « www. ». `gratuit` ajoute la mention correspondante.
const PLATEFORMES = {
  "france.tv": { nom: "France TV", gratuit: true },
  "6play.fr": { nom: "6play", gratuit: true },
  "tf1.fr": { nom: "TF1+", gratuit: true },
  "arte.tv": { nom: "ARTE", gratuit: true },
  "youtube.com": { nom: "YouTube", gratuit: true },
  "crunchyroll.com": { nom: "Crunchyroll" },
  "animationdigitalnetwork.fr": { nom: "ADN" },
  "adn.tv": { nom: "ADN" },
  "netflix.com": { nom: "Netflix" },
  "disneyplus.com": { nom: "Disney+" },
  "primevideo.com": { nom: "Prime Video" },
};

/** « animeworld.co.uk » → « Animeworld » */
function nomDepuisHote(host) {
  const base = (host || "").split(".")[0] || host || "le diffuseur";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Repli sur une icône neutre. */
function Logo({ host, size = 18 }) {
  const [echec, setEchec] = useState(false);
  if (echec) return <Tv size={size} aria-hidden="true" />;
  return (
    <img
      src={`https://${host}/favicon.ico`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="rounded-sm object-contain"
      style={{ width: size, height: size }}
      onError={() => setEchec(true)}
    />
  );
}

function ouvrir(url) {
  if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function ExternalWatch({ animeTitle, destinations = [] }) {
  if (!destinations.length) return null;

  const [principale, ...autres] = destinations;
  const infos = PLATEFORMES[principale.host] || {};
  const nom = infos.nom || nomDepuisHote(principale.host);

  return (
    <section className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl rounded-xl border border-border/70 bg-surface/40 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white shadow-[0_6px_18px_-10px_rgba(0,0,0,0.8)]">
              <Logo host={principale.host} size={28} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="font-display text-base font-bold text-text">
                  Disponible sur {nom}
                </h2>
                {infos.gratuit && (
                  <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Gratuit
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-5 text-muted">
                {animeTitle || "Cette œuvre"} est proposée par son diffuseur officiel.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => ouvrir(principale.url)}
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/[0.08] px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary hover:text-primary-fg"
          >
            Voir sur {nom}
            <ArrowUpRight
              size={15}
              className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        </div>

        {autres.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-3">
            <span className="text-xs text-muted/60">Aussi disponible sur</span>
            {autres.map((d) => {
              const i = PLATEFORMES[d.host] || {};
              return (
                <button
                  type="button"
                  key={d.host}
                  onClick={() => ouvrir(d.url)}
                  className="text-xs font-medium text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
                >
                  {i.nom || nomDepuisHote(d.host)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
