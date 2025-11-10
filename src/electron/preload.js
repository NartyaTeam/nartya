const { contextBridge, ipcRenderer } = require("electron");

// Exposer l'API Electron de manière sécurisée
contextBridge.exposeInMainWorld("electronAPI", {
  // Extraction de vidéo depuis un embed
  extractVideoUrl: (embedUrl) =>
    ipcRenderer.invoke("extract-video-url", embedUrl),

  // Extraction de plusieurs vidéos
  extractMultipleVideoUrls: (embedUrls) =>
    ipcRenderer.invoke("extract-multiple-video-urls", embedUrls),

  // Recherche locale d'animes
  searchLocalAnimes: (query) =>
    ipcRenderer.invoke("search-local-animes", query),

  // Récupérer les saisons d'un anime
  getAnimeSeasons: (animeId) =>
    ipcRenderer.invoke("get-anime-seasons", animeId),

  // Récupérer les épisodes d'une saison
  getAnimeEpisodes: (animeId, seasonId) =>
    ipcRenderer.invoke("get-anime-episodes", animeId, seasonId),

  // Récupérer les métadonnées des épisodes via AniList
  getEpisodeMetadata: (anilistId) =>
    ipcRenderer.invoke("get-episode-metadata", anilistId),

  // Charger tous les animes
  loadAllAnimes: () => ipcRenderer.invoke("load-all-animes"),

  // Ancien système d'historique supprimé - utiliser VideoProgressManager et WatchHistoryManager à la place

  // Progression vidéo détaillée
  saveVideoProgress: (data) => ipcRenderer.invoke("save-video-progress", data),
  getVideoProgress: (data) => ipcRenderer.invoke("get-video-progress", data),
  getAnimeProgress: (animeId) =>
    ipcRenderer.invoke("get-anime-progress", animeId),
  getAllVideoProgress: () => ipcRenderer.invoke("get-all-video-progress"),
  deleteVideoProgress: (data) =>
    ipcRenderer.invoke("delete-video-progress", data),
  cleanOldProgress: (daysOld) =>
    ipcRenderer.invoke("clean-old-progress", daysOld),

  // Rafraîchissement de la base de données
  refreshAnimeDatabase: () => ipcRenderer.invoke("refresh-anime-database"),
  isRefreshing: () => ipcRenderer.invoke("is-refreshing"),
  onRefreshProgress: (callback) => {
    ipcRenderer.on("refresh-progress", (event, progress) => callback(progress));
  },
  removeRefreshProgressListener: () => {
    ipcRenderer.removeAllListeners("refresh-progress");
  },

  // Mises à jour automatiques
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),

  // Événements de mise à jour
  onUpdateChecking: (callback) => {
    ipcRenderer.on("update-checking", () => callback());
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update-available", (event, info) => callback(info));
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on("update-not-available", (event, info) => callback(info));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on("update-error", (event, error) => callback(error));
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on("update-download-progress", (event, progress) =>
      callback(progress)
    );
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on("update-downloaded", (event, info) => callback(info));
  },
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners("update-checking");
    ipcRenderer.removeAllListeners("update-available");
    ipcRenderer.removeAllListeners("update-not-available");
    ipcRenderer.removeAllListeners("update-error");
    ipcRenderer.removeAllListeners("update-download-progress");
    ipcRenderer.removeAllListeners("update-downloaded");
  },

  // Favoris
  getFavorites: () => ipcRenderer.invoke("get-favorites"),
  isFavorite: (animeId) => ipcRenderer.invoke("is-favorite", animeId),
  addFavorite: (anime) => ipcRenderer.invoke("add-favorite", anime),
  removeFavorite: (animeId) => ipcRenderer.invoke("remove-favorite", animeId),
  toggleFavorite: (anime) => ipcRenderer.invoke("toggle-favorite", anime),
  getFavoritesCount: () => ipcRenderer.invoke("get-favorites-count"),
  clearFavorites: () => ipcRenderer.invoke("clear-favorites"),

  // Historique de visionnage avancé
  addWatchHistoryEntry: (entry) =>
    ipcRenderer.invoke("add-watch-history-entry", entry),
  getWatchHistory: () => ipcRenderer.invoke("get-watch-history"),
  getAnimeWatchHistory: (animeId) =>
    ipcRenderer.invoke("get-anime-watch-history", animeId),
  getWatchStatistics: () => ipcRenderer.invoke("get-watch-statistics"),
  removeWatchHistoryEntry: (animeId, seasonId, episodeNumber) =>
    ipcRenderer.invoke("remove-watch-history-entry", {
      animeId,
      seasonId,
      episodeNumber,
    }),
  clearAllWatchHistory: () => ipcRenderer.invoke("clear-all-watch-history"),

  // Événements système
  onAppReady: (callback) => ipcRenderer.on("app-ready", callback),
  onAppError: (callback) => ipcRenderer.on("app-error", callback),
});
