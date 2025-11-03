/**
 * Gestionnaire centralisé des handlers IPC
 * Gère toutes les communications entre le processus principal et le rendu
 */

const { ipcMain } = require("electron");
const path = require("path");
const VideoExtractor = require("./video-extractor");
const Scraper = require(path.join(__dirname, "..", "scraper", "index.js"));
const WatchHistoryManager = require(path.join(
  __dirname,
  "..",
  "utils",
  "watch-history.js"
));
const VideoProgressManager = require(path.join(
  __dirname,
  "..",
  "utils",
  "video-progress.js"
));

class IPCHandlers {
  constructor() {
    this.videoExtractor = new VideoExtractor();
    this.watchHistory = new WatchHistoryManager();
    this.videoProgress = VideoProgressManager;
  }

  /**
   * Enregistre tous les handlers IPC
   */
  registerAll() {
    this.registerVideoExtraction();
    this.registerAnimeSearch();
    this.registerAnimeData();
    this.registerWatchHistory();
    this.registerVideoProgress();
  }

  /**
   * Handlers pour l'extraction vidéo
   */
  registerVideoExtraction() {
    ipcMain.handle("extract-video-url", async (event, embedUrl) => {
      return await this.videoExtractor.extractVideoUrl(embedUrl);
    });

    ipcMain.handle("extract-multiple-video-urls", async (event, embedUrls) => {
      return await this.videoExtractor.extractMultipleVideoUrls(embedUrls);
    });
  }

  /**
   * Handlers pour la recherche d'animes
   */
  registerAnimeSearch() {
    ipcMain.handle("search-local-animes", async (event, query) => {
      try {
        const animesPath = path.join(__dirname, "..", "data", "animes.json");
        const fs = require("fs");

        // Vérifier que le fichier existe
        if (!fs.existsSync(animesPath)) {
          console.error("❌ Fichier animes.json introuvable");
          return {
            success: false,
            error: "Base de données introuvable",
            userMessage:
              "La base de données des animes n'a pas été trouvée. Veuillez réinstaller l'application.",
          };
        }

        // Lire et parser le fichier avec gestion d'erreurs
        let animes;
        try {
          const fileContent = fs.readFileSync(animesPath, "utf8");
          animes = JSON.parse(fileContent);

          // Vérifier que c'est bien un tableau
          if (!Array.isArray(animes)) {
            throw new Error("Format de données invalide");
          }

          // Vérifier qu'il n'est pas vide
          if (animes.length === 0) {
            console.warn("⚠️ Base de données vide");
            return {
              success: false,
              error: "Base de données vide",
              userMessage:
                "La base de données ne contient aucun anime. Veuillez lancer le scraper (npm run scrape).",
            };
          }
        } catch (parseError) {
          console.error("❌ Erreur de parsing JSON:", parseError);
          return {
            success: false,
            error: "Fichier corrompu",
            userMessage:
              "La base de données est corrompue. Veuillez relancer le scraper (npm run scrape) ou réinstaller l'application.",
          };
        }

        // Filtrer les résultats
        const results = animes.filter((anime) => {
          const name =
            anime.title?.romaji || anime.title?.english || anime.title?.native;
          return (
            typeof name === "string" &&
            name.toLowerCase().includes(query.toLowerCase())
          );
        });

        return { success: true, results };
      } catch (error) {
        console.error("Erreur lors de la recherche locale:", error);
        return {
          success: false,
          error: error.message,
          userMessage:
            "Une erreur inattendue s'est produite lors de la recherche.",
        };
      }
    });
  }

