/**
 * Gestionnaire des favoris
 * Gère l'ajout, la suppression et la récupération des animes favoris
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("./config");

class FavoritesManager {
  constructor() {
    this.favoritesFile = path.join(CONFIG.DATA_DIR, "favorites.json");
    this.ensureFileExists();
  }

  /**
   * S'assure que le fichier des favoris existe
   */
  ensureFileExists() {
    if (!fs.existsSync(this.favoritesFile)) {
      fs.writeFileSync(this.favoritesFile, JSON.stringify([], null, 2));
    }
  }

  /**
   * Récupère tous les favoris
   * @returns {Array} Liste des animes favoris
   */
  getFavorites() {
    try {
      const data = fs.readFileSync(this.favoritesFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Erreur lors de la lecture des favoris:", error);
      return [];
    }
  }

  /**
   * Vérifie si un anime est dans les favoris
   * @param {string} animeId - ID ou slug de l'anime
   * @returns {boolean}
   */
  isFavorite(animeId) {
    const favorites = this.getFavorites();
    return favorites.some((fav) => fav.id === animeId || fav.slug === animeId);
  }

  /**
   * Ajoute un anime aux favoris
   * @param {Object} anime - Données de l'anime
   * @returns {Object} Résultat de l'opération
   */
  addFavorite(anime) {
    try {
      const favorites = this.getFavorites();

      // Vérifier si déjà en favoris
      if (this.isFavorite(anime.id || anime.slug)) {
        return {
          success: false,
          message: "Cet anime est déjà dans vos favoris",
        };
      }

      // Créer l'objet favori
      const favorite = {
        id: anime.id || anime.slug,
        slug: anime.slug,
        title: anime.title,
        coverImage: anime.coverImage || { large: anime.image, medium: anime.imageUrl },
        format: anime.format,
        synopsis: anime.synopsis,
        genres: anime.genres || [],
        status: anime.status,
        addedAt: new Date().toISOString(),
      };

      favorites.unshift(favorite); // Ajouter au début
      fs.writeFileSync(this.favoritesFile, JSON.stringify(favorites, null, 2));

      console.log(`✅ Anime ajouté aux favoris: ${anime.title}`);
      return {
        success: true,
        message: "Ajouté aux favoris !",
        favorite,
      };
    } catch (error) {
      console.error("Erreur lors de l'ajout aux favoris:", error);
      return {
        success: false,
        message: "Erreur lors de l'ajout aux favoris",
        error: error.message,
      };
    }
  }

  /**
   * Retire un anime des favoris
   * @param {string} animeId - ID ou slug de l'anime
   * @returns {Object} Résultat de l'opération
   */
  removeFavorite(animeId) {
    try {
      let favorites = this.getFavorites();
      const initialLength = favorites.length;

      favorites = favorites.filter(
        (fav) => fav.id !== animeId && fav.slug !== animeId
      );

      if (favorites.length === initialLength) {
        return {
          success: false,
          message: "Cet anime n'est pas dans vos favoris",
        };
      }

      fs.writeFileSync(this.favoritesFile, JSON.stringify(favorites, null, 2));

      console.log(`✅ Anime retiré des favoris: ${animeId}`);
      return {
        success: true,
        message: "Retiré des favoris !",
      };
    } catch (error) {
      console.error("Erreur lors du retrait des favoris:", error);
      return {
        success: false,
        message: "Erreur lors du retrait des favoris",
        error: error.message,
      };
    }
  }

  /**
   * Toggle le statut favori d'un anime
   * @param {Object} anime - Données de l'anime
   * @returns {Object} Résultat de l'opération
   */
  toggleFavorite(anime) {
    const animeId = anime.id || anime.slug;

    if (this.isFavorite(animeId)) {
      return this.removeFavorite(animeId);
    } else {
      return this.addFavorite(anime);
    }
  }

  /**
   * Récupère le nombre de favoris
   * @returns {number}
   */
  getFavoritesCount() {
    return this.getFavorites().length;
  }

  /**
   * Efface tous les favoris
   * @returns {Object} Résultat de l'opération
   */
  clearFavorites() {
    try {
      fs.writeFileSync(this.favoritesFile, JSON.stringify([], null, 2));
      console.log("✅ Tous les favoris ont été effacés");
      return {
        success: true,
        message: "Tous les favoris ont été effacés",
      };
    } catch (error) {
      console.error("Erreur lors de l'effacement des favoris:", error);
      return {
        success: false,
        message: "Erreur lors de l'effacement des favoris",
        error: error.message,
      };
    }
  }
}

module.exports = FavoritesManager;

