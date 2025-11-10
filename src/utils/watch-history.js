/**
 * Gestionnaire de l'historique de visionnage
 * Gère l'enregistrement et la récupération de l'historique
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("./config");

class WatchHistoryManager {
  constructor() {
    this.historyFile = path.join(CONFIG.DATA_DIR, "watch-history.json");
    this.ensureFileExists();
  }

  /**
   * S'assure que le fichier d'historique existe
   */
  ensureFileExists() {
    if (!fs.existsSync(this.historyFile)) {
      fs.writeFileSync(this.historyFile, JSON.stringify([], null, 2));
    }
  }

  /**
   * Récupère tout l'historique
   * @returns {Array} Liste des entrées d'historique
   */
  getHistory() {
    try {
      const data = fs.readFileSync(this.historyFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Erreur lors de la lecture de l'historique:", error);
      return [];
    }
  }

  /**
   * Ajoute ou met à jour une entrée dans l'historique
   * @param {Object} entry - Entrée d'historique
   * @returns {Object} Résultat de l'opération
   */
  addOrUpdateEntry(entry) {
    try {
      let history = this.getHistory();

      // Chercher si l'anime/épisode existe déjà
      const existingIndex = history.findIndex(
        (h) =>
          h.animeId === entry.animeId &&
          h.seasonId === entry.seasonId &&
          h.episodeNumber === entry.episodeNumber
      );

      const now = new Date().toISOString();

      if (existingIndex !== -1) {
        // Mettre à jour l'entrée existante
        history[existingIndex] = {
          ...history[existingIndex],
          ...entry,
          lastWatchedAt: now,
          watchCount: (history[existingIndex].watchCount || 0) + 1,
          // Mettre à jour la progression si fournie
          currentTime:
            entry.currentTime !== undefined
              ? entry.currentTime
              : history[existingIndex].currentTime,
          duration:
            entry.duration !== undefined
              ? entry.duration
              : history[existingIndex].duration,
          progressPercent:
            entry.progressPercent !== undefined
              ? entry.progressPercent
              : history[existingIndex].progressPercent,
          completed:
            entry.completed !== undefined
              ? entry.completed
              : history[existingIndex].completed,
        };
      } else {
        // Créer une nouvelle entrée
        history.unshift({
          ...entry,
          firstWatchedAt: now,
          lastWatchedAt: now,
          watchCount: 1,
          currentTime: entry.currentTime || 0,
          duration: entry.duration || 0,
          progressPercent: entry.progressPercent || 0,
          completed: entry.completed || false,
        });
      }

      // Limiter l'historique à 1000 entrées
      if (history.length > 1000) {
        history = history.slice(0, 1000);
      }

      fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));

      return {
        success: true,
        message: "Historique mis à jour",
      };
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'historique:", error);
      return {
        success: false,
        message: "Erreur lors de la mise à jour",
        error: error.message,
      };
    }
  }

  /**
   * Récupère l'historique d'un anime spécifique
   * @param {string} animeId - ID de l'anime
   * @returns {Array} Entrées d'historique pour cet anime
   */
  getAnimeHistory(animeId) {
    const history = this.getHistory();
    return history.filter((h) => h.animeId === animeId);
  }

  /**
   * Récupère le dernier épisode regardé d'un anime
   * @param {string} animeId - ID de l'anime
   * @returns {Object|null} Dernière entrée ou null
   */
  getLastWatchedEpisode(animeId) {
    const animeHistory = this.getAnimeHistory(animeId);
    if (animeHistory.length === 0) return null;

    // Trier par date de visionnage
    return animeHistory.sort(
      (a, b) => new Date(b.lastWatchedAt) - new Date(a.lastWatchedAt)
    )[0];
  }

  /**
   * Récupère les animes récemment regardés
   * @param {number} limit - Nombre d'animes à retourner
   * @returns {Array} Liste des animes récents
   */
  getRecentlyWatched(limit = 20) {
    const history = this.getHistory();

    // Grouper par anime et garder le plus récent
    const animeMap = new Map();

    history.forEach((entry) => {
      if (
        !animeMap.has(entry.animeId) ||
        new Date(entry.lastWatchedAt) >
          new Date(animeMap.get(entry.animeId).lastWatchedAt)
      ) {
        animeMap.set(entry.animeId, entry);
      }
    });

    // Convertir en array et trier par date
    return Array.from(animeMap.values())
      .sort((a, b) => new Date(b.lastWatchedAt) - new Date(a.lastWatchedAt))
      .slice(0, limit);
  }

  /**
   * Récupère les statistiques de visionnage
   * @returns {Object} Statistiques
   */
  getStatistics() {
    const history = this.getHistory();

    // Nombre total d'épisodes regardés
    const totalEpisodes = history.length;

    // Nombre d'animes différents
    const uniqueAnimes = new Set(history.map((h) => h.animeId)).size;

    // Temps total de visionnage (estimation : 24min par épisode)
    const totalMinutes = totalEpisodes * 24;
    const totalHours = Math.floor(totalMinutes / 60);

    // Anime le plus regardé
    const animeCount = {};
    history.forEach((h) => {
      animeCount[h.animeId] = (animeCount[h.animeId] || 0) + 1;
    });

    const mostWatchedAnimeId = Object.keys(animeCount).reduce(
      (a, b) => (animeCount[a] > animeCount[b] ? a : b),
      null
    );

    const mostWatchedAnime = mostWatchedAnimeId
      ? history.find((h) => h.animeId === mostWatchedAnimeId)
      : null;

    return {
      totalEpisodes,
      uniqueAnimes,
      totalHours,
      totalMinutes,
      mostWatchedAnime: mostWatchedAnime
        ? {
            id: mostWatchedAnime.animeId,
            title: mostWatchedAnime.animeTitle,
            episodesWatched: animeCount[mostWatchedAnimeId],
          }
        : null,
    };
  }

  /**
   * Supprime une entrée de l'historique
   * @param {string} animeId - ID de l'anime
   * @param {string} seasonId - ID de la saison
   * @param {number} episodeNumber - Numéro de l'épisode
   * @returns {Object} Résultat de l'opération
   */
  removeEntry(animeId, seasonId, episodeNumber) {
    try {
      let history = this.getHistory();

      history = history.filter(
        (h) =>
          !(
            h.animeId === animeId &&
            h.seasonId === seasonId &&
            h.episodeNumber === episodeNumber
          )
      );

      fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));

      return {
        success: true,
        message: "Entrée supprimée de l'historique",
      };
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      return {
        success: false,
        message: "Erreur lors de la suppression",
        error: error.message,
      };
    }
  }

  /**
   * Efface tout l'historique
   * @returns {Object} Résultat de l'opération
   */
  clearHistory() {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify([], null, 2));
      console.log("✅ Historique effacé");
      return {
        success: true,
        message: "Historique effacé",
      };
    } catch (error) {
      console.error("Erreur lors de l'effacement de l'historique:", error);
      return {
        success: false,
        message: "Erreur lors de l'effacement",
        error: error.message,
      };
    }
  }
}

module.exports = WatchHistoryManager;