  /**
   * Handlers pour les données d'anime
   */
  registerAnimeData() {
    ipcMain.handle("get-anime-seasons", async (event, animeId) => {
      try {
        console.log(`Récupération des saisons pour l'anime: ${animeId}`);
        const seasons = await Scraper.getSeasons(animeId);
        return { success: true, seasons };
      } catch (error) {
        console.error("Erreur lors de la récupération des saisons:", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("get-anime-episodes", async (event, animeId, seasonId) => {
      try {
        console.log(
          `Récupération des épisodes pour l'anime: ${animeId}, saison: ${seasonId}`
        );
        const episodes = await Scraper.getEpisodes(animeId, seasonId);
        console.log(animeId, seasonId);
        return { success: true, episodes };
      } catch (error) {
        console.error("Erreur lors de la récupération des épisodes:", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("get-episode-metadata", async (event, anilistId) => {
      try {
        console.log(
          `Récupération des métadonnées pour l'AniList ID: ${anilistId}`
        );
        const response = await fetch(
          `https://api.ani.zip/mappings?anilist_id=${anilistId}`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return { success: true, metadata: data };
      } catch (error) {
        console.error("Erreur lors de la récupération des métadonnées:", error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Handlers pour l'historique de visionnage
   */
  registerWatchHistory() {
    // Sauvegarder la progression
    ipcMain.handle(
      "save-watch-progress",
      async (event, { animeId, episodeNumber, currentTime, duration }) => {
        this.watchHistory.saveProgress(
          animeId,
          episodeNumber,
          currentTime,
          duration
        );
        return { success: true };
      }
    );

    // Récupérer la progression d'un épisode
    ipcMain.handle(
      "get-watch-progress",
      async (event, { animeId, episodeNumber }) => {
        return this.watchHistory.getProgress(animeId, episodeNumber);
      }
    );

    // Récupérer le dernier épisode regardé
    ipcMain.handle("get-last-watched-episode", async (event, animeId) => {
      return this.watchHistory.getLastWatchedEpisode(animeId);
    });

    // Récupérer les animes récemment regardés
    ipcMain.handle("get-recently-watched", async (event, limit) => {
      return this.watchHistory.getRecentlyWatched(limit);
    });

    // Marquer comme complété
    ipcMain.handle(
      "mark-episode-completed",
      async (event, { animeId, episodeNumber }) => {
        this.watchHistory.markAsCompleted(animeId, episodeNumber);
        return { success: true };
      }
    );

    // Vérifier si complété
    ipcMain.handle(
      "is-episode-completed",
      async (event, { animeId, episodeNumber }) => {
        return this.watchHistory.isCompleted(animeId, episodeNumber);
      }
    );

    // Effacer tout l'historique
    ipcMain.handle("clear-watch-history", async (event) => {
      try {
        this.watchHistory.clearAll();
        return { success: true };
      } catch (error) {
        console.error("Erreur lors de l'effacement de l'historique:", error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Handlers pour la progression vidéo détaillée
   */
  registerVideoProgress() {
    // Sauvegarder la progression d'un épisode
    ipcMain.handle(
      "save-video-progress",
      async (
        event,
        { animeId, seasonId, episodeIndex, currentTime, duration, animeInfo }
      ) => {
        try {
          this.videoProgress.saveEpisodeProgress(
            animeId,
            seasonId,
            episodeIndex,
            currentTime,
            duration,
            animeInfo
          );
          return { success: true };
        } catch (error) {
          console.error(
            "Erreur lors de la sauvegarde de la progression:",
            error
          );
          return { success: false, error: error.message };
        }
      }
    );

    // Récupérer la progression d'un épisode
    ipcMain.handle(
      "get-video-progress",
      async (event, { animeId, seasonId, episodeIndex }) => {
        try {
          const progress = this.videoProgress.getEpisodeProgress(
            animeId,
            seasonId,
            episodeIndex
          );
          return { success: true, progress };
        } catch (error) {
          console.error(
            "Erreur lors de la récupération de la progression:",
            error
          );
          return { success: false, error: error.message };
        }
      }
    );

    // Récupérer toutes les progressions d'un anime
    ipcMain.handle("get-anime-progress", async (event, animeId) => {
      try {
        const progress = this.videoProgress.getAnimeProgress(animeId);
        return { success: true, progress };
      } catch (error) {
        console.error(
          "Erreur lors de la récupération de la progression:",
          error
        );
        return { success: false, error: error.message };
      }
    });

    // Récupérer toutes les progressions (récents)
    ipcMain.handle("get-all-video-progress", async (event) => {
      try {
        const progress = this.videoProgress.getAllProgress();
        return { success: true, progress };
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des progressions:",
          error
        );
        return { success: false, error: error.message };
      }
    });

    // Supprimer la progression d'un épisode
    ipcMain.handle(
      "delete-video-progress",
      async (event, { animeId, seasonId, episodeIndex }) => {
        try {
          this.videoProgress.deleteEpisodeProgress(
            animeId,
            seasonId,
            episodeIndex
          );
          return { success: true };
        } catch (error) {
          console.error(
            "Erreur lors de la suppression de la progression:",
            error
          );
          return { success: false, error: error.message };
        }
      }
    );

    // Nettoyer les anciennes progressions
    ipcMain.handle("clean-old-progress", async (event, daysOld) => {
      try {
        const cleaned = this.videoProgress.cleanOldProgress(daysOld);
        return { success: true, cleaned };
      } catch (error) {
        console.error("Erreur lors du nettoyage:", error);
        return { success: false, error: error.message };
      }
    });
  }
}

module.exports = IPCHandlers;
