/**
 * Gestionnaire centralisé des handlers IPC
 * Gère toutes les communications entre le processus principal et le rendu
 */

const { ipcMain } = require('electron');
const path = require('path');
const VideoExtractor = require('./video-extractor');
const Scraper = require(path.join(__dirname, '..', 'scraper', 'index.js'));

class IPCHandlers {
    constructor() {
        this.videoExtractor = new VideoExtractor();
    }

    /**
     * Enregistre tous les handlers IPC
     */
    registerAll() {
        this.registerVideoExtraction();
        this.registerAnimeSearch();
        this.registerAnimeData();
    }

    /**
     * Handlers pour l'extraction vidéo
     */
    registerVideoExtraction() {
        ipcMain.handle('extract-video-url', async (event, embedUrl) => {
            return await this.videoExtractor.extractVideoUrl(embedUrl);
        });

        ipcMain.handle('extract-multiple-video-urls', async (event, embedUrls) => {
            return await this.videoExtractor.extractMultipleVideoUrls(embedUrls);
        });
    }

    /**
     * Handlers pour la recherche d'animes
     */
    registerAnimeSearch() {
        ipcMain.handle('search-local-animes', async (event, query) => {
            try {
                const animes = require(path.join(__dirname, '..', 'data', 'animes.json'));
                const results = animes.filter(anime => {
                    const name = anime.title?.romaji || anime.title?.english || anime.title?.native;
                    return typeof name === "string" && name.toLowerCase().includes(query.toLowerCase());
                });
                return { success: true, results };
            } catch (error) {
                console.error('Erreur lors de la recherche locale:', error);
                return { success: false, error: error.message };
            }
        });
    }

    /**
     * Handlers pour les données d'anime
     */
    registerAnimeData() {
        ipcMain.handle('get-anime-seasons', async (event, animeId) => {
            try {
                console.log(`Récupération des saisons pour l'anime: ${animeId}`);
                const seasons = await Scraper.getSeasons(animeId);
                return { success: true, seasons };
            } catch (error) {
                console.error('Erreur lors de la récupération des saisons:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-anime-episodes', async (event, animeId, seasonId) => {
            try {
                console.log(`Récupération des épisodes pour l'anime: ${animeId}, saison: ${seasonId}`);
                const episodes = await Scraper.getEpisodes(animeId, seasonId);
                console.log(animeId, seasonId);
                return { success: true, episodes };
            } catch (error) {
                console.error('Erreur lors de la récupération des épisodes:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-episode-metadata', async (event, anilistId) => {
            try {
                console.log(`Récupération des métadonnées pour l'AniList ID: ${anilistId}`);
                const response = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                return { success: true, metadata: data };
            } catch (error) {
                console.error('Erreur lors de la récupération des métadonnées:', error);
                return { success: false, error: error.message };
            }
        });
    }
}

module.exports = IPCHandlers;

