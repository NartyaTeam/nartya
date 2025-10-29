/**
 * Gestionnaire des informations d'anime
 * Gère le chargement et l'affichage des informations d'un anime
 */

export class AnimeInfoManager {
    constructor(electronAPI) {
        this.electronAPI = electronAPI;
        this.currentAnime = null;
        this.currentSeason = null;
    }

    async loadAnimeInfo(animeId) {
        try {
            const animes = await this.electronAPI.searchLocalAnimes('');
            const anime = animes.results.find(a => a.slug === animeId || a.id === animeId);

            if (!anime) {
                throw new Error('Anime non trouvé');
            }

            this.currentAnime = anime;
            return { success: true, anime };
        } catch (error) {
            console.error('Erreur lors du chargement:', error);
            return { success: false, error: error.message };
        }
    }

    displayAnimeInfo(anime) {
        const title = anime.title?.romaji || anime.title?.english || anime.title?.native || 'Titre inconnu';
        const englishTitle = anime.title?.english || '';
        const nativeTitle = anime.title?.native || '';
        const image = anime.coverImage?.large || anime.coverImage?.medium || '';
        const format = anime.format || '';
        const synopsis = anime.synopsis || 'Aucune description disponible.';

        return `
            <div class="anime-info">
                ${image ? `<img src="${image}" alt="${title}" class="anime-poster" />` : ''}
                <div class="anime-details">
                    <h1 class="anime-title">${title}</h1>
                    ${englishTitle && englishTitle !== title ? `<div class="anime-subtitle">${englishTitle}</div>` : ''}
                    ${nativeTitle && nativeTitle !== title && nativeTitle !== englishTitle ? `<div class="anime-native">${nativeTitle}</div>` : ''}
                    ${format ? `<div class="anime-format">${format}</div>` : ''}
                    <div class="anime-synopsis">${synopsis}</div>
                </div>
            </div>
            <div class="seasons-section">
                <h2 class="seasons-title">Saisons</h2>
                <div id="seasonsContainer">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        <div>Chargement des saisons...</div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadSeasons(animeId) {
        try {
            const result = await this.electronAPI.getAnimeSeasons(animeId);

            if (result.success) {
                return { success: true, seasons: result.seasons };
            } else {
                throw new Error(result.error || 'Erreur lors du chargement des saisons');
            }
        } catch (error) {
            console.error('Erreur lors du chargement des saisons:', error);
            return { success: false, error: error.message };
        }
    }

    displaySeasons(seasons) {
        if (!seasons || seasons.length === 0) {
            return `
                <div class="error">
                    <div class="error-icon">📺</div>
                    <div>Aucune saison disponible pour cet anime.</div>
                </div>
            `;
        }

        return `
            <div class="seasons-selector-wrapper" data-label="Saison">
                <label for="seasonSelect" class="season-selector-label">Saison :</label>
                <select id="seasonSelect" class="season-selector">
                    ${seasons.map((season, index) => `
                        <option value="${season.id}" data-name="${season.name}" ${index === 0 ? 'selected' : ''}>
                            ${season.name}
                        </option>
                    `).join('')}
                </select>
            </div>
            <div id="episodesContainer">
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div>Chargement des épisodes...</div>
                </div>
            </div>
        `;
    }

    setCurrentSeason(seasonId, seasonName) {
        this.currentSeason = { id: seasonId, name: seasonName };
    }

    getCurrentAnime() {
        return this.currentAnime;
    }

    getCurrentSeason() {
        return this.currentSeason;
    }
}

