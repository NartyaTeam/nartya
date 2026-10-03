import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { Tag } from "lucide-react";
import { getAnimesByGenre } from "@/api/animeApi";
import CatalogResults from "@/components/catalog/CatalogResults";

export default function GenrePage() {
  const { genre } = useParams();
  const fetchPage = useCallback((page) => getAnimesByGenre(genre, page), [genre]);

  const decoded = (() => {
    try {
      return decodeURIComponent(genre || "");
    } catch {
      return genre || "";
    }
  })();

  return (
    <div className="animate-fade-in mx-auto max-w-[1600px] px-4 pb-10 pt-24 sm:px-8">
      <div className="mb-8 flex items-center gap-3">
        <Tag size={24} className="text-primary" />
        <div>
          <h1 className="font-display text-2xl font-extrabold text-glow sm:text-3xl">{decoded}</h1>
          <p className="mt-1 text-sm text-muted">Animes du genre « {decoded} ».</p>
        </div>
      </div>

      <CatalogResults
        fetchPage={fetchPage}
        resetKey={genre}
        emptyLabel="Aucun anime pour ce genre."
        cardProps={{ highlightedGenres: [decoded] }}
      />
    </div>
  );
}
