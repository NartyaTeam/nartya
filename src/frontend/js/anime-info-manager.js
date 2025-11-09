/**
 * Gestionnaire des informations d'anime
 * Gère le chargement et l'affichage des informations d'un anime
 */

export class AnimeInfoManager {
  constructor(electronAPI) {
    this.electronAPI = electronAPI;
    this.currentAnime = null;
    this.currentSeason = null;
  }

  async loadAnimeInfo(animeId) {
    try {
      console.log("🔍 loadAnimeInfo appelé avec animeId:", animeId);

      const animes = await this.electronAPI.searchLocalAnimes("");
      console.log("📚 Nombre d'animes chargés:", animes.results?.length);

      const anime = animes.results.find(
        (a) => a.slug === animeId || a.id == animeId || String(a.id) === animeId
      );
      console.log("🔎 Recherche anime avec slug ou id:", animeId);
      console.log(
        "🎯 Anime trouvé:",
        anime
          ? {
              id: anime.id,
              slug: anime.slug,
              title: anime.title?.romaji,
            }
          : "NON TROUVÉ"
      );

      if (!anime) {
        throw new Error("Anime non trouvé");
      }

      this.currentAnime = anime;
      console.log("✅ currentAnime défini:", this.currentAnime.slug);
      return { success: true, anime };
    } catch (error) {
      console.error("❌ Erreur lors du chargement:", error);
      return { success: false, error: error.message };
    }
  }

  displayAnimeInfo(anime) {
    const title =
      anime.title?.romaji ||
      anime.title?.english ||
      anime.title?.native ||
      "Titre inconnu";
    const englishTitle = anime.title?.english || "";
    const nativeTitle = anime.title?.native || "";
    const image = anime.coverImage?.large || anime.coverImage?.medium || "";
    const format = anime.format || "";
    const synopsis = anime.synopsis || "Aucune description disponible.";

    return `
            <div class="anime-info">
                ${
                  image
                    ? `<img src="${image}" alt="${title}" class="anime-poster" />`
                    : ""
                }
                <div class="anime-details">
                    <h1 class="anime-title">${title}</h1>
                    ${
                      englishTitle && englishTitle !== title
                        ? `<div class="anime-subtitle">${englishTitle}</div>`
                        : ""
                    }
                    ${
                      nativeTitle &&
                      nativeTitle !== title &&
                      nativeTitle !== englishTitle
                        ? `<div class="anime-native">${nativeTitle}</div>`
                        : ""
                    }
                    ${format ? `<div class="anime-format">${format}</div>` : ""}
                    <div class="anime-synopsis">${synopsis}</div>
                </div>
            </div>
            <div class="seasons-section">
                <h2 class="seasons-title">Saisons</h2>
                <div id="seasonsContainer">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        <div>Chargement des saisons...</div>
                    </div>
                </div>
            </div>
        `;
  }

  async loadSeasons(animeId) {
    try {
      console.log("🔍 loadSeasons appelé avec animeId:", animeId);

      // Utiliser le slug de l'anime trouvé au lieu de l'animeId passé
      // car le scraper a besoin du slug, pas de l'ID AniList
      if (!this.currentAnime) {
        console.error("❌ currentAnime est null ou undefined");
        throw new Error("Anime non chargé");
      }

      console.log("✅ currentAnime:", {
        id: this.currentAnime.id,
        slug: this.currentAnime.slug,
        title: this.currentAnime.title?.romaji,
      });

      const slug = this.currentAnime.slug;
      if (!slug) {
        console.error("❌ Slug non trouvé dans currentAnime");
        throw new Error("Slug de l'anime non trouvé");
      }

      console.log("🔍 Appel de getAnimeSeasons avec slug:", slug);
      const result = await this.electronAPI.getAnimeSeasons(slug);
      console.log("📦 Résultat de getAnimeSeasons:", result);

      if (result.success) {
        console.log("✅ Saisons chargées:", result.seasons.length, "saison(s)");
        return { success: true, seasons: result.seasons };
      } else {
        console.error("❌ Échec du chargement des saisons:", result.error);
        throw new Error(
          result.error || "Erreur lors du chargement des saisons"
        );
      }
    } catch (error) {
      console.error("❌ Erreur lors du chargement des saisons:", error);
      return { success: false, error: error.message };
    }
  }

  displaySeasons(seasons) {
    if (!seasons || seasons.length === 0) {
      return `
                <div class="error">
                    <div class="error-icon">📺</div>
                    <div>Aucune saison disponible pour cet anime.</div>
                </div>
            `;
    }

    return `
            <select id="seasonSelect" class="season-selector" style="display: none;">
                ${seasons
                  .map(
                    (season, index) => `
                    <option value="${season.id}" data-name="${season.name}" ${
                      index === 0 ? "selected" : ""
                    }>
                        ${season.name}
                    </option>
                `
                  )
                  .join("")}
            </select>
            <div id="episodesContainer">
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div>Chargement des épisodes...</div>
                </div>
            </div>
        `;
  }

  setCurrentSeason(seasonId, seasonName) {
    this.currentSeason = { id: seasonId, name: seasonName };
  }

  getCurrentAnime() {
    return this.currentAnime;
  }

  getCurrentSeason() {
    return this.currentSeason;
  }
}
