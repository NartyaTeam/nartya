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

  // Historique de visionnage
  saveWatchProgress: (data) => ipcRenderer.invoke("save-watch-progress", data),
  getWatchProgress: (data) => ipcRenderer.invoke("get-watch-progress", data),
  getLastWatchedEpisode: (animeId) =>
    ipcRenderer.invoke("get-last-watched-episode", animeId),
  getRecentlyWatched: (limit) =>
    ipcRenderer.invoke("get-recently-watched", limit),
  markEpisodeCompleted: (data) =>
    ipcRenderer.invoke("mark-episode-completed", data),
  isEpisodeCompleted: (data) =>
    ipcRenderer.invoke("is-episode-completed", data),
  clearWatchHistory: () => ipcRenderer.invoke("clear-watch-history"),

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

  // Autres fonctions utiles pour l'application
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),

  // Événements système
  onAppReady: (callback) => ipcRenderer.on("app-ready", callback),
  onAppError: (callback) => ipcRenderer.on("app-error", callback),
});
