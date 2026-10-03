import { useCallback } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { searchCatalog } from "@/api/animeApi";
import { episodeRangeFor } from "@/utils/episodeRanges";
import CatalogResults from "@/components/catalog/CatalogResults";

/** `/search?q=&genre=A,B&type=Anime&eps=13-26` */
export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const media = params.get("media") === "manga" ? "manga" : "anime";
  const type = params.get("type") || "";
  const genresStr = params.get("genre") || "";
  const epsKey = params.get("eps") || "";
  const range = episodeRangeFor(epsKey);

  const fetchPage = useCallback(
    (page) =>
      searchCatalog({
        search: q,
        genres: genresStr ? genresStr.split(",").filter(Boolean) : [],
        type,
        media,
        epMin: range?.min ?? null,
        epMax: range?.max ?? null,
        page,
      }),
    [q, genresStr, type, media, range?.min, range?.max]
  );

  const activeChips = [
    type,
    range && `${range.label} épisodes`,
    ...(genresStr ? genresStr.split(",").filter(Boolean) : []),
  ].filter(Boolean);

  // Ancienne URL anime : redirigée vers la recherche unique, critères conservés.
  if (media !== "manga") {
    const forwarded = new URLSearchParams(params);
    forwarded.delete("media");
    const query = forwarded.toString();
    return <Navigate to={`/recherche${query ? `?${query}` : ""}`} replace />;
  }

  return (
    <div className="animate-fade-in mx-auto max-w-[1600px] px-8 pb-10 pt-24">
      <div className="mb-6 flex items-center gap-3">
        <SlidersHorizontal size={24} className="text-primary" />
        <div>
          <h1 className="font-display text-3xl font-extrabold text-glow">
            {q ? `« ${q} »` : "Recherche manga"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {activeChips.length
              ? activeChips.join(" · ")
              : "Résultats du catalogue Manga."}
          </p>
        </div>
      </div>

      <CatalogResults
        fetchPage={fetchPage}
        resetKey={`${media}|${q}|${genresStr}|${type}|${epsKey}`}
        emptyLabel="Aucun résultat pour ces critères."
        openScans={media === "manga"}
      />
    </div>
  );
}
