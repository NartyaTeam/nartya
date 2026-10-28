import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, ChevronDown, RotateCw, UserRound } from "lucide-react";
import { invalidateCache, useCachedResource } from "@/hooks/useCachedResource";
import { getStaffPage, getStudioPage } from "@/api/anilist";
import { occupationLabel, roleLabel } from "@/utils/anilistLabels";
import WorkCard from "@/components/anime/WorkCard";
import PageLoader from "@/components/ui/PageLoader";

const GRID_CLASS =
  "grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-x-5 sm:gap-y-8";


function WorksGrid({ title, works, withRoles }) {
  if (!works.length) return null;
  return (
    <section>
      <h2 className="section-title mb-5">
        {title} <span className="font-sans text-base font-medium normal-case text-muted">{works.length}</span>
      </h2>
      <div className={GRID_CLASS}>
        {works.map((work) => (
          <WorkCard
            key={work.id}
            work={work}
            caption={withRoles && work.roles?.length ? roleLabel(work.roles[0]) : null}
          />
        ))}
      </div>
    </section>
  );
}

/** Toutes les œuvres d'un auteur (`/staff/:id`) ou d'un studio (`/studio/:id`), d'après AniList. */
export default function CreditPage({ kind }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bioOpen, setBioOpen] = useState(false);
  const isStudio = kind === "studio";
  const { data, loading, error } = useCachedResource(
    `${kind}:${id}`,
    () => (isStudio ? getStudioPage(id) : getStaffPage(id)),
    60 * 60 * 1000
  );

  if (loading && !data) return <PageLoader />;
  if (error || !data) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-display text-2xl">
          {error ? "AniList ne répond pas" : isStudio ? "Studio introuvable" : "Fiche introuvable"}
        </p>
        {error && (
          <p className="max-w-sm text-sm text-muted">
            Ces fiches viennent d'AniList, qui limite le nombre de demandes. Réessaie dans une minute.
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={() => navigate(-1)} className="btn-ghost">
            <ArrowLeft size={18} /> Retour
          </button>
          {error && (
            <button onClick={() => invalidateCache(`${kind}:${id}`)} className="btn-shu px-4">
              <RotateCw size={16} /> Réessayer
            </button>
          )}
        </div>
      </div>
    );
  }

  const animes = data.works.filter((w) => w.type !== "MANGA");
  const mangas = data.works.filter((w) => w.type === "MANGA");
  const occupations = (data.occupations || []).map(occupationLabel);
  const bio = data.description || "";
  const Icon = isStudio ? Building2 : UserRound;

  return (
    <div className="animate-fade-in mx-auto max-w-[1600px] px-4 pb-16 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:px-6 sm:pt-24 md:px-10">
      <header className="mb-10 flex flex-col items-center gap-6 text-center sm:flex-row sm:items-end sm:text-left">
        {data.image ? (
          <img
            src={data.image}
            alt=""
            className="h-40 w-28 shrink-0 -rotate-2 rounded-md object-cover shadow-[5px_5px_0_rgb(var(--primary))] ring-2 ring-text/25"
          />
        ) : (
          <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-2 ring-border">
            <Icon size={40} strokeWidth={1.6} />
          </span>
        )}
        <div className="min-w-0">
          <p className="eyebrow">{isStudio ? "Studio d'animation" : occupations.join(" · ") || "Équipe"}</p>
          <h1 className="t-impact mt-2 text-4xl sm:text-6xl">{data.name}</h1>
          {data.nativeName && <p className="mt-1 text-muted">{data.nativeName}</p>}
          {bio && (
            <div className="mt-3 max-w-3xl text-left">
              <p className={`whitespace-pre-line text-sm leading-relaxed text-text/80 ${bioOpen ? "" : "line-clamp-3"}`}>
                {bio}
              </p>
              {bio.length > 240 && (
                <button
                  onClick={() => setBioOpen((v) => !v)}
                  className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary"
                >
                  {bioOpen ? "Voir moins" : "Voir plus"}
                  <ChevronDown size={15} className={bioOpen ? "rotate-180" : ""} />
                </button>
              )}
              {!bioOpen && <p className="mt-1 text-xs text-muted/70">Biographie en anglais, d'après AniList.</p>}
            </div>
          )}
        </div>
      </header>

      <div className="space-y-12">
        <WorksGrid title="Animes" works={animes} withRoles={!isStudio} />
        <WorksGrid title="Mangas" works={mangas} withRoles={!isStudio} />
        {!animes.length && !mangas.length && (
          <p className="py-16 text-center text-muted">Aucune œuvre répertoriée.</p>
        )}
      </div>
    </div>
  );
}
