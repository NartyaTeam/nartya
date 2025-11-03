/**
 * Gestionnaire des épisodes
 * Gère le chargement, l'affichage et la navigation des épisodes
 */

import { SourceAnalyzer } from "./source-analyzer.js";

export class EpisodeManager {
  constructor(electronAPI) {
    this.electronAPI = electronAPI;
    this.currentEpisodes = null;
    this.currentLanguage = "vostfr";
    this.currentSource = null;
    this.currentSeasonId = null;
    this.episodeMetadata = null;
    this.currentEpisodeList = [];
    this.currentEpisodeIndex = 0;
    this.cachedEpisodes = new Map(); // Cache pour épisodes adjacents

    // Analyseur de sources
    this.sourceAnalyzer = new SourceAnalyzer();
    console.log(this.sourceAnalyzer);
    this.sourcesAnalysis = {};

    // Progressions vidéo
    this.progressData = {};

    // Charger le cache depuis localStorage
    this.loadCacheFromStorage();
  }

  /**
   * Charge le cache depuis localStorage
   */
  loadCacheFromStorage() {
    try {
      const cached = localStorage.getItem("nartya_episode_cache");
      if (cached) {
        const data = JSON.parse(cached);
        // Convertir l'objet en Map
        this.cachedEpisodes = new Map(Object.entries(data));
        console.log(`📦 Cache chargé: ${this.cachedEpisodes.size} épisodes`);
      } else {
        // Initialiser un cache vide si rien n'est trouvé
        this.cachedEpisodes = new Map();
        console.log("📦 Cache initialisé (vide)");
      }
    } catch (error) {
      console.error("Erreur lors du chargement du cache:", error);
      // En cas d'erreur, initialiser un cache vide
      this.cachedEpisodes = new Map();
    }
  }

  /**
   * Sauvegarde le cache dans localStorage
   */
  saveCacheToStorage() {
    try {
      // Convertir la Map en objet pour localStorage
      const data = Object.fromEntries(this.cachedEpisodes);
      localStorage.setItem("nartya_episode_cache", JSON.stringify(data));
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du cache:", error);
    }
  }

  async loadEpisodes(animeId, seasonId, currentAnime, seasonName = null) {
    try {
      // Charger les épisodes
      const episodesResult = await this.electronAPI.getAnimeEpisodes(
        animeId,
        seasonId
      );

      if (!episodesResult.success) {
        throw new Error(
          episodesResult.error || "Erreur lors du chargement des épisodes"
        );
      }

      this.currentEpisodes = episodesResult.episodes;
      this.currentSeasonId = seasonId;

      // Déterminer si c'est la saison 1
      // Méthodes de détection :
      // 1. seasonId === animeId (pas de suffixe)
      // 2. seasonName contient "Saison 1" ou "Season 1"
      // 3. seasonId commence par "saison1/" (format: saisonX/langue)
      // 4. seasonId se termine par "-saison-1" ou "-season-1"
      const isSeason1 =
        seasonId === animeId ||
        (seasonName && /saison\s*1|season\s*1/i.test(seasonName)) ||
        /^saison1\//i.test(seasonId) ||
        /-(saison|season)-1$/i.test(seasonId);

      // Charger les métadonnées UNIQUEMENT pour la saison 1
      if (currentAnime?.id && isSeason1) {
        console.log("📊 Chargement des métadonnées AniZip pour la saison 1...");
        const metadataResult = await this.electronAPI.getEpisodeMetadata(
          currentAnime.id
        );

        if (metadataResult.success) {
          this.episodeMetadata = metadataResult.metadata;
          console.log("✅ Métadonnées AniZip chargées");
        } else {
          this.episodeMetadata = null;
          console.log("ℹ️ Pas de métadonnées AniZip disponibles");
        }
      } else {
        // Pour les autres saisons, pas de métadonnées
        this.episodeMetadata = null;
        console.log(
          `ℹ️ ${
            seasonName || "Saison"
          } : Utilisation de l'image de l'anime (pas de métadonnées AniZip)`
        );
      }

      return { success: true, episodes: episodesResult.episodes };
    } catch (error) {
      console.error("Erreur lors du chargement des épisodes:", error);
      return { success: false, error: error.message };
    }
  }

