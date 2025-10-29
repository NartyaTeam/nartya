/**
 * Gestionnaire des épisodes
 * Gère le chargement, l'affichage et la navigation des épisodes
 */

import { SourceAnalyzer } from './source-analyzer.js';

export class EpisodeManager {
    constructor(electronAPI) {
        this.electronAPI = electronAPI;
        this.currentEpisodes = null;
        this.currentLanguage = 'vostfr';
        this.currentSource = null;
        this.episodeMetadata = null;
        this.currentEpisodeList = [];
        this.currentEpisodeIndex = 0;
        this.preloadedEpisodes = new Map();
        this.isPreloading = false;

        // Analyseur de sources
        this.sourceAnalyzer = new SourceAnalyzer();
        this.sourcesAnalysis = {};
    }

    async loadEpisodes(animeId, seasonId, currentAnime) {
        try {
            const [episodesResult, metadataResult] = await Promise.all([
                this.electronAPI.getAnimeEpisodes(animeId, seasonId),
                currentAnime?.id ? this.electronAPI.getEpisodeMetadata(currentAnime.id) : Promise.resolve({ success: false })
            ]);

            if (episodesResult.success) {
                this.currentEpisodes = episodesResult.episodes;

                if (metadataResult.success) {
                    this.episodeMetadata = metadataResult.metadata;
                }

                return { success: true, episodes: episodesResult.episodes };
            } else {
                throw new Error(episodesResult.error || 'Erreur lors du chargement des épisodes');
            }
        } catch (error) {
            console.error('Erreur lors du chargement des épisodes:', error);
            return { success: false, error: error.message };
        }
    }

