import { useEffect, useState } from "react";
import AnimeRow from "./AnimeRow";
import { searchCatalog } from "@/api/animeApi";
import { useSettingsStore } from "@/stores/useSettingsStore";

const ROWS_SHOWN = 3;
// `${media}:${genre}` → items : instantané au retour sur l'accueil.
const cache = new Map();

/** Les thèmes du jour : la sélection tourne d'un jour à l'autre quand il y en a plus de trois. */
function pickForToday(genres) {
  if (genres.length <= ROWS_SHOWN) return genres;
  const day = Math.floor(Date.now() / 86_400_000);
  return Array.from({ length: ROWS_SHOWN }, (_, i) => genres[(day + i) % genres.length]);
}

/** Une rangée par thème préféré (Paramètres › Mes thèmes préférés), les mieux notés d'abord. */
export default function FavoriteGenresRows({ media = "anime" }) {
  const favorites = useSettingsStore((s) => s.favoriteGenres) || [];
  const picked = pickForToday(favorites);
  const pickedKey = picked.join("|");
  const [rows, setRows] = useState(() =>
    picked.map((g) => ({ genre: g, items: cache.get(`${media}:${g}`) || null }))
  );

  useEffect(() => {
    let alive = true;
    const genres = pickedKey ? pickedKey.split("|") : [];
    setRows(genres.map((g) => ({ genre: g, items: cache.get(`${media}:${g}`) || null })));
    genres.forEach((genre) => {
      const key = `${media}:${genre}`;
      if (cache.has(key)) return;
      searchCatalog({ media, genres: [genre], sort: "score", verifiedOnly: media === "anime" })
        .then((items) => {
          // Forme des cartes de l'accueil : `id` pour la clé, `cover` pour l'affiche.
          const list = (items || []).slice(0, 24).map((a) => ({ ...a, id: a.slug, cover: a.cover || a.image }));
          cache.set(key, list);
          if (alive) setRows((prev) => prev.map((r) => (r.genre === genre ? { ...r, items: list } : r)));
        })
        .catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [media, pickedKey]);

  return rows
    .filter((r) => r.items?.length)
    .map((r) => (
      <AnimeRow
        key={r.genre}
        title={`Parce que tu aimes ${r.genre}`}
        items={r.items}
        variant={media === "manga" ? "manga" : undefined}
      />
    ));
}