  getEpisodeHtml(episodeUrl, index, source) {
    const episodeNumber = index + 1;
    const episodeData =
      this.episodeMetadata?.episodes?.[episodeNumber.toString()];

    // Utiliser l'image de l'épisode, sinon l'image de l'anime, sinon placeholder
    const animeCover =
      window.animeApp?.animeInfoManager?.getCurrentAnime()?.coverImage?.large ||
      window.animeApp?.animeInfoManager?.getCurrentAnime()?.coverImage?.medium;
    const episodeImage = episodeData?.image || animeCover;

    return `
            <div class="episode-item episode-card" data-url="${episodeUrl}" data-number="${episodeNumber}" data-episode="${episodeNumber}">
                <div class="episode-number">${episodeNumber}</div>
                <div class="episode-image-container">
                    ${
                      episodeImage
                        ? `<img src="${episodeImage}" 
                             alt="Épisode ${episodeNumber}" 
                             class="episode-thumbnail"
                             onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'episode-thumbnail-placeholder\\'><span>EP ${episodeNumber}</span></div><div class=\\'episode-loading-overlay\\' style=\\'display: none;\\'><div class=\\'episode-loading-spinner\\'></div></div>';">`
                        : `<div class="episode-thumbnail-placeholder">
                            <span>EP ${episodeNumber}</span>
                        </div>`
                    }
                    <div class="episode-loading-overlay" style="display: none;">
                        <div class="episode-loading-spinner"></div>
                    </div>
                </div>
                <div class="episode-content">
                    <div class="episode-title">
                        ${
                          episodeData?.title?.en ||
                          episodeData?.title?.ja ||
                          `Épisode ${episodeNumber}`
                        }
                    </div>
                    <div class="episode-description">
                        ${
                          episodeData?.overview ||
                          episodeData?.summary ||
                          "Aucune description disponible."
                        }
                    </div>
                    <div class="episode-meta">
                        ${
                          episodeData?.runtime
                            ? `<span class="episode-duration">${episodeData.runtime} min</span>`
                            : ""
                        }
                        ${
                          episodeData?.rating
                            ? `<span class="episode-rating">⭐ ${episodeData.rating}</span>`
                            : ""
                        }
                        ${
                          episodeData?.airDate
                            ? `<span class="episode-airdate">📅 ${new Date(
                                episodeData.airDate
                              ).toLocaleDateString("fr-FR")}</span>`
                            : ""
                        }
                    </div>
                </div>
            </div>
        `;
  }

  displayEpisodesForLanguageAndSource(language, source) {
    if (
      !this.currentEpisodes ||
      !this.currentEpisodes[language] ||
      !this.currentEpisodes[language][source]
    ) {
      return '<div class="error">Aucun épisode disponible pour cette langue et source.</div>';
    }

    const episodes = this.currentEpisodes[language][source];

    return `
            <div class="episodes-list">
                ${episodes
                  .map((episodeUrl, index) =>
                    this.getEpisodeHtml(episodeUrl, index, source)
                  )
                  .join("")}
            </div>
        `;
  }

  switchLanguage(language) {
    this.currentLanguage = language;

    // Filtrer les sources qui ont des épisodes
    const allSources = Object.keys(this.currentEpisodes[language]);
    const sources = allSources.filter((source) => {
      const episodeList = this.currentEpisodes[language][source];
      return Array.isArray(episodeList) && episodeList.length > 0;
    });

    if (sources.length === 0) {
      console.error(`❌ Aucune source avec épisodes pour ${language}`);
      return { sources: [], currentSource: null };
    }

    // Analyser toutes les sources pour cette langue (seulement celles avec épisodes)
    this.sourcesAnalysis = this.sourceAnalyzer.analyzeAllSources(
      this.currentEpisodes,
      language
    );
    this.sourceAnalyzer.logReport(this.sourcesAnalysis, language);

    // Recommander la meilleure source (évite Sibnet si possible)
    const recommendedSource = this.sourceAnalyzer.recommendBestSource(
      this.sourcesAnalysis
    );
    this.currentSource = recommendedSource || sources[0];

    console.log(`✅ Source sélectionnée: ${this.currentSource}`);

    return { sources, currentSource: this.currentSource };
  }

  switchSource(source) {
    this.currentSource = source;
  }

  clearPreloadCache() {
    this.preloadedEpisodes.clear();
    this.isPreloading = false;
    this.isPreloadingMultiple = false;
    console.log("🗑️ Cache des épisodes préchargés vidé");
  }

  initializeEpisodeList(language, source, clearCache = false) {
    if (
      this.currentEpisodes &&
      this.currentEpisodes[language] &&
      this.currentEpisodes[language][source]
    ) {
      this.currentEpisodeList = this.currentEpisodes[language][source];

      // Ne vider le cache que si explicitement demandé (changement de langue/source)
      if (clearCache) {
        this.preloadedEpisodes.clear();
        console.log("🗑️ Cache vidé pour une nouvelle série");
      }
    }
  }

  setCurrentEpisodeIndex(episodeNumber) {
    this.currentEpisodeIndex = episodeNumber - 1;
  }

  /**
   * Cache un épisode en arrière-plan (précédent ou suivant)
   */
  async cacheAdjacentEpisode(index) {
    // Ne pas cacher si une extraction principale est en cours
    if (window.animeApp && window.animeApp.isExtracting) {
      return null;
    }

    if (index < 0 || index >= this.currentEpisodeList.length) return null;

    const cacheKey = `${this.currentSeasonId}-${index}`;

    // Si déjà en cache, ne rien faire
    if (this.cachedEpisodes.has(cacheKey)) {
      console.log(`✅ Épisode ${index + 1} déjà en cache`);
      return this.cachedEpisodes.get(cacheKey);
    }

    // Trouver la meilleure source pour cet épisode
    const episodeInfo = this.getEpisodeUrlWithAlternative(index);
    const episodeUrl = episodeInfo.url || this.currentEpisodeList[index];

    console.log(
      `🔄 Mise en cache de l'épisode ${index + 1} en arrière-plan...`
    );

    try {
      const result = await this.electronAPI.extractVideoUrl(
        episodeUrl.replace("vidmoly.to", "vidmoly.net")
      );

      if (result.success && result.videoUrl) {
        const cacheData = {
          videoUrl: result.videoUrl,
          episodeUrl: episodeUrl,
          timestamp: Date.now(),
        };
        this.cachedEpisodes.set(cacheKey, cacheData);
        this.saveCacheToStorage();
        console.log(`✅ Épisode ${index + 1} mis en cache avec succès`);
        return cacheData;
      }
    } catch (error) {
      console.warn(
        `⚠️ Impossible de mettre en cache l'épisode ${index + 1}:`,
        error
      );
    }

    return null;
  }

  /**
   * Cache les épisodes adjacents (précédent et suivant) en arrière-plan
   */
  async cacheAdjacentEpisodes(currentIndex) {
    console.log(
      `📦 Mise en cache des épisodes adjacents à l'épisode ${currentIndex + 1}`
    );

    // Lancer les deux en parallèle
    const promises = [];

    // Épisode précédent
    if (currentIndex > 0) {
      promises.push(this.cacheAdjacentEpisode(currentIndex - 1));
    }

    // Épisode suivant
    if (currentIndex < this.currentEpisodeList.length - 1) {
      promises.push(this.cacheAdjacentEpisode(currentIndex + 1));
    }

    await Promise.all(promises);
  }

  getCachedEpisode(index) {
    const cacheKey = `${this.currentSeasonId}-${index}`;
    return this.cachedEpisodes.get(cacheKey);
  }

  cacheEpisode(index, videoUrl, episodeUrl) {
    const cacheKey = `${this.currentSeasonId}-${index}`;
    this.cachedEpisodes.set(cacheKey, {
      videoUrl,
      episodeUrl,
      timestamp: Date.now(),
    });
    this.saveCacheToStorage();
  }

  /**
   * Nettoie le cache des épisodes
   */
  clearCache() {
    this.cachedEpisodes.clear();
    this.saveCacheToStorage();
    console.log("🗑️ Cache des épisodes nettoyé");
  }

  /**
   * Trouve la meilleure source pour un épisode en priorisant Vidmoly et autres sources rapides
   * Évite Sibnet si possible en cherchant dans toutes les sources disponibles
   */
  getEpisodeUrlWithAlternative(index) {
    if (index < 0 || index >= this.currentEpisodeList.length) {
      return { url: null, isAlternative: false, originalSource: null };
    }

    const originalUrl = this.currentEpisodeList[index];
    const originalProvider = this.sourceAnalyzer.detectProvider(originalUrl);

    // Chercher dans TOUTES les sources disponibles pour cet épisode
    const allAlternatives = [];

    if (this.currentEpisodes && this.currentEpisodes[this.currentLanguage]) {
      const allSources = this.currentEpisodes[this.currentLanguage];

      // Parcourir toutes les sources
      for (const [sourceName, episodes] of Object.entries(allSources)) {
        // Vérifier que cette source a bien cet épisode
        if (index < episodes.length) {
          const episodeUrl = episodes[index];
          const episodeProvider =
            this.sourceAnalyzer.detectProvider(episodeUrl);

          // Calculer la priorité : Vidmoly = 1, autres rapides = 2, autres = 3, Sibnet = 999
          const priority =
            episodeProvider === "vidmoly"
              ? 1
              : this.sourceAnalyzer.fastProviders.includes(episodeProvider)
              ? 2
              : episodeProvider === "sibnet"
              ? 999
              : 3;

          allAlternatives.push({
            sourceName,
            provider: episodeProvider,
            url: episodeUrl,
            priority,
            isFast: this.sourceAnalyzer.fastProviders.includes(episodeProvider),
            isSlow: this.sourceAnalyzer.slowProviders.includes(episodeProvider),
          });
        }
      }
    }

    if (allAlternatives.length === 0) {
      // Pas d'alternatives, utiliser l'original
      return {
        url: originalUrl,
        isAlternative: false,
        provider: originalProvider,
        source: this.currentSource,
      };
    }

    // Trier par priorité (priorité plus basse = meilleur)
    allAlternatives.sort((a, b) => {
      // D'abord par priorité
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Ensuite éviter Sibnet si possible
      if (a.isSlow !== b.isSlow) {
        return a.isSlow ? 1 : -1;
      }
      return 0;
    });

    // Prendre la meilleure alternative
    const bestAlternative = allAlternatives[0];

    // Vérifier si c'est la même URL que l'originale
    const isSameUrl = bestAlternative.url === originalUrl;
    const isFromCurrentSource =
      bestAlternative.sourceName === this.currentSource;

    // Si c'est déjà la meilleure option et qu'on est dans la source actuelle
    if (isSameUrl && isFromCurrentSource) {
      return {
        url: originalUrl,
        isAlternative: false,
        provider: originalProvider,
        source: this.currentSource,
      };
    }

    // Utiliser la meilleure alternative trouvée
    const isAlternative =
      !isFromCurrentSource || bestAlternative.provider !== originalProvider;

    if (isAlternative) {
      console.log(
        `✅ Meilleure source trouvée pour épisode ${index + 1}: ${
          bestAlternative.sourceName
        } (${bestAlternative.provider}) au lieu de ${
          this.currentSource
        } (${originalProvider})`
      );
    }

    return {
      url: bestAlternative.url,
      isAlternative,
      provider: bestAlternative.provider,
      source: bestAlternative.sourceName,
      originalSource: isAlternative ? this.currentSource : null,
      originalProvider: isAlternative ? originalProvider : null,
    };
  }

  /**
   * Retourne les informations sur le provider d'un épisode
   */
  getEpisodeProvider(index) {
    if (index < 0 || index >= this.currentEpisodeList.length) {
      return "unknown";
    }

    const url = this.currentEpisodeList[index];
    return this.sourceAnalyzer.detectProvider(url);
  }

  /**
   * Définit les données de progression
   */
  setProgressData(progressData) {
    this.progressData = progressData || {};
  }

  /**
   * Récupère la progression d'un épisode spécifique
   */
  getEpisodeProgress(episodeIndex) {
    // Chercher dans progressData avec la clé correspondante
    // On vérifie aussi le seasonId pour éviter les conflits entre saisons
    for (const [key, data] of Object.entries(this.progressData)) {
      if (
        data.episodeIndex === episodeIndex &&
        data.seasonId === this.currentSeasonId
      ) {
        return data;
      }
    }
    return null;
  }
}
