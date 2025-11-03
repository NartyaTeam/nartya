const fs = require('fs');
const path = require('path');

class WatchHistoryManager {
    constructor() {
        this.historyPath = path.join(__dirname, '..', 'data', 'watch-history.json');
        this.history = this.loadHistory();
    }

    loadHistory() {
        try {
            if (fs.existsSync(this.historyPath)) {
                const data = fs.readFileSync(this.historyPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Erreur lors du chargement de l\'historique:', error);
        }
        return {};
    }

    saveHistory() {
        try {
            const dir = path.dirname(this.historyPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2), 'utf8');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde de l\'historique:', error);
        }
    }

    // Sauvegarder la progression d'un épisode
    saveProgress(animeId, episodeNumber, currentTime, duration) {
        const animeIdStr = String(animeId);

        if (!this.history[animeIdStr]) {
            this.history[animeIdStr] = {
                episodes: {},
                lastWatched: Date.now()
            };
        }

        const episodeKey = String(episodeNumber);
        this.history[animeIdStr].episodes[episodeKey] = {
            currentTime: Math.floor(currentTime),
            duration: Math.floor(duration),
            percentage: Math.floor((currentTime / duration) * 100),
            lastWatched: Date.now()
        };

        // Marquer l'anime comme regardé récemment
        this.history[animeIdStr].lastWatched = Date.now();

        this.saveHistory();
    }

    // Récupérer la progression d'un épisode
    getProgress(animeId, episodeNumber) {
        const animeIdStr = String(animeId);
        const episodeKey = String(episodeNumber);

        if (this.history[animeIdStr] && this.history[animeIdStr].episodes[episodeKey]) {
            return this.history[animeIdStr].episodes[episodeKey];
        }
        return null;
    }

    // Récupérer le dernier épisode regardé d'un anime
    getLastWatchedEpisode(animeId) {
        const animeIdStr = String(animeId);

        if (!this.history[animeIdStr] || !this.history[animeIdStr].episodes) {
            return null;
        }

        const episodes = this.history[animeIdStr].episodes;
        let lastEpisode = null;
        let lastTime = 0;

        for (const [episodeNum, data] of Object.entries(episodes)) {
            if (data.lastWatched > lastTime) {
                lastTime = data.lastWatched;
                lastEpisode = {
                    episodeNumber: parseInt(episodeNum),
                    ...data
                };
            }
        }

        return lastEpisode;
    }

    // Récupérer tous les animes récemment regardés
    getRecentlyWatched(limit = 10) {
        const recentAnimes = [];

        for (const [animeId, data] of Object.entries(this.history)) {
            const lastEpisode = this.getLastWatchedEpisode(animeId);
            if (lastEpisode) {
                recentAnimes.push({
                    animeId: parseInt(animeId),
                    lastWatched: data.lastWatched,
                    lastEpisode: lastEpisode
                });
            }
        }

        // Trier par date de dernière visualisation
        recentAnimes.sort((a, b) => b.lastWatched - a.lastWatched);

        return recentAnimes.slice(0, limit);
    }

    // Marquer un épisode comme complété
    markAsCompleted(animeId, episodeNumber) {
        const animeIdStr = String(animeId);
        const episodeKey = String(episodeNumber);

        if (this.history[animeIdStr] && this.history[animeIdStr].episodes[episodeKey]) {
            this.history[animeIdStr].episodes[episodeKey].completed = true;
            this.history[animeIdStr].episodes[episodeKey].percentage = 100;
            this.saveHistory();
        }
    }

    // Vérifier si un épisode est complété
    isCompleted(animeId, episodeNumber) {
        const progress = this.getProgress(animeId, episodeNumber);
        if (progress) {
            // Considérer comme complété si > 90% ou marqué explicitement
            return progress.completed === true || progress.percentage > 90;
        }
        return false;
    }

    // Effacer tout l'historique
    clearAll() {
        this.history = {};
        this.saveHistory();
        console.log('✅ Historique de visionnage effacé');
    }
}

module.exports = WatchHistoryManager;

