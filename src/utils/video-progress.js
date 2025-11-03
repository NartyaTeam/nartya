/**
 * Gestionnaire de progression vidéo
 * Stocke et récupère la progression de visionnage des épisodes
 */

const fs = require("fs");
const path = require("path");
const PATHS = require("./paths");
const logger = require("./logger");

class VideoProgressManager {
  constructor() {
    // Utiliser les fichiers .dev.json en mode développement
    const isDev =
      process.argv.includes("--dev") || process.env.NODE_ENV === "development";
    const fileName = isDev ? "video-progress.dev.json" : "video-progress.json";
    this.progressFilePath = path.join(PATHS.DATA, fileName);
    this.progress = this.loadProgress();

    if (isDev) {
      logger.log(
        "🔧 Mode développement: utilisation de video-progress.dev.json"
      );
    }
  }

  /**
   * Charge la progression depuis le fichier
   */
  loadProgress() {
    try {
      if (fs.existsSync(this.progressFilePath)) {
        const data = fs.readFileSync(this.progressFilePath, "utf8");
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error("Erreur lors du chargement de la progression:", error);
    }
    return {};
  }

  /**
   * Sauvegarde la progression dans le fichier
   */
  saveProgress() {
    try {
      fs.writeFileSync(
        this.progressFilePath,
        JSON.stringify(this.progress, null, 2),
        "utf8"
      );
    } catch (error) {
      logger.error("Erreur lors de la sauvegarde de la progression:", error);
    }
  }

  /**
   * Génère une clé unique pour un épisode
   */
  getEpisodeKey(animeId, seasonId, episodeIndex) {
    return `${animeId}:${seasonId}:${episodeIndex}`;
  }

  /**
   * Enregistre la progression d'un épisode
   * @param {string} animeId - ID de l'anime
   * @param {string} seasonId - ID de la saison
   * @param {number} episodeIndex - Index de l'épisode (0-based)
   * @param {number} currentTime - Temps actuel en secondes
   * @param {number} duration - Durée totale en secondes
   * @param {object} animeInfo - Informations supplémentaires sur l'anime
   */
  saveEpisodeProgress(
    animeId,
    seasonId,
    episodeIndex,
    currentTime,
    duration,
    animeInfo = {}
  ) {
    const key = this.getEpisodeKey(animeId, seasonId, episodeIndex);

    // Ne sauvegarder que si la progression est significative (> 5% et < 95%)
    const progressPercent = (currentTime / duration) * 100;

    if (progressPercent < 5 || progressPercent > 95) {
      // Si < 5%, considérer comme non commencé
      // Si > 95%, considérer comme terminé et supprimer
      if (this.progress[key]) {
        delete this.progress[key];
        this.saveProgress();
      }
      return;
    }

    this.progress[key] = {
      animeId,
      seasonId,
      episodeIndex,
      episodeNumber: episodeIndex + 1,
      currentTime,
      duration,
      progressPercent: Math.round(progressPercent),
      lastWatched: Date.now(),
      animeTitle: animeInfo.title || "Anime",
      animeCover: animeInfo.cover || null,
      seasonName: animeInfo.seasonName || "Saison 1",
    };

    this.saveProgress();
    logger.log(
      `📊 Progression sauvegardée: ${animeInfo.title} - Épisode ${
        episodeIndex + 1
      } (${Math.round(progressPercent)}%)`
    );
  }

  /**
   * Récupère la progression d'un épisode
   */
  getEpisodeProgress(animeId, seasonId, episodeIndex) {
    const key = this.getEpisodeKey(animeId, seasonId, episodeIndex);
    return this.progress[key] || null;
  }

  /**
   * Récupère toutes les progressions pour un anime
   */
  getAnimeProgress(animeId) {
    const animeProgress = {};

    for (const [key, data] of Object.entries(this.progress)) {
      if (data.animeId === animeId) {
        animeProgress[key] = data;
      }
    }

    return animeProgress;
  }

  /**
   * Récupère toutes les progressions triées par date
   */
  getAllProgress() {
    const progressArray = Object.values(this.progress);

    // Trier par date de visionnage (plus récent en premier)
    progressArray.sort((a, b) => b.lastWatched - a.lastWatched);

    return progressArray;
  }

  /**
   * Supprime la progression d'un épisode
   */
  deleteEpisodeProgress(animeId, seasonId, episodeIndex) {
    const key = this.getEpisodeKey(animeId, seasonId, episodeIndex);

    if (this.progress[key]) {
      delete this.progress[key];
      this.saveProgress();
      logger.log(
        `🗑️ Progression supprimée: ${animeId} - Épisode ${episodeIndex + 1}`
      );
    }
  }

  /**
   * Supprime toutes les progressions d'un anime
   */
  deleteAnimeProgress(animeId) {
    let deleted = 0;

    for (const key of Object.keys(this.progress)) {
      if (this.progress[key].animeId === animeId) {
        delete this.progress[key];
        deleted++;
      }
    }

    if (deleted > 0) {
      this.saveProgress();
      logger.log(`🗑️ ${deleted} progression(s) supprimée(s) pour ${animeId}`);
    }
  }

  /**
   * Nettoie les anciennes progressions (> 30 jours)
   */
  cleanOldProgress(daysOld = 30) {
    const cutoffDate = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [key, data] of Object.entries(this.progress)) {
      if (data.lastWatched < cutoffDate) {
        delete this.progress[key];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.saveProgress();
      logger.log(`🧹 ${cleaned} progression(s) ancienne(s) nettoyée(s)`);
    }

    return cleaned;
  }
}

module.exports = new VideoProgressManager();
