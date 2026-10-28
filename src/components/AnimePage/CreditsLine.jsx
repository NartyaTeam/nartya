import { Link } from "react-router-dom";
import { useCachedResource } from "@/hooks/useCachedResource";
import { getMediaCredits } from "@/api/anilist";
import { roleLabel, roleRank } from "@/utils/anilistLabels";

/** Studio et créateurs de l'œuvre, chacun cliquable vers toutes ses œuvres. */
export default function CreditsLine({ anilistId, className = "" }) {
  const { data } = useCachedResource(
    anilistId ? `credits:${anilistId}` : null,
    () => getMediaCredits(anilistId),
    60 * 60 * 1000
  );
  if (!data) return null;

  // Une personne = son rôle le plus important ; on garde les trois premières.
  const people = new Map();
  for (const p of data.staff || []) {
    const rank = roleRank(p.role);
    if (rank === Infinity) continue;
    const prev = people.get(p.id);
    if (!prev || rank < prev.rank) people.set(p.id, { ...p, rank });
  }
  const staff = [...people.values()].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const studios = (data.studios || []).slice(0, 2);
  if (!staff.length && !studios.length) return null;

  const linkClass = "font-semibold text-text transition-colors hover:text-primary";
  return (
    <p className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted ${className}`}>
      {studios.length > 0 && (
        <span>
          Studio{" "}
          {studios.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ", "}
              <Link to={`/studio/${s.id}`} className={linkClass}>
                {s.name}
              </Link>
            </span>
          ))}
        </span>
      )}
      {staff.map((p) => (
        <span key={p.id}>
          {roleLabel(p.role)}{" "}
          <Link to={`/staff/${p.id}`} className={linkClass}>
            {p.name}
          </Link>
        </span>
      ))}
    </p>
  );
}
