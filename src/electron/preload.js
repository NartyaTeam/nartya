const { contextBridge, ipcRenderer } = require('electron');

// Exposer l'API Electron de manière sécurisée
contextBridge.exposeInMainWorld('electronAPI', {
    // Extraction de vidéo depuis un embed
    extractVideoUrl: (embedUrl) => ipcRenderer.invoke('extract-video-url', embedUrl),

    // Extraction de plusieurs vidéos
    extractMultipleVideoUrls: (embedUrls) => ipcRenderer.invoke('extract-multiple-video-urls', embedUrls),

    // Recherche locale d'animes
    searchLocalAnimes: (query) => ipcRenderer.invoke('search-local-animes', query),

    // Récupérer les saisons d'un anime
    getAnimeSeasons: (animeId) => ipcRenderer.invoke('get-anime-seasons', animeId),

    // Récupérer les épisodes d'une saison
    getAnimeEpisodes: (animeId, seasonId) => ipcRenderer.invoke('get-anime-episodes', animeId, seasonId),

    // Récupérer les métadonnées des épisodes via AniList
    getEpisodeMetadata: (anilistId) => ipcRenderer.invoke('get-episode-metadata', anilistId),

    // Charger tous les animes
    loadAllAnimes: () => ipcRenderer.invoke('load-all-animes'),

    // Autres fonctions utiles pour l'application
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // Événements système
    onAppReady: (callback) => ipcRenderer.on('app-ready', callback),
    onAppError: (callback) => ipcRenderer.on('app-error', callback)
});
