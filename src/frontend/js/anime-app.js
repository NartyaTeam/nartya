/**
 * Application principale pour anime.html
 * Orchestre tous les modules de la page anime
 */

import { AnimeInfoManager } from './anime-info-manager.js';
import { EpisodeManager } from './episode-manager.js';
import { VideoPlayer } from './video-player.js';
import { VideoExtractionUI } from './video-extraction-ui.js';
import { ChibiAnimations } from './chibi-animations.js';

class AnimeApp {
    constructor() {
        this.animeInfoManager = new AnimeInfoManager(window.electronAPI);
        this.episodeManager = new EpisodeManager(window.electronAPI);
        this.videoPlayer = new VideoPlayer();
        this.extractionUI = new VideoExtractionUI();
        this.chibiAnimations = new ChibiAnimations();

        // Debounce pour la navigation d'épisodes
        this.navigationDebounceTimer = null;
        this.navigationDebounceDelay = 800; // 800ms d'attente après le dernier clic
        this.pendingNavigationIndex = null;
    }

    async initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const animeId = urlParams.get('id');

        if (!animeId) {
            this.displayError('ID de l\'anime non fourni');
            return;
        }

        await this.loadAnimeInfo(animeId);
        this.chibiAnimations.initialize();
    }

    async loadAnimeInfo(animeId) {
        try {
            const result = await this.animeInfoManager.loadAnimeInfo(animeId);

            if (!result.success) {
                throw new Error(result.error);
            }

            const animeContent = document.getElementById('animeContent');
            animeContent.innerHTML = this.animeInfoManager.displayAnimeInfo(result.anime);

            await this.loadSeasons(animeId);
        } catch (error) {
            console.error('Erreur lors du chargement:', error);
            this.displayError(error.message);
        }
    }

    async loadSeasons(animeId) {
        const result = await this.animeInfoManager.loadSeasons(animeId);
        const seasonsContainer = document.getElementById('seasonsContainer');

        if (!result.success) {
            seasonsContainer.innerHTML = `
                <div class="error">
                    <div class="error-icon">⚠️</div>
                    <div>Impossible de charger les saisons: ${result.error}</div>
                </div>
            `;
            return;
        }

        // Stocker les saisons pour référence
        this.seasons = result.seasons;

        // Afficher le sélecteur de saison
        seasonsContainer.innerHTML = this.animeInfoManager.displaySeasons(result.seasons);

        // Attacher l'événement au sélecteur
        const seasonSelect = document.getElementById('seasonSelect');
        if (seasonSelect) {
            seasonSelect.addEventListener('change', (e) => {
                const selectedOption = e.target.options[e.target.selectedIndex];
                const seasonId = selectedOption.value;
                const seasonName = selectedOption.dataset.name || selectedOption.text;
                this.selectSeason(animeId, seasonId, seasonName);
            });

            // Charger automatiquement la saison 1
            if (result.seasons.length > 0) {
                const firstSeason = result.seasons[0];
                this.selectSeason(animeId, firstSeason.id, firstSeason.name);
            }
        }
    }

    async selectSeason(animeId, seasonId, seasonName) {
        console.log(`Saison sélectionnée: ${seasonName}`);
        this.animeInfoManager.setCurrentSeason(seasonId, seasonName);

        try {
            await this.loadEpisodes(animeId, seasonId);
        } catch (error) {
            console.error('Erreur lors du chargement des épisodes:', error);
            alert('Erreur lors du chargement des épisodes: ' + error.message);
        }
    }

    async loadEpisodes(animeId, seasonId) {
        const currentAnime = this.animeInfoManager.getCurrentAnime();
        const result = await this.episodeManager.loadEpisodes(animeId, seasonId, currentAnime);
        const episodesContainer = document.getElementById('episodesContainer');

        if (!result.success) {
            episodesContainer.innerHTML = `
                <div class="error">
                    <div class="error-icon">⚠️</div>
                    <div>Impossible de charger les épisodes: ${result.error}</div>
                </div>
            `;
            return;
        }

        this.displayEpisodes(result.episodes);
    }

    displayEpisodes(episodes) {
        const episodesContainer = document.getElementById('episodesContainer');

        if (!episodes || Object.keys(episodes).length === 0) {
            episodesContainer.innerHTML = `
                <div class="error">
                    <div class="error-icon">📺</div>
                    <div>Aucun épisode disponible pour cette saison.</div>
                </div>
            `;
            return;
        }

        const languages = Object.keys(episodes);
        if (!languages.includes(this.episodeManager.currentLanguage)) {
            this.episodeManager.currentLanguage = languages[0];
        }

        const currentLanguageEpisodes = episodes[this.episodeManager.currentLanguage];
        const sources = Object.keys(currentLanguageEpisodes);
        this.episodeManager.currentSource = sources[0];

        // Générer les options de saison
        const seasonsOptions = this.seasons && this.seasons.length > 0
            ? this.seasons.map((season) => `
                <option value="${season.id}" ${season.id === this.animeInfoManager.getCurrentSeason()?.id ? 'selected' : ''}>
                    ${season.name}
                </option>
            `).join('')
            : '<option>Saison 1</option>';

        episodesContainer.innerHTML = `
            <div class="episodes-controls">
                <div class="episodes-controls-left">
                    <div class="seasons-selector-wrapper" data-label="Saison">
                        <select id="seasonSelectEpisodes" class="season-selector">
                            ${seasonsOptions}
                        </select>
                    </div>
                    
                    <div class="sources-selector-wrapper" data-label="Source">
                        <label for="sourceSelect" class="source-selector-label">Source :</label>
                        <select id="sourceSelect" class="source-selector">
                            ${sources.map((source, index) => `
                                <option value="${source}" ${source === this.episodeManager.currentSource ? 'selected' : ''}>
                                    Source ${index + 1}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                
                <div class="language-selector">
                    <div class="language-label">Langue :</div>
                    <div class="language-tabs" id="languageTabs">
                        ${languages.map(lang => `
                            <button class="language-tab ${lang === this.episodeManager.currentLanguage ? 'active' : ''}" 
                                    data-lang="${lang}">
                                ${lang.toUpperCase()}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            <div class="episodes-grid" id="episodesGrid">
                ${this.episodeManager.displayEpisodesForLanguageAndSource(this.episodeManager.currentLanguage, this.episodeManager.currentSource)}
            </div>
        `;

        // Attacher les événements
        this.attachEpisodesEvents();
    }

    attachEpisodesEvents() {
        // Onglets de langue
        document.querySelectorAll('.language-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const language = e.target.dataset.lang;
                this.switchLanguage(language);
            });
        });

        // Sélecteur de saison dans les contrôles d'épisodes
        const seasonSelectEpisodes = document.getElementById('seasonSelectEpisodes');
        if (seasonSelectEpisodes) {
            seasonSelectEpisodes.addEventListener('change', (e) => {
                const selectedOption = e.target.options[e.target.selectedIndex];
                const seasonId = selectedOption.value;
                const seasonName = selectedOption.text;

                // Synchroniser avec le sélecteur principal
                const mainSeasonSelect = document.getElementById('seasonSelect');
                if (mainSeasonSelect) {
                    mainSeasonSelect.value = seasonId;
                }

                // Récupérer l'animeId depuis l'URL
                const urlParams = new URLSearchParams(window.location.search);
                const animeId = urlParams.get('id');

                this.selectSeason(animeId, seasonId, seasonName);
            });
        }

        // Sélecteur de source
        const sourceSelect = document.getElementById('sourceSelect');
        if (sourceSelect) {
            sourceSelect.addEventListener('change', (e) => {
                const source = e.target.value;
                this.switchSource(source);
            });
        }

        // Items d'épisodes
        document.querySelectorAll('.episode-item').forEach(item => {
            item.addEventListener('click', () => {
                const episodeUrl = item.dataset.url;
                const episodeNumber = parseInt(item.dataset.number);
                this.playEpisode(episodeUrl, episodeNumber);
            });
        });
    }

    switchLanguage(language) {
        const result = this.episodeManager.switchLanguage(language);

        document.querySelectorAll('.language-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.lang === language) {
                tab.classList.add('active');
            }
        });

        // Mettre à jour le sélecteur de source
        const sourceSelect = document.getElementById('sourceSelect');
        if (sourceSelect) {
            sourceSelect.innerHTML = result.sources.map((source, index) => `
                <option value="${source}" ${source === result.currentSource ? 'selected' : ''}>
                    Source ${index + 1}
                </option>
            `).join('');
        }

        document.getElementById('episodesGrid').innerHTML =
            this.episodeManager.displayEpisodesForLanguageAndSource(language, result.currentSource);

        this.attachEpisodesEvents();
    }

    switchSource(source) {
        this.episodeManager.switchSource(source);

        document.getElementById('episodesGrid').innerHTML =
            this.episodeManager.displayEpisodesForLanguageAndSource(this.episodeManager.currentLanguage, source);

        this.attachEpisodesEvents();
    }

    async playEpisode(episodeUrl, episodeNumber) {
        console.log(`🎬 Lecture de l'épisode ${episodeNumber}`);

        this.episodeManager.initializeEpisodeList(this.episodeManager.currentLanguage, this.episodeManager.currentSource);
        this.episodeManager.setCurrentEpisodeIndex(episodeNumber);

        // Vérifier si alternative disponible pour cet épisode
        const episodeInfo = this.episodeManager.getEpisodeUrlWithAlternative(episodeNumber - 1);
        const finalUrl = episodeInfo.url || episodeUrl;

        if (episodeInfo.isAlternative) {
            console.log(`🔄 Utilisation d'une source alternative: ${episodeInfo.source} (${episodeInfo.provider})`);
        } else if (episodeInfo.isSibnetFallback) {
            console.log(`⚠️ Aucune alternative, utilisation de Sibnet`);
        }

        this.extractionUI.showModal(episodeNumber, finalUrl);

        try {
            const result = await window.electronAPI.extractVideoUrl(finalUrl.replace("vidmoly.to", "vidmoly.net"));

            if (result.success && result.videoUrl) {
                console.log('✅ URL de la vidéo extraite:', result.videoUrl);

                this.episodeManager.cacheEpisode(this.episodeManager.currentEpisodeIndex, result.videoUrl, finalUrl);
                this.extractionUI.close();

                const currentAnime = this.animeInfoManager.getCurrentAnime();
                const animeTitle = currentAnime?.title?.romaji || currentAnime?.title?.english || 'Anime';
                this.openVideoPlayer(result.videoUrl, episodeNumber, animeTitle);

                setTimeout(() => {
                    this.episodeManager.preloadNextEpisode();
                }, 2000);
            } else {
                console.error('❌ Échec de l\'extraction:', result);
                this.extractionUI.showError(episodeNumber, result);
            }
        } catch (error) {
            console.error('❌ Erreur lors de l\'extraction:', error);
            this.extractionUI.showError(episodeNumber, {
                error: error.message,
                userMessage: 'Une erreur inattendue s\'est produite. Veuillez réessayer.',
                errorCode: 'UNKNOWN_ERROR'
            });
        }
    }

    openVideoPlayer(videoUrl, episodeNumber, animeTitle) {
        this.videoPlayer.initialize();

        const modal = document.getElementById('videoPlayerModal');
        const episodeTitleEl = document.getElementById('playerEpisodeTitle');
        const animeTitleEl = document.getElementById('playerAnimeTitle');

        episodeTitleEl.textContent = `Épisode ${episodeNumber}`;
        animeTitleEl.textContent = animeTitle;

        this.videoPlayer.loadVideo(videoUrl);
        this.updateNavigationButtons();

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeVideoPlayer() {
        const modal = document.getElementById('videoPlayerModal');
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';

        this.videoPlayer.pause();
        this.videoPlayer.cleanupHLS();
    }

    async navigateEpisode(direction) {
        const newIndex = this.episodeManager.currentEpisodeIndex + direction;

        if (newIndex < 0 || newIndex >= this.episodeManager.currentEpisodeList.length) {
            return;
        }

        // Mettre à jour l'index immédiatement
        this.episodeManager.currentEpisodeIndex = newIndex;
        const episodeNumber = newIndex + 1;

        // Mettre à jour l'UI immédiatement (sans attendre l'extraction)
        document.getElementById('playerEpisodeTitle').textContent = `Épisode ${episodeNumber}`;
        this.updateNavigationButtons();

        console.log(`🎯 Navigation vers épisode ${episodeNumber} (index: ${newIndex})`);

        // Stocker l'index en attente
        this.pendingNavigationIndex = newIndex;

        // Annuler le timer précédent si l'utilisateur spam
        if (this.navigationDebounceTimer) {
            console.log('⏱️ Timer annulé - nouveau clic détecté');
            clearTimeout(this.navigationDebounceTimer);
        }

        // Annuler l'animation de loading précédente si elle existe
        if (this.navigationDotInterval) {
            clearInterval(this.navigationDotInterval);
        }

        // Vérifier si l'épisode est en cache
        const cachedData = this.episodeManager.getCachedEpisode(newIndex);
        if (cachedData) {
            console.log(`⚡ Épisode ${episodeNumber} trouvé en cache - chargement instantané !`);
            this.videoPlayer.loadVideo(cachedData.videoUrl);

            // Preload adjacent episodes
            if (direction === 1) {
                this.episodeManager.preloadNextEpisode();
            } else if (direction === -1) {
                this.episodeManager.preloadPreviousEpisode();
            }
            return;
        }

        // Indicateur visuel de chargement
        const episodeTitleEl = document.getElementById('playerEpisodeTitle');
        const originalText = episodeTitleEl.textContent;
        episodeTitleEl.innerHTML = `${originalText} <span style="opacity: 0.5; font-size: 0.8em;">●</span>`;

        // Animation du point de chargement
        let dotCount = 0;
        this.navigationDotInterval = setInterval(() => {
            dotCount = (dotCount + 1) % 4;
            const dots = '●'.repeat(Math.max(1, dotCount)) + '○'.repeat(3 - dotCount);
            if (episodeTitleEl) {
                episodeTitleEl.innerHTML = `${originalText} <span style="opacity: 0.5; font-size: 0.8em;">${dots.charAt(0)}</span>`;
            }
        }, 300);

        // Démarrer un nouveau timer pour l'extraction
        this.navigationDebounceTimer = setTimeout(async () => {
            // Arrêter l'animation du point
            if (this.navigationDotInterval) {
                clearInterval(this.navigationDotInterval);
                this.navigationDotInterval = null;
            }

            // Vérifier que c'est toujours l'épisode demandé
            if (this.pendingNavigationIndex !== newIndex) {
                console.log(`⏭️ Épisode ${episodeNumber} ignoré - l'utilisateur a navigué ailleurs`);
                episodeTitleEl.textContent = originalText;
                return;
            }

            // Vérifier si alternative disponible pour cet épisode
            const episodeInfo = this.episodeManager.getEpisodeUrlWithAlternative(newIndex);
            const finalUrl = episodeInfo.url || this.episodeManager.currentEpisodeList[newIndex];

            if (episodeInfo.isAlternative) {
                console.log(`🔄 Navigation: Utilisation d'une source alternative: ${episodeInfo.source} (${episodeInfo.provider})`);
            } else if (episodeInfo.isSibnetFallback) {
                console.log(`⚠️ Navigation: Aucune alternative, utilisation de Sibnet`);
            }

            console.log(`🔄 Extraction de l'épisode ${episodeNumber} (après debounce)...`);

            try {
                const result = await window.electronAPI.extractVideoUrl(finalUrl);

                // Vérifier à nouveau que c'est toujours le bon épisode
                if (this.pendingNavigationIndex !== newIndex) {
                    console.log(`⏭️ Extraction ignorée - l'utilisateur a navigué vers un autre épisode`);
                    episodeTitleEl.textContent = originalText;
                    return;
                }

                if (result.success && result.videoUrl) {
                    console.log(`✅ Épisode ${episodeNumber} extrait avec succès`);
                    this.episodeManager.cacheEpisode(newIndex, result.videoUrl, finalUrl);
                    this.videoPlayer.loadVideo(result.videoUrl);
                    episodeTitleEl.textContent = originalText; // Nettoyer l'indicateur

                    // Preload adjacent episodes
                    if (direction === 1) {
                        this.episodeManager.preloadNextEpisode();
                    } else if (direction === -1) {
                        this.episodeManager.preloadPreviousEpisode();
                    }
                } else {
                    console.error('❌ Erreur lors du chargement de l\'épisode:', result.error);
                    episodeTitleEl.textContent = originalText;
                    // Optionnel : afficher un message d'erreur à l'utilisateur
                }
            } catch (error) {
                console.error('❌ Erreur lors de la navigation:', error);
                episodeTitleEl.textContent = originalText;
            }
        }, this.navigationDebounceDelay);
    }

    updateNavigationButtons() {
        const prevBtn = document.getElementById('prevEpisodeBtn');
        const nextBtn = document.getElementById('nextEpisodeBtn');

        prevBtn.disabled = this.episodeManager.currentEpisodeIndex === 0;
        nextBtn.disabled = this.episodeManager.currentEpisodeIndex === this.episodeManager.currentEpisodeList.length - 1;

        this.episodeManager.preloadNextEpisode();
    }

    displayError(message) {
        document.getElementById('animeContent').innerHTML = `
            <div class="error">
                <div class="error-icon">❌</div>
                <div>Erreur: ${message}</div>
            </div>
        `;
    }
}

// Fonctions globales pour les événements onclick dans le HTML
window.goHome = () => {
    window.location.href = '../frontend/index.html';
};

window.closeExtractionModal = () => {
    const modal = document.getElementById('extractionModal');
    if (modal) modal.remove();
};

window.copyVideoUrl = async (videoUrl) => {
    try {
        await navigator.clipboard.writeText(videoUrl);
        console.log('URL copiée dans le presse-papiers');

        const button = event.target;
        const originalText = button.textContent;
        button.textContent = '✅ Copié !';
        button.style.background = '#4ade80';

        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '#6366f1';
        }, 2000);
    } catch (error) {
        console.error('Erreur lors de la copie:', error);
        alert('Erreur lors de la copie de l\'URL');
    }
};

window.openVideoUrl = (videoUrl) => {
    window.open(videoUrl, '_blank');
};

// Instance globale de l'app
let animeApp;

window.closeVideoPlayer = () => {
    if (animeApp) animeApp.closeVideoPlayer();
};

window.navigateEpisode = (direction) => {
    if (animeApp) animeApp.navigateEpisode(direction);
};

// Initialiser l'application au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    animeApp = new AnimeApp();
    animeApp.initialize();
});