    getEpisodeHtml(episodeUrl, index, source) {
        const episodeNumber = index + 1;
        const episodeData = this.episodeMetadata?.episodes?.[episodeNumber.toString()];

        return `
            <div class="episode-item" data-url="${episodeUrl}" data-number="${episodeNumber}">
                <div class="episode-source">${source.toUpperCase()}</div>
                <div class="episode-number">${episodeNumber}</div>
                <img src="${episodeData?.image || ''}" 
                     alt="Épisode ${episodeNumber}" 
                     class="episode-thumbnail"
                     onerror="this.style.display='none'">
                <div class="episode-content">
                    <div class="episode-title">
                        ${episodeData?.title?.en || episodeData?.title?.ja || `Épisode ${episodeNumber}`}
                    </div>
                    <div class="episode-description">
                        ${episodeData?.overview || episodeData?.summary || 'Aucune description disponible.'}
                    </div>
                    <div class="episode-meta">
                        ${episodeData?.runtime ? `<span class="episode-duration">${episodeData.runtime} min</span>` : ''}
                        ${episodeData?.rating ? `<span class="episode-rating">⭐ ${episodeData.rating}</span>` : ''}
                        ${episodeData?.airDate ? `<span class="episode-airdate">📅 ${new Date(episodeData.airDate).toLocaleDateString('fr-FR')}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    displayEpisodesForLanguageAndSource(language, source) {
        if (!this.currentEpisodes || !this.currentEpisodes[language] || !this.currentEpisodes[language][source]) {
            return '<div class="error">Aucun épisode disponible pour cette langue et source.</div>';
        }

        const episodes = this.currentEpisodes[language][source];

        return `
            <div class="episodes-list">
                ${episodes.map((episodeUrl, index) => this.getEpisodeHtml(episodeUrl, index, source)).join('')}
            </div>
        `;
    }

    switchLanguage(language) {
        this.currentLanguage = language;

        // Analyser toutes les sources pour cette langue
        this.sourcesAnalysis = this.sourceAnalyzer.analyzeAllSources(this.currentEpisodes, language);
        this.sourceAnalyzer.logReport(this.sourcesAnalysis, language);

        const sources = Object.keys(this.currentEpisodes[language]);

        // Recommander la meilleure source (évite Sibnet si possible)
        const recommendedSource = this.sourceAnalyzer.recommendBestSource(this.sourcesAnalysis);
        this.currentSource = recommendedSource || sources[0];

        console.log(`✅ Source sélectionnée: ${this.currentSource}`);

        return { sources, currentSource: this.currentSource };
    }

    switchSource(source) {
        this.currentSource = source;
    }

    initializeEpisodeList(language, source) {
        if (this.currentEpisodes && this.currentEpisodes[language] && this.currentEpisodes[language][source]) {
            this.currentEpisodeList = this.currentEpisodes[language][source];
            this.preloadedEpisodes.clear();
            console.log('🗑️ Cache vidé pour une nouvelle série');
        }
    }

    setCurrentEpisodeIndex(episodeNumber) {
        this.currentEpisodeIndex = episodeNumber - 1;
    }

    async preloadEpisode(index, direction = 'next') {
        if (this.isPreloading) return null;

        if (index < 0 || index >= this.currentEpisodeList.length) return null;

        const episodeUrl = this.currentEpisodeList[index];
        const cacheKey = `episode_${index}`;

        if (this.preloadedEpisodes.has(cacheKey)) {
            console.log(`✅ Épisode ${index + 1} déjà pré-chargé`);
            return this.preloadedEpisodes.get(cacheKey);
        }

        this.isPreloading = true;
        console.log(`🔄 Pré-chargement de l'épisode ${index + 1}...`);

        try {
            const result = await this.electronAPI.extractVideoUrl(episodeUrl);

            if (result.success && result.videoUrl) {
                const cacheData = {
                    videoUrl: result.videoUrl,
                    episodeUrl: episodeUrl,
                    timestamp: Date.now()
                };
                this.preloadedEpisodes.set(cacheKey, cacheData);
                console.log(`✅ Épisode ${index + 1} pré-chargé avec succès`);
                return cacheData;
            } else {
                console.warn(`⚠️ Échec du pré-chargement de l'épisode ${index + 1}:`, result.error);
                return null;
            }
        } catch (error) {
            console.error(`❌ Erreur lors du pré-chargement de l'épisode ${index + 1}:`, error);
            return null;
        } finally {
            this.isPreloading = false;
        }
    }

    async preloadNextEpisode() {
        return this.preloadEpisode(this.currentEpisodeIndex + 1, 'next');
    }

    async preloadPreviousEpisode() {
        return this.preloadEpisode(this.currentEpisodeIndex - 1, 'previous');
    }

    getCachedEpisode(index) {
        const cacheKey = `episode_${index}`;
        return this.preloadedEpisodes.get(cacheKey);
    }

    cacheEpisode(index, videoUrl, episodeUrl) {
        const cacheKey = `episode_${index}`;
        this.preloadedEpisodes.set(cacheKey, {
            videoUrl,
            episodeUrl,
            timestamp: Date.now()
        });
    }

    /**
     * Vérifie si un épisode est Sibnet et trouve une alternative si disponible
     */
    getEpisodeUrlWithAlternative(index) {
        if (index < 0 || index >= this.currentEpisodeList.length) {
            return { url: null, isAlternative: false, originalSource: null };
        }

        const originalUrl = this.currentEpisodeList[index];
        const provider = this.sourceAnalyzer.detectProvider(originalUrl);

        // Si ce n'est pas Sibnet, utiliser l'URL normale
        if (provider !== 'sibnet') {
            return {
                url: originalUrl,
                isAlternative: false,
                provider,
                source: this.currentSource
            };
        }

        // C'est Sibnet, chercher une alternative
        console.log(`🐌 Épisode ${index + 1} est sur Sibnet, recherche d'alternative...`);

        const alternative = this.sourceAnalyzer.findBestAlternativeForEpisode(
            index,
            this.sourcesAnalysis,
            this.currentSource
        );

        if (alternative) {
            console.log(`✅ Alternative trouvée: ${alternative.sourceName} (${alternative.provider})`);
            return {
                url: alternative.url,
                isAlternative: true,
                provider: alternative.provider,
                source: alternative.sourceName,
                originalSource: this.currentSource,
                originalProvider: 'sibnet'
            };
        }

        // Pas d'alternative, utiliser Sibnet
        console.log(`⚠️ Aucune alternative trouvée, utilisation de Sibnet`);
        return {
            url: originalUrl,
            isAlternative: false,
            provider: 'sibnet',
            source: this.currentSource,
            isSibnetFallback: true
        };
    }

    /**
     * Retourne les informations sur le provider d'un épisode
     */
    getEpisodeProvider(index) {
        if (index < 0 || index >= this.currentEpisodeList.length) {
            return 'unknown';
        }

        const url = this.currentEpisodeList[index];
        return this.sourceAnalyzer.detectProvider(url);
    }
}


