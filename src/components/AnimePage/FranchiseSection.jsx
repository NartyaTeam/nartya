import { Network } from "lucide-react";
import { invalidateCache, useCachedResource } from "@/hooks/useCachedResource";
import { getFranchise } from "@/api/anilist";
import { RELATION_LABEL } from "@/utils/anilistLabels";
import WorkCard from "@/components/anime/WorkCard";

const GRID_CLASS =
  "grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:gap-x-5";

/** Toute la franchise, de la plus ancienne œuvre à la plus récente, puis les mangas liés. */
export function FranchiseSection({ anilistId }) {
  const { data, loading, error } = useCachedResource(
    anilistId ? `franchise:${anilistId}` : null,
    () => getFranchise(anilistId),
    60 * 60 * 1000
  );

  if (loading && !data) {
    return (
      <div className={`px-4 pb-10 pt-6 sm:px-8 ${GRID_CLASS}`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] skeleton rounded-md" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-[30dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm leading-relaxed text-muted">
          AniList ne répond pas pour le moment (trop de demandes). Réessaie dans une minute.
        </p>
        <button onClick={() => invalidateCache(`franchise:${anilistId}`)} className="btn-ghost text-sm">
          Réessayer
        </button>
      </div>
    );
  }

  const animes = data?.animes || [];
  const sources = data?.sources || [];
  if (animes.length <= 1 && !sources.length) {
    return (
      <div className="flex min-h-[30dvh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Network size={22} strokeWidth={1.8} />
        </span>
        <p className="mt-4 text-sm leading-relaxed text-muted">Pas d'autre œuvre liée à celle-ci.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 px-4 pb-10 pt-6 sm:px-8">
      {animes.length > 1 && (
        <section>
          <h2 className="section-title mb-1">Toute la franchise</h2>
          <p className="mb-5 text-sm text-muted">
            Saisons, films, spin-off et épisodes spéciaux, dans l'ordre de sortie.
          </p>
          <div className={GRID_CLASS}>
            {animes.map((work) => (
              <WorkCard
                key={work.id}
                work={work}
                current={work.id === data.id}
                caption={RELATION_LABEL[work.relation] || null}
              />
            ))}
          </div>
        </section>
      )}
      {sources.length > 0 && (
        <section>
          <h2 className="section-title mb-5">Mangas et romans liés</h2>
          <div className={GRID_CLASS}>
            {sources.map((work) => (
              <WorkCard key={work.id} work={work} caption={RELATION_LABEL[work.relation] || null} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
