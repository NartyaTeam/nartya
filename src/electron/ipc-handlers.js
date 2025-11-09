/**
 * Gestionnaire centralisé des handlers IPC
 * Gère toutes les communications entre le processus principal et le rendu
 */

const { ipcMain, app } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const VideoExtractor = require("./video-extractor");
const Scraper = require(path.join(__dirname, "..", "scraper", "index.js"));
const indexer = require(path.join(__dirname, "..", "scraper", "indexer.js"));
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
const FavoritesManager = require(path.join(
  __dirname,
  "..",
  "utils",
  "favorites.js"
));

class IPCHandlers {
  constructor() {
    this.videoExtractor = new VideoExtractor();
    this.watchHistory = new WatchHistoryManager();
    this.videoProgress = VideoProgressManager;
    this.favorites = new FavoritesManager();
    this.isRefreshing = false; // Pour éviter les refresh multiples simultanés
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
    this.registerDataRefresh();
    this.registerUpdater();
    this.registerFavorites();
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

  /**
   * Handlers pour le rafraîchissement des données
   */
  registerDataRefresh() {
    // Rafraîchir la base de données d'animes
    ipcMain.handle("refresh-anime-database", async (event) => {
      if (this.isRefreshing) {
        return {
          success: false,
          error: "Un rafraîchissement est déjà en cours",
        };
      }

      this.isRefreshing = true;

      try {
        console.log("🔄 Début du rafraîchissement de la base de données...");

        // 1. Récupérer la liste des animes depuis Anime-Sama
        console.log("📡 Récupération de la liste des animes...");
        const animes = await Scraper.getAnimes();
        console.log(`✅ ${animes.length} animes trouvés sur Anime-Sama`);

        // 2. Indexer les nouveaux animes
        console.log("📝 Indexation des nouveaux animes...");
        const result = await indexer(animes, (progress) => {
          // Envoyer la progression au frontend
          event.sender.send("refresh-progress", progress);
        });

        this.isRefreshing = false;
        return result;
      } catch (error) {
        console.error("❌ Erreur lors du rafraîchissement:", error);
        this.isRefreshing = false;
        return {
          success: false,
          error: error.message,
        };
      }
    });

    // Vérifier si un rafraîchissement est en cours
    ipcMain.handle("is-refreshing", async () => {
      return { isRefreshing: this.isRefreshing };
    });
  }

  /**
   * Handlers pour les mises à jour automatiques
   */
  registerUpdater() {
    // Obtenir la version actuelle de l'application
    ipcMain.handle("get-app-version", async () => {
      return app.getVersion();
    });

    // Vérifier les mises à jour manuellement
    ipcMain.handle("check-for-updates", async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        return {
          success: true,
          updateInfo: result?.updateInfo || null,
        };
      } catch (error) {
        console.error(
          "Erreur lors de la vérification des mises à jour:",
          error
        );
        return {
          success: false,
          error: error.message,
        };
      }
    });

    // Télécharger la mise à jour
    ipcMain.handle("download-update", async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        console.error("Erreur lors du téléchargement:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    });

    // Installer et redémarrer
    ipcMain.handle("install-update", async () => {
      try {
        autoUpdater.quitAndInstall(false, true);
        return { success: true };
      } catch (error) {
        console.error("Erreur lors de l'installation:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    });
  }

  /**
   * Handlers pour les favoris
   */
  registerFavorites() {
    // Récupérer tous les favoris
    ipcMain.handle("get-favorites", async () => {
      try {
        const favorites = this.favorites.getFavorites();
        return {
          success: true,
          favorites,
        };
      } catch (error) {
        console.error("Erreur lors de la récupération des favoris:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    });

    // Vérifier si un anime est en favoris
    ipcMain.handle("is-favorite", async (event, animeId) => {
      try {
        const isFavorite = this.favorites.isFavorite(animeId);
        return {
          success: true,
          isFavorite,
        };
      } catch (error) {
        console.error("Erreur lors de la vérification des favoris:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    });

    // Ajouter aux favoris
    ipcMain.handle("add-favorite", async (event, anime) => {
      return this.favorites.addFavorite(anime);
    });

    // Retirer des favoris
    ipcMain.handle("remove-favorite", async (event, animeId) => {
      return this.favorites.removeFavorite(animeId);
    });

    // Toggle favori
    ipcMain.handle("toggle-favorite", async (event, anime) => {
      return this.favorites.toggleFavorite(anime);
    });

    // Obtenir le nombre de favoris
    ipcMain.handle("get-favorites-count", async () => {
      try {
        const count = this.favorites.getFavoritesCount();
        return {
          success: true,
          count,
        };
      } catch (error) {
        console.error("Erreur lors du comptage des favoris:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    });

    // Effacer tous les favoris
    ipcMain.handle("clear-favorites", async () => {
      return this.favorites.clearFavorites();
    });
  }
}

module.exports = IPCHandlers;
