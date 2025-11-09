/**
 * Application principale pour anime.html
 * Orchestre tous les modules de la page anime
 */

import { AnimeInfoManager } from "./anime-info-manager.js";
import { EpisodeManager } from "./episode-manager.js";
import { VideoPlayer } from "./video-player.js";
import { VideoExtractionUI } from "./video-extraction-ui.js";
import { ChibiAnimations } from "./chibi-animations.js";
import { AutoPlayNext } from "./auto-play-next.js";
import { FavoritesUIManager } from "./favorites-manager.js";

class AnimeApp {
  constructor() {
    this.animeInfoManager = new AnimeInfoManager(window.electronAPI);
    this.episodeManager = new EpisodeManager(window.electronAPI);
    this.videoPlayer = new VideoPlayer();
    this.extractionUI = new VideoExtractionUI();
    this.chibiAnimations = new ChibiAnimations();
    this.autoPlayNext = new AutoPlayNext(this.videoPlayer, this);
    this.favoritesManager = new FavoritesUIManager();

    // Debounce pour la navigation d'épisodes
    this.navigationDebounceTimer = null;
    this.navigationDebounceDelay = 800; // 800ms d'attente après le dernier clic
    this.pendingNavigationIndex = null;

    // Données de l'anime
    this.currentAnimeId = null;
    this.currentEpisodes = []; // Liste des épisodes de la saison actuelle

    // Protection contre les extractions multiples
    this.isExtracting = false;

    // Charger les paramètres
    this.settings = this.loadSettings();

    // Configurer le callback de fin de vidéo
    this.videoPlayer.onVideoEnded = () => this.handleVideoEnded();
  }

  loadSettings() {
    const defaultSettings = {
      defaultLanguage: "vostfr",
      autoPlay: false,
      videoQuality: "auto",
      visualEffects: true,
      theme: "dark",
      animations: true,
      watchHistory: true,
    };

    const saved = localStorage.getItem("nartya_settings");
    return saved
      ? { ...defaultSettings, ...JSON.parse(saved) }
      : defaultSettings;
  }

  async initialize() {
    const urlParams = new URLSearchParams(window.location.search);
    const animeId = urlParams.get("id");

    // Validation stricte de l'ID
    if (!animeId) {
      this.displayError("ID de l'anime non fourni");
      return;
    }

    // Sécurité : valider le format de l'ID (alphanumériques, tirets, underscores, points)
    if (!/^[a-zA-Z0-9\-_.]+$/.test(animeId)) {
      this.displayError("ID de l'anime invalide");
      console.error("⚠️ Tentative d'accès avec ID invalide:", animeId);
      return;
    }

    // Limiter la longueur pour éviter les abus
    if (animeId.length > 100) {
      this.displayError("ID de l'anime trop long");
      return;
    }

    // Stocker l'ID de l'anime
    this.currentAnimeId = animeId;

    await this.loadAnimeInfo(animeId);

    // Initialiser les chibis seulement si les effets visuels sont activés
    if (this.settings.visualEffects) {
      this.chibiAnimations.initialize();
    }
  }

  async loadAnimeInfo(animeId) {
    try {
      const result = await this.animeInfoManager.loadAnimeInfo(animeId);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Utiliser le slug de l'anime trouvé comme identifiant unique
      // pour garantir la cohérence dans toute l'application
      if (result.anime && result.anime.slug) {
        this.currentAnimeId = result.anime.slug;
        console.log(
          "✅ Utilisation du slug comme ID unique:",
          this.currentAnimeId
        );
      }

      const animeContent = document.getElementById("animeContent");
      animeContent.innerHTML = this.animeInfoManager.displayAnimeInfo(
        result.anime
      );

      // Ajouter le bouton favori
      await this.addFavoriteButton();

      await this.loadSeasons(this.currentAnimeId);
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
      this.displayError(error.message);
    }
  }

  async loadSeasons(animeId) {
    const result = await this.animeInfoManager.loadSeasons(animeId);
    const seasonsContainer = document.getElementById("seasonsContainer");

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
    seasonsContainer.innerHTML = this.animeInfoManager.displaySeasons(
      result.seasons
    );

    // Attacher l'événement au sélecteur
    const seasonSelect = document.getElementById("seasonSelect");
    if (seasonSelect) {
      seasonSelect.addEventListener("change", (e) => {
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

    // Réinitialiser le cache des épisodes lors du changement de saison
    this.episodeManager.clearCache();

    // Réinitialiser l'état de l'analyseur de sources
    this.episodeManager.sourcesAnalysis = {};

    try {
      await this.loadEpisodes(animeId, seasonId, seasonName);
    } catch (error) {
      console.error("Erreur lors du chargement des épisodes:", error);
      alert("Erreur lors du chargement des épisodes: " + error.message);
    }
  }

  async loadEpisodes(animeId, seasonId, seasonName = null) {
    const currentAnime = this.animeInfoManager.getCurrentAnime();

    // Utiliser le slug de l'anime au lieu de l'animeId
    // car le scraper a besoin du slug, pas de l'ID AniList
    if (!currentAnime || !currentAnime.slug) {
      throw new Error("Anime non chargé ou slug manquant");
    }

    const slug = currentAnime.slug;

    const result = await this.episodeManager.loadEpisodes(
      slug,
      seasonId,
      currentAnime,
      seasonName
    );
    const episodesContainer = document.getElementById("episodesContainer");

    if (!result.success) {
      episodesContainer.innerHTML = `
                <div class="error">
                    <div class="error-icon">⚠️</div>
                    <div>Impossible de charger les épisodes: ${result.error}</div>
                </div>
            `;
      return;
    }

    // Charger les progressions pour cet anime
    await this.loadEpisodesProgress(animeId);

    this.displayEpisodes(result.episodes);

    // Démarrer le pré-chargement des premiers épisodes en arrière-plan
    this.startBackgroundPreloading();
  }

  /**
   * Charge les progressions vidéo pour l'anime actuel
   */
  async loadEpisodesProgress(animeId) {
    try {
      const result = await window.electronAPI.getAnimeProgress(animeId);

      if (result.success) {
        this.episodeManager.setProgressData(result.progress);
      }
    } catch (error) {
      console.error("Erreur lors du chargement des progressions:", error);
    }
  }

  /**
   * Démarre le pré-chargement des premiers épisodes en arrière-plan
   */
  async startBackgroundPreloading() {
    // Vérifier si le préchargement est désactivé dans les paramètres
    if (this.settings.preloadRange === 0) {
      console.log("⏸️ Préchargement désactivé dans les paramètres");
      return;
    }

    // Attendre 2 secondes pour laisser l'utilisateur charger la page tranquillement
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Initialiser la liste d'épisodes SANS vider le cache
    this.episodeManager.initializeEpisodeList(
      this.episodeManager.currentLanguage,
      this.episodeManager.currentSource,
      false
    );

    // Utiliser la plage de préchargement des paramètres
    const episodeCount = Math.min(
      this.settings.preloadRange,
      this.episodeManager.currentEpisodeList.length
    );

    if (episodeCount > 0) {
      console.log(
        `🎬 Pré-chargement automatique des ${episodeCount} premiers épisodes...`
      );

      // Afficher un indicateur subtil
      this.showPreloadingIndicator(episodeCount);

      // Pré-charger avec loading visuel sur les vignettes
      await this.episodeManager.preloadMultipleEpisodes(0, episodeCount, true);

      // Masquer l'indicateur après un délai
      setTimeout(() => this.hidePreloadingIndicator(), 1000);
    }
  }

  showPreloadingIndicator(count) {
    const indicator = document.createElement("div");
    indicator.id = "preloadIndicator";
    indicator.className = "preload-indicator";
    indicator.innerHTML = `
            <div class="preload-content">
                <div class="preload-spinner"></div>
                <span>Pré-chargement de ${count} épisode${
      count > 1 ? "s" : ""
    }...</span>
            </div>
        `;
    document.body.appendChild(indicator);

    // Ajouter les styles si pas déjà présents
    if (!document.getElementById("preload-indicator-styles")) {
      const style = document.createElement("style");
      style.id = "preload-indicator-styles";
      style.textContent = `
                .preload-indicator {
                    position: fixed;
                    bottom: 2rem;
                    right: 2rem;
                    background: rgba(10, 10, 10, 0.95);
                    border: 1px solid rgba(99, 102, 241, 0.3);
                    border-radius: 8px;
                    padding: 0.75rem 1.25rem;
                    z-index: 9999;
                    animation: slideInUp 0.3s ease-out;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }

                .preload-content {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    color: #e4e4e7;
                    font-size: 0.9rem;
                    font-weight: 500;
                }

                .preload-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(99, 102, 241, 0.2);
                    border-radius: 50%;
                    border-top-color: #6366f1;
                    animation: spin 0.8s linear infinite;
                }

                @keyframes slideInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .preload-indicator.hide {
                    animation: slideOutDown 0.3s ease-out forwards;
                }

                @keyframes slideOutDown {
                    from {
                        opacity: 1;
                        transform: translateY(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                }
            `;
      document.head.appendChild(style);
    }
  }

  hidePreloadingIndicator() {
    const indicator = document.getElementById("preloadIndicator");
    if (indicator) {
      indicator.classList.add("hide");
      setTimeout(() => indicator.remove(), 300);
    }
  }

  displayEpisodes(episodes) {
    const episodesContainer = document.getElementById("episodesContainer");

    if (!episodes || Object.keys(episodes).length === 0) {
      episodesContainer.innerHTML = `
                <div class="error">
                    <div class="error-icon">📺</div>
                    <div>Aucun épisode disponible pour cette saison.</div>
                </div>
            `;
      return;
    }

    // Filtrer les langues qui ont au moins une source avec des épisodes
    const allLanguages = Object.keys(episodes);
    const languages = allLanguages.filter((lang) => {
      const sources = episodes[lang];
      if (!sources || Object.keys(sources).length === 0) {
        console.log(`⚠️ Langue ${lang.toUpperCase()} ignorée : aucune source`);
        return false;
      }

      // Vérifier qu'au moins une source a des épisodes
      const hasEpisodes = Object.values(sources).some(
        (episodeList) => Array.isArray(episodeList) && episodeList.length > 0
      );

      if (!hasEpisodes) {
        console.log(
          `⚠️ Langue ${lang.toUpperCase()} ignorée : aucun épisode dans les sources`
        );
      }

      return hasEpisodes;
    });

    // Vérifier qu'il reste au moins une langue avec des épisodes
    if (languages.length === 0) {
      episodesContainer.innerHTML = `
                <div class="error">
                    <div class="error-icon">📺</div>
                    <div>Aucun épisode disponible pour cette saison.</div>
                </div>
            `;
      return;
    }

    console.log(
      `📋 Langues disponibles (avec épisodes) : ${languages
        .map((l) => l.toUpperCase())
        .join(", ")}`
    );

    // Sélectionner intelligemment la langue en fonction des paramètres
    // Priorité : Langue par défaut > VOSTFR > VF > première disponible
    const preferredLanguage = this.settings.defaultLanguage;

    if (languages.includes(preferredLanguage)) {
      this.episodeManager.currentLanguage = preferredLanguage;
      console.log(
        `🌐 Langue sélectionnée (paramètres) : ${this.episodeManager.currentLanguage.toUpperCase()}`
      );
    } else if (languages.includes("vostfr")) {
      this.episodeManager.currentLanguage = "vostfr";
      console.log(
        `🌐 Langue sélectionnée (fallback VOSTFR) : ${this.episodeManager.currentLanguage.toUpperCase()}`
      );
    } else if (languages.includes("vf")) {
      this.episodeManager.currentLanguage = "vf";
      console.log(
        `🌐 Langue sélectionnée (fallback VF) : ${this.episodeManager.currentLanguage.toUpperCase()}`
      );
    } else {
      this.episodeManager.currentLanguage = languages[0];
      console.log(
        `🌐 Langue sélectionnée (première disponible) : ${this.episodeManager.currentLanguage.toUpperCase()}`
      );
    }

    const currentLanguageEpisodes =
      episodes[this.episodeManager.currentLanguage];

    // Vérifier que la langue existe
    if (!currentLanguageEpisodes) {
      console.error(
        `❌ Langue ${this.episodeManager.currentLanguage} non disponible`
      );
      episodesContainer.innerHTML = `
                <div class="error">
                    <div class="error-icon">📺</div>
                    <div>Aucun épisode disponible pour cette langue.</div>
                </div>
            `;
      return;
    }

    // Filtrer les sources qui ont des épisodes
    const allSources = Object.keys(currentLanguageEpisodes);
    const sources = allSources.filter((source) => {
      const episodeList = currentLanguageEpisodes[source];
      const hasEpisodes = Array.isArray(episodeList) && episodeList.length > 0;

      if (!hasEpisodes) {
        console.log(`⚠️ Source ${source} ignorée : aucun épisode`);
      }

      return hasEpisodes;
    });

    // Vérifier qu'il y a des sources avec des épisodes
    if (sources.length === 0) {
      console.error(
        `❌ Aucune source avec épisodes pour la langue ${this.episodeManager.currentLanguage}`
      );
      episodesContainer.innerHTML = `
                <div class="error">
                    <div class="error-icon">📺</div>
                    <div>Aucune source disponible pour cette langue.</div>
                </div>
            `;
      return;
    }

    this.episodeManager.currentSource = sources[0];
    console.log(
      `📦 Sources disponibles : ${sources.join(", ")} (${
        sources.length
      } source${sources.length > 1 ? "s" : ""})`
    );

    // Initialiser la liste d'épisodes pour le pré-chargement
    this.episodeManager.initializeEpisodeList(
      this.episodeManager.currentLanguage,
      this.episodeManager.currentSource,
      false
    );

    // Générer les options de saison
    const seasonsOptions =
      this.seasons && this.seasons.length > 0
        ? this.seasons
            .map(
              (season) => `
                <option value="${season.id}" ${
                season.id === this.animeInfoManager.getCurrentSeason()?.id
                  ? "selected"
                  : ""
              }>
                    ${season.name}
                </option>
            `
            )
            .join("")
        : "<option>Saison 1</option>";

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
                            ${sources
                              .map(
                                (source, index) => `
                                <option value="${source}" ${
                                  source === this.episodeManager.currentSource
                                    ? "selected"
                                    : ""
                                }>
                                    Source ${index + 1}
                                </option>
                            `
                              )
                              .join("")}
                        </select>
                    </div>
                    
                    <div class="episode-search-wrapper">
                        <svg class="episode-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                        <input 
                            type="text" 
                            id="episodeSearchInput" 
                            class="episode-search-input" 
                            placeholder="Rechercher un épisode..."
                            autocomplete="off"
                        />
                        <svg class="episode-search-clear" id="episodeSearchClear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                            <path d="M18 6L6 18M6 6l12 12"></path>
                        </svg>
                    </div>
                </div>
                
                <div class="language-selector">
                    <div class="language-label">Langue :</div>
                    <div class="language-tabs" id="languageTabs">
                        ${languages
                          .map(
                            (lang) => `
                            <button class="language-tab ${
                              lang === this.episodeManager.currentLanguage
                                ? "active"
                                : ""
                            }" 
                                    data-lang="${lang}">
                                ${lang.toUpperCase()}
                            </button>
                        `
                          )
                          .join("")}
                    </div>
                </div>
            </div>
            
            <div class="episodes-grid" id="episodesGrid">
                ${this.episodeManager.displayEpisodesForLanguageAndSource(
                  this.episodeManager.currentLanguage,
                  this.episodeManager.currentSource
                )}
            </div>
        `;

    // Attacher les événements
    this.attachEpisodesEvents();

    // Afficher les barres de progression après un court délai pour que le DOM soit prêt
    setTimeout(() => this.updateProgressBars(), 100);
  }

  attachEpisodesEvents() {
    // Onglets de langue
    document.querySelectorAll(".language-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const language = e.target.dataset.lang;
        this.switchLanguage(language);
      });
    });

    // Sélecteur de saison dans les contrôles d'épisodes
    const seasonSelectEpisodes = document.getElementById(
      "seasonSelectEpisodes"
    );
    if (seasonSelectEpisodes) {
      seasonSelectEpisodes.addEventListener("change", (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        const seasonId = selectedOption.value;
        const seasonName = selectedOption.text;

        // Synchroniser avec le sélecteur principal
        const mainSeasonSelect = document.getElementById("seasonSelect");
        if (mainSeasonSelect) {
          mainSeasonSelect.value = seasonId;
        }

        // Récupérer l'animeId depuis l'URL
        const urlParams = new URLSearchParams(window.location.search);
        const animeId = urlParams.get("id");

        this.selectSeason(animeId, seasonId, seasonName);
      });
    }

    // Sélecteur de source
    const sourceSelect = document.getElementById("sourceSelect");
    if (sourceSelect) {
      sourceSelect.addEventListener("change", (e) => {
        const source = e.target.value;
        this.switchSource(source);
      });
    }

    // Recherche d'épisodes
    const episodeSearchInput = document.getElementById("episodeSearchInput");
    const episodeSearchClear = document.getElementById("episodeSearchClear");
    if (episodeSearchInput) {
      episodeSearchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        this.filterEpisodes(query);

        // Afficher/masquer le bouton clear
        if (episodeSearchClear) {
          episodeSearchClear.style.display = query ? "block" : "none";
        }
      });
    }

    if (episodeSearchClear) {
      episodeSearchClear.addEventListener("click", () => {
        if (episodeSearchInput) {
          episodeSearchInput.value = "";
          episodeSearchInput.dispatchEvent(new Event("input"));
          episodeSearchInput.focus();
        }
      });
    }

    // Items d'épisodes
    const episodeItems = document.querySelectorAll(".episode-item");
    console.log(
      `📌 Attachement des événements à ${episodeItems.length} épisodes`
    );

    episodeItems.forEach((item) => {
      item.addEventListener("click", () => {
        console.log("🖱️ Clic sur épisode détecté");
        const episodeUrl = item.dataset.url;
        const episodeNumber = parseInt(item.dataset.number);
        console.log(`Episode URL: ${episodeUrl}, Number: ${episodeNumber}`);
        this.playEpisode(episodeUrl, episodeNumber);
      });
    });
  }

  filterEpisodes(query) {
    const episodeItems = document.querySelectorAll(".episode-item");
    let visibleCount = 0;

    episodeItems.forEach((item) => {
      const episodeNumber = item.dataset.number;
      const episodeTitle =
        item.querySelector(".episode-title")?.textContent.toLowerCase() || "";
      const episodeDescription =
        item.querySelector(".episode-description")?.textContent.toLowerCase() ||
        "";

      // Recherche par numéro ou texte
      const matchesNumber = episodeNumber.includes(query);
      const matchesText =
        episodeTitle.includes(query) || episodeDescription.includes(query);

      if (!query || matchesNumber || matchesText) {
        item.style.display = "";
        item.style.animation = "fadeInUp 0.3s ease-out";
        visibleCount++;
      } else {
        item.style.display = "none";
      }
    });

    // Afficher un message si aucun résultat
    const episodesGrid = document.getElementById("episodesGrid");
    let noResultsMsg = episodesGrid.querySelector(".no-results-message");

    if (visibleCount === 0 && query) {
      if (!noResultsMsg) {
        noResultsMsg = document.createElement("div");
        noResultsMsg.className = "no-results-message";
        noResultsMsg.innerHTML = `
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <p>Aucun épisode trouvé pour "${query}"</p>
                `;
        episodesGrid.appendChild(noResultsMsg);
      }
    } else if (noResultsMsg) {
      noResultsMsg.remove();
    }
  }

  switchLanguage(language) {
    const result = this.episodeManager.switchLanguage(language);

    // Vider le cache car on change de langue
    this.episodeManager.clearCache();
    console.log("🗑️ Cache vidé - changement de langue");

    document.querySelectorAll(".language-tab").forEach((tab) => {
      tab.classList.remove("active");
      if (tab.dataset.lang === language) {
        tab.classList.add("active");
      }
    });

    // Mettre à jour le sélecteur de source
    const sourceSelect = document.getElementById("sourceSelect");
    if (sourceSelect) {
      console.log(result.sources);
      sourceSelect.innerHTML = result.sources
        .map(
          (source, index) => `
                <option value="${source}" ${
            source === result.currentSource ? "selected" : ""
          }>
                    Source ${index + 1}
                </option>
            `
        )
        .join("");
    }

    // Initialiser la liste d'épisodes pour la nouvelle langue/source
    this.episodeManager.initializeEpisodeList(
      language,
      result.currentSource,
      true
    );

    document.getElementById("episodesGrid").innerHTML =
      this.episodeManager.displayEpisodesForLanguageAndSource(
        language,
        result.currentSource
      );

    this.attachEpisodesEvents();
  }

  switchSource(source) {
    this.episodeManager.switchSource(source);

    // Vider le cache car on change de source
    this.episodeManager.clearCache();
    console.log("🗑️ Cache vidé - changement de source");

    // Initialiser la liste d'épisodes pour la nouvelle source
    this.episodeManager.initializeEpisodeList(
      this.episodeManager.currentLanguage,
      source,
      true
    );

    document.getElementById("episodesGrid").innerHTML =
      this.episodeManager.displayEpisodesForLanguageAndSource(
        this.episodeManager.currentLanguage,
        source
      );

    this.attachEpisodesEvents();
  }

  async playEpisode(episodeUrl, episodeNumber) {
    // Protection contre les extractions multiples
    if (this.isExtracting) {
      console.log("⏸️ Extraction déjà en cours, ignoré");
      return;
    }

    console.log(`🎬 Lecture de l'épisode ${episodeNumber}`);

    // Initialiser la liste SANS vider le cache (clearCache = false)
    this.episodeManager.initializeEpisodeList(
      this.episodeManager.currentLanguage,
      this.episodeManager.currentSource,
      false
    );
    this.episodeManager.setCurrentEpisodeIndex(episodeNumber);

    // Vérifier si l'utilisateur a une progression sur cet épisode
    const settings = this.loadSettings();
    if (settings.trackProgress && !settings.autoResume) {
      // Mode manuel : afficher le modal
      const episodeIndex = episodeNumber - 1;
      const progress = this.episodeManager.getEpisodeProgress(episodeIndex);

      if (
        progress &&
        progress.progressPercent > 5 &&
        progress.progressPercent < 95
      ) {
        const shouldResume = await this.showResumeModal(
          progress,
          episodeNumber
        );
        this.pendingResumeTime = shouldResume ? progress.currentTime : 0;
      } else {
        this.pendingResumeTime = 0;
      }
    } else if (settings.trackProgress && settings.autoResume) {
      // Mode automatique : reprendre directement sans modal
      const episodeIndex = episodeNumber - 1;
      const progress = this.episodeManager.getEpisodeProgress(episodeIndex);

      if (
        progress &&
        progress.progressPercent > 5 &&
        progress.progressPercent < 95
      ) {
        this.pendingResumeTime = progress.currentTime;
      } else {
        this.pendingResumeTime = 0;
      }
    } else {
      this.pendingResumeTime = 0;
    }

    const episodeIndex = episodeNumber - 1;

    // Vérifier si l'épisode est déjà en cache
    const cachedData = this.episodeManager.getCachedEpisode(episodeIndex);
    if (cachedData) {
      console.log(
        `⚡ Épisode ${episodeNumber} trouvé en cache - lecture instantanée !`
      );

      const currentAnime = this.animeInfoManager.getCurrentAnime();
      const animeTitle =
        currentAnime?.title?.romaji || currentAnime?.title?.english || "Anime";
      this.openVideoPlayer(cachedData.videoUrl, episodeNumber, animeTitle);

      // Mettre en cache les épisodes adjacents en arrière-plan
      setTimeout(() => {
        this.episodeManager.cacheAdjacentEpisodes(episodeIndex);
      }, 1000);

      return;
    }

    // Pas en cache, on doit extraire
    this.isExtracting = true;

    // Trouver la meilleure source pour cet épisode (priorise Vidmoly, évite Sibnet)
    const episodeInfo =
      this.episodeManager.getEpisodeUrlWithAlternative(episodeIndex);
    const finalUrl = episodeInfo.url || episodeUrl;

    if (episodeInfo.isAlternative) {
      console.log(
        `🔄 Utilisation d'une source optimisée: ${episodeInfo.source} (${episodeInfo.provider}) au lieu de ${episodeInfo.originalSource} (${episodeInfo.originalProvider})`
      );
    } else if (episodeInfo.provider === "sibnet") {
      console.log(
        `⚠️ Aucune alternative rapide disponible, utilisation de Sibnet`
      );
    }

    // Afficher le loading sur la vignette au lieu du modal
    this.showEpisodeLoading(episodeNumber);
    this.disableAllEpisodes();

    try {
      const result = await window.electronAPI.extractVideoUrl(
        finalUrl.replace("vidmoly.to", "vidmoly.net")
      );

      if (result.success && result.videoUrl) {
        console.log("✅ URL de la vidéo extraite:", result.videoUrl);

        this.episodeManager.cacheEpisode(
          episodeIndex,
          result.videoUrl,
          finalUrl
        );
        this.hideEpisodeLoading(episodeNumber);

        const currentAnime = this.animeInfoManager.getCurrentAnime();
        const animeTitle =
          currentAnime?.title?.romaji ||
          currentAnime?.title?.english ||
          "Anime";
        this.openVideoPlayer(result.videoUrl, episodeNumber, animeTitle);

        // Mettre en cache les épisodes adjacents en arrière-plan
        setTimeout(() => {
          this.episodeManager.cacheAdjacentEpisodes(episodeIndex);
        }, 1000);
      } else {
        // Échec de l'extraction - vérifier si c'est une erreur récupérable
        const isRecoverableError =
          this.episodeManager.sourceAnalyzer.isExtractionError(result.error);

        if (isRecoverableError) {
          console.warn(
            "⚠️ Erreur détectée, tentative de basculement vers une source alternative..."
          );

          // Essayer de trouver une source alternative
          const alternative = await this.tryAlternativeSource(
            episodeIndex,
            episodeNumber,
            episodeInfo.source
          );

          if (alternative.success) {
            return; // L'alternative a fonctionné, on sort
          }
        }

        // Pas d'alternative ou échec de l'alternative
        console.error("❌ Échec de l'extraction:", result);
        this.hideEpisodeLoading(episodeNumber);
        this.showEpisodeError(episodeNumber, result);
      }
    } catch (error) {
      console.error("❌ Erreur lors de l'extraction:", error);

      // Vérifier si c'est une erreur récupérable
      const isRecoverableError =
        this.episodeManager.sourceAnalyzer.isExtractionError(error);

      if (isRecoverableError) {
        console.warn(
          "⚠️ Erreur détectée, tentative de basculement vers une source alternative..."
        );

        // Essayer de trouver une source alternative
        const alternative = await this.tryAlternativeSource(
          episodeIndex,
          episodeNumber,
          episodeInfo.source
        );

        if (alternative.success) {
          return; // L'alternative a fonctionné, on sort
        }
      }

      this.hideEpisodeLoading(episodeNumber);
      this.showEpisodeError(episodeNumber, {
        error: error.message,
        userMessage:
          "Une erreur inattendue s'est produite. Veuillez réessayer.",
        errorCode: "UNKNOWN_ERROR",
      });
    } finally {
      // Déverrouiller après l'extraction (succès ou échec)
      this.isExtracting = false;
      this.enableAllEpisodes();
    }
  }

  /**
   * Tente de lire l'épisode avec une source alternative
   */
  async tryAlternativeSource(episodeIndex, episodeNumber, currentSource) {
    try {
      // Afficher l'indicateur de changement de source
      this.showSourceSwitchIndicator(episodeNumber, currentSource);

      // Trouver la meilleure alternative
      const alternative =
        this.episodeManager.sourceAnalyzer.findBestAlternativeForEpisode(
          episodeIndex,
          this.episodeManager.sourcesAnalysis,
          currentSource
        );

      if (!alternative) {
        console.error("❌ Aucune source alternative disponible");
        this.hideSourceSwitchIndicator(episodeNumber);
        return { success: false };
      }

      console.log(
        `🔄 Basculement vers: ${alternative.sourceName} (${alternative.provider})`
      );

      // Attendre un peu pour que l'utilisateur voie le message
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Extraire avec la source alternative
      const result = await window.electronAPI.extractVideoUrl(
        alternative.url.replace("vidmoly.to", "vidmoly.net")
      );

      if (result.success && result.videoUrl) {
        console.log("✅ Extraction réussie avec la source alternative !");

        this.episodeManager.cacheEpisode(
          episodeIndex,
          result.videoUrl,
          alternative.url
        );
        this.hideSourceSwitchIndicator(episodeNumber);
        this.hideEpisodeLoading(episodeNumber);

        const currentAnime = this.animeInfoManager.getCurrentAnime();
        const animeTitle =
          currentAnime?.title?.romaji ||
          currentAnime?.title?.english ||
          "Anime";
        this.openVideoPlayer(result.videoUrl, episodeNumber, animeTitle);

        // Afficher une notification de succès
        this.showSourceSwitchSuccess(alternative.sourceName);

        // Mettre en cache les épisodes adjacents en arrière-plan
        setTimeout(() => {
          this.episodeManager.cacheAdjacentEpisodes(episodeIndex);
        }, 1000);

        return { success: true };
      } else {
        console.error("❌ L'alternative a aussi échoué");
        this.hideSourceSwitchIndicator(episodeNumber);
        return { success: false };
      }
    } catch (error) {
      console.error(
        "❌ Erreur lors de la tentative avec source alternative:",
        error
      );
      this.hideSourceSwitchIndicator(episodeNumber);
      return { success: false };
    }
  }

  showSourceSwitchIndicator(episodeNumber, failedSource) {
    const episodeCard = document.querySelector(
      `.episode-card[data-episode="${episodeNumber}"]`
    );
    if (episodeCard) {
      const overlay = episodeCard.querySelector(".episode-loading-overlay");
      if (overlay) {
        overlay.style.display = "flex";
        overlay.style.background = "rgba(251, 146, 60, 0.95)";
        overlay.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; text-align: center;">
                        <div class="episode-loading-spinner" style="border-color: rgba(255, 255, 255, 0.3); border-top-color: white;"></div>
                        <div style="font-size: 0.875rem; font-weight: 600; color: white;">Source défaillante</div>
                        <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.9);">Changement de source...</div>
                    </div>
                `;
      }
    }
  }

  hideSourceSwitchIndicator(episodeNumber) {
    const episodeCard = document.querySelector(
      `.episode-card[data-episode="${episodeNumber}"]`
    );
    if (episodeCard) {
      const overlay = episodeCard.querySelector(".episode-loading-overlay");
      if (overlay) {
        overlay.style.display = "none";
        overlay.style.background = "rgba(10, 10, 10, 0.95)";
      }
    }
  }

  showSourceSwitchSuccess(newSource) {
    const notification = document.createElement("div");
    notification.className = "source-switch-notification";
    notification.innerHTML = `
            <div class="source-switch-content">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px; color: #10b981;">
                    <path d="M20 6L9 17l-5-5"/>
                </svg>
                <span>Source changée : <strong>${newSource}</strong></span>
            </div>
        `;

    document.body.appendChild(notification);

    // Ajouter les styles si pas déjà présents
    if (!document.getElementById("source-switch-notification-styles")) {
      const style = document.createElement("style");
      style.id = "source-switch-notification-styles";
      style.textContent = `
                .source-switch-notification {
                    position: fixed;
                    top: 5rem;
                    right: 2rem;
                    background: rgba(10, 10, 10, 0.95);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    border-radius: 8px;
                    padding: 1rem 1.5rem;
                    z-index: 10000;
                    animation: slideInRight 0.3s ease-out;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }

                .source-switch-content {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    color: #e5e5e5;
                    font-size: 0.875rem;
                }

                .source-switch-content strong {
                    color: #10b981;
                }

                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
      document.head.appendChild(style);
    }

    // Retirer après 4 secondes
    setTimeout(() => {
      notification.style.animation = "slideInRight 0.3s ease-out reverse";
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  showEpisodeLoading(episodeNumber) {
    const episodeCard = document.querySelector(
      `.episode-card[data-episode="${episodeNumber}"]`
    );
    if (episodeCard) {
      const overlay = episodeCard.querySelector(".episode-loading-overlay");
      if (overlay) {
        overlay.style.display = "flex";
        // Réinitialiser le contenu au cas où il y aurait une checkmark
        overlay.innerHTML = '<div class="episode-loading-spinner"></div>';
      }
    }
  }

  hideEpisodeLoading(episodeNumber) {
    const episodeCard = document.querySelector(
      `.episode-card[data-episode="${episodeNumber}"]`
    );
    if (episodeCard) {
      const overlay = episodeCard.querySelector(".episode-loading-overlay");
      if (overlay) {
        overlay.style.display = "none";
      }
    }
  }

  disableAllEpisodes() {
    const episodes = document.querySelectorAll(".episode-card");
    episodes.forEach((ep) => {
      ep.classList.add("disabled");
      ep.style.pointerEvents = "none";
      ep.style.opacity = "0.5";
    });
  }

  enableAllEpisodes() {
    const episodes = document.querySelectorAll(".episode-card");
    episodes.forEach((ep) => {
      ep.classList.remove("disabled");
      ep.style.pointerEvents = "";
      ep.style.opacity = "";
    });
  }

  showEpisodeError(episodeNumber, errorResult) {
    // Afficher une notification toast au lieu du modal
    const toast = document.createElement("div");
    toast.className = "error-toast";
    toast.innerHTML = `
            <div class="error-toast-content">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <div class="error-toast-text">
                    <div class="error-toast-title">Erreur épisode ${episodeNumber}</div>
                    <div class="error-toast-message">${
                      errorResult.userMessage ||
                      errorResult.error ||
                      "Erreur inconnue"
                    }</div>
                </div>
            </div>
        `;
    document.body.appendChild(toast);

    // Animation d'apparition
    setTimeout(() => toast.classList.add("show"), 10);

    // Retirer après 5 secondes
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  openVideoPlayer(videoUrl, episodeNumber, animeTitle) {
    this.videoPlayer.initialize();

    const modal = document.getElementById("videoPlayerModal");
    const episodeTitleEl = document.getElementById("playerEpisodeTitle");
    const animeTitleEl = document.getElementById("playerAnimeTitle");

    episodeTitleEl.textContent = `Épisode ${episodeNumber}`;
    animeTitleEl.textContent = animeTitle;

    // Fermer le modal en cliquant sur le fond
    modal.onclick = (e) => {
      if (e.target === modal) {
        this.closeVideoPlayer();
      }
    };

    // Passer les informations de l'épisode au player pour le suivi
    const currentAnime = this.animeInfoManager.getCurrentAnime();
    const currentSeason = this.animeInfoManager.getCurrentSeason();
    const animeInfo = {
      title: animeTitle,
      cover:
        currentAnime?.coverImage?.large || currentAnime?.coverImage?.medium,
      seasonName: currentSeason?.name || "Saison 1",
    };

    // Utiliser le seasonId actuel de l'episodeManager (qui est le vrai seasonId utilisé pour charger les épisodes)
    const actualSeasonId =
      this.episodeManager.currentSeasonId || this.currentAnimeId;

    this.videoPlayer.setEpisodeInfo(
      this.currentAnimeId,
      episodeNumber,
      actualSeasonId,
      animeInfo
    );

    // Afficher le modal
    modal.classList.add("active");
    document.body.style.overflow = "hidden";

    // Afficher le loading pendant l'initialisation de la vidéo
    this.showPlayerLoading();

    // Charger la vidéo
    this.videoPlayer.loadVideo(videoUrl);
    this.updateNavigationButtons();

    // Masquer le loading quand la vidéo est prête
    this.setupPlayerLoadingListeners();

    // Appliquer le temps de reprise si défini
    if (this.pendingResumeTime && this.pendingResumeTime > 0) {
      this.videoPlayer.seekToTime(this.pendingResumeTime);
      this.pendingResumeTime = 0; // Réinitialiser
    }
  }

  showPlayerLoading() {
    const playerContainer = document.querySelector(".player-container");
    if (!playerContainer) return;

    // Créer l'overlay de loading s'il n'existe pas
    let loadingOverlay = document.getElementById("playerLoadingOverlay");
    if (!loadingOverlay) {
      loadingOverlay = document.createElement("div");
      loadingOverlay.id = "playerLoadingOverlay";
      loadingOverlay.className = "player-loading-overlay";
      loadingOverlay.innerHTML = `
                <div class="player-loading-content">
                    <div class="player-loading-spinner"></div>
                    <div class="player-loading-text">Initialisation de la vidéo...</div>
                </div>
            `;
      playerContainer.appendChild(loadingOverlay);

      // Ajouter les styles si pas déjà présents
      if (!document.getElementById("player-loading-styles")) {
        const style = document.createElement("style");
        style.id = "player-loading-styles";
        style.textContent = `
                    .player-loading-overlay {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.9);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 100;
                        backdrop-filter: blur(5px);
                    }

                    .player-loading-content {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 1rem;
                    }

                    .player-loading-spinner {
                        width: 50px;
                        height: 50px;
                        border: 4px solid rgba(99, 102, 241, 0.2);
                        border-radius: 50%;
                        border-top-color: #6366f1;
                        animation: playerSpin 0.8s linear infinite;
                    }

                    .player-loading-text {
                        color: #e4e4e7;
                        font-size: 1rem;
                        font-weight: 500;
                    }

                    @keyframes playerSpin {
                        to { transform: rotate(360deg); }
                    }

                    .player-loading-overlay.hide {
                        animation: fadeOutPlayer 0.3s ease-out forwards;
                    }

                    @keyframes fadeOutPlayer {
                        to {
                            opacity: 0;
                            pointer-events: none;
                        }
                    }
                `;
        document.head.appendChild(style);
      }
    }

    loadingOverlay.style.display = "flex";
    loadingOverlay.classList.remove("hide");
  }

  hidePlayerLoading() {
    const loadingOverlay = document.getElementById("playerLoadingOverlay");
    if (loadingOverlay) {
      loadingOverlay.classList.add("hide");
      setTimeout(() => {
        loadingOverlay.style.display = "none";
      }, 300);
    }
  }

  setupPlayerLoadingListeners() {
    const videoElement = document.getElementById("videoPlayer");
    if (!videoElement) return;

    // Masquer le loading quand les métadonnées sont chargées (durée disponible)
    const onLoadedMetadata = () => {
      console.log("✅ Métadonnées chargées, masquage du loading");
      this.hidePlayerLoading();
      videoElement.removeEventListener("loadedmetadata", onLoadedMetadata);
    };

    // Timeout de sécurité au cas où loadedmetadata ne se déclenche pas
    const timeout = setTimeout(() => {
      console.log("⏱️ Timeout atteint, masquage du loading");
      this.hidePlayerLoading();
      videoElement.removeEventListener("loadedmetadata", onLoadedMetadata);
    }, 5000);

    videoElement.addEventListener("loadedmetadata", () => {
      clearTimeout(timeout);
      onLoadedMetadata();
    });
  }

  closeVideoPlayer() {
    const modal = document.getElementById("videoPlayerModal");
    modal.classList.remove("active");
    document.body.style.overflow = "auto";

    // Nettoyer le player
    this.videoPlayer.pause();
    this.videoPlayer.cleanupHLS();

    // Retirer l'event listener
    modal.onclick = null;

    // Rafraîchir les progressions après fermeture
    this.refreshEpisodesProgress();
  }

  /**
   * Rafraîchit l'affichage des progressions sur les épisodes
   */
  async refreshEpisodesProgress() {
    if (!this.currentAnimeId) return;

    try {
      // Recharger les progressions
      await this.loadEpisodesProgress(this.currentAnimeId);

      // Mettre à jour l'affichage des barres de progression
      this.updateProgressBars();
    } catch (error) {
      console.error("Erreur lors du rafraîchissement des progressions:", error);
    }
  }

  /**
   * Met à jour les barres de progression sur les épisodes affichés
   */
  updateProgressBars() {
    const episodeCards = document.querySelectorAll(".episode-card");

    episodeCards.forEach((card) => {
      const episodeNumber = parseInt(card.dataset.episode);
      const episodeIndex = episodeNumber - 1;

      // Récupérer la progression pour cet épisode
      const progress = this.episodeManager.getEpisodeProgress(episodeIndex);

      // Supprimer l'ancienne barre si elle existe
      const oldBar = card.querySelector(".episode-progress-bar");
      if (oldBar) {
        oldBar.remove();
      }

      // Ajouter la nouvelle barre si progression existe
      if (progress) {
        const progressBar = this.createProgressBar(progress);
        card.appendChild(progressBar);
      }
    });
  }

  /**
   * Affiche un modal pour demander si l'utilisateur veut reprendre
   * @returns {Promise<boolean>} true si l'utilisateur veut reprendre, false sinon
   */
  showResumeModal(progress, episodeNumber) {
    return new Promise((resolve) => {
      // Créer le modal
      const modal = document.createElement("div");
      modal.className = "resume-modal-overlay";

      const minutes = Math.floor(progress.currentTime / 60);
      const seconds = Math.floor(progress.currentTime % 60);
      const timeString = `${minutes}:${seconds.toString().padStart(2, "0")}`;

      modal.innerHTML = `
        <div class="resume-modal">
          <h3 class="resume-modal-title">Reprendre la lecture ?</h3>
          <p class="resume-modal-text">
            Épisode ${episodeNumber} • ${progress.progressPercent}% regardé • ${timeString}
          </p>
          <div class="resume-modal-actions">
            <button class="resume-modal-btn secondary" data-action="restart">
              Recommencer
            </button>
            <button class="resume-modal-btn primary" data-action="resume">
              Reprendre
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Animer l'apparition
      setTimeout(() => modal.classList.add("show"), 10);

      // Gérer les clics
      const handleClick = (shouldResume) => {
        modal.classList.remove("show");
        setTimeout(() => {
          modal.remove();
          resolve(shouldResume);
        }, 200);
      };

      modal
        .querySelector('[data-action="resume"]')
        .addEventListener("click", () => handleClick(true));
      modal
        .querySelector('[data-action="restart"]')
        .addEventListener("click", () => handleClick(false));

      // Fermer en cliquant sur l'overlay (reprendre par défaut)
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          handleClick(true);
        }
      });
    });
  }

  /**
   * Crée l'élément HTML de la barre de progression
   */
  createProgressBar(progress) {
    const bar = document.createElement("div");
    bar.className = "episode-progress-bar";

    const fill = document.createElement("div");
    fill.className = "episode-progress-fill";
    fill.style.width = `${progress.progressPercent}%`;

    bar.appendChild(fill);

    // Ajouter l'info de progression
    const info = document.createElement("div");
    info.className = "episode-progress-info";

    const remainingTime = progress.duration - progress.currentTime;
    const remainingMinutes = Math.floor(remainingTime / 60);

    info.textContent = `${progress.progressPercent}% • ${remainingMinutes} min restantes`;

    bar.appendChild(info);

    return bar;
  }

  async navigateEpisode(direction) {
    const newIndex = this.episodeManager.currentEpisodeIndex + direction;

    if (
      newIndex < 0 ||
      newIndex >= this.episodeManager.currentEpisodeList.length
    ) {
      return;
    }

    // Mettre à jour l'index immédiatement
    this.episodeManager.currentEpisodeIndex = newIndex;
    const episodeNumber = newIndex + 1;

    // Mettre à jour l'UI immédiatement (sans attendre l'extraction)
    document.getElementById(
      "playerEpisodeTitle"
    ).textContent = `Épisode ${episodeNumber}`;
    this.updateNavigationButtons();

    console.log(
      `🎯 Navigation vers épisode ${episodeNumber} (index: ${newIndex})`
    );

    // Stocker l'index en attente
    this.pendingNavigationIndex = newIndex;

    // Annuler le timer précédent si l'utilisateur spam
    if (this.navigationDebounceTimer) {
      console.log("⏱️ Timer annulé - nouveau clic détecté");
      clearTimeout(this.navigationDebounceTimer);
    }

    // Annuler l'animation de loading précédente si elle existe
    if (this.navigationDotInterval) {
      clearInterval(this.navigationDotInterval);
    }

    // Vérifier si l'épisode est en cache
    const cachedData = this.episodeManager.getCachedEpisode(newIndex);
    if (cachedData) {
      console.log(
        `⚡ Épisode ${episodeNumber} trouvé en cache - chargement instantané !`
      );
      this.videoPlayer.loadVideo(cachedData.videoUrl);

      // Mettre en cache les épisodes adjacents en arrière-plan
      setTimeout(() => {
        this.episodeManager.cacheAdjacentEpisodes(newIndex);
      }, 1000);
      return;
    }

    // Indicateur visuel de chargement
    const episodeTitleEl = document.getElementById("playerEpisodeTitle");
    const originalText = episodeTitleEl.textContent;
    episodeTitleEl.innerHTML = `${originalText} <span style="opacity: 0.5; font-size: 0.8em;">●</span>`;

    // Animation du point de chargement
    let dotCount = 0;
    this.navigationDotInterval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      const dots = "●".repeat(Math.max(1, dotCount)) + "○".repeat(3 - dotCount);
      if (episodeTitleEl) {
        episodeTitleEl.innerHTML = `${originalText} <span style="opacity: 0.5; font-size: 0.8em;">${dots.charAt(
          0
        )}</span>`;
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
        console.log(
          `⏭️ Épisode ${episodeNumber} ignoré - l'utilisateur a navigué ailleurs`
        );
        episodeTitleEl.textContent = originalText;
        return;
      }

      // Trouver la meilleure source pour cet épisode (priorise Vidmoly, évite Sibnet)
      const episodeInfo =
        this.episodeManager.getEpisodeUrlWithAlternative(newIndex);
      const finalUrl =
        episodeInfo.url || this.episodeManager.currentEpisodeList[newIndex];

      if (episodeInfo.isAlternative) {
        console.log(
          `🔄 Navigation: Utilisation d'une source optimisée: ${episodeInfo.source} (${episodeInfo.provider}) au lieu de ${episodeInfo.originalSource} (${episodeInfo.originalProvider})`
        );
      } else if (episodeInfo.provider === "sibnet") {
        console.log(
          `⚠️ Navigation: Aucune alternative rapide disponible, utilisation de Sibnet`
        );
      }

      console.log(
        `🔄 Extraction de l'épisode ${episodeNumber} (après debounce)...`
      );

      try {
        const result = await window.electronAPI.extractVideoUrl(finalUrl);

        // Vérifier à nouveau que c'est toujours le bon épisode
        if (this.pendingNavigationIndex !== newIndex) {
          console.log(
            `⏭️ Extraction ignorée - l'utilisateur a navigué vers un autre épisode`
          );
          episodeTitleEl.textContent = originalText;
          return;
        }

        if (result.success && result.videoUrl) {
          console.log(`✅ Épisode ${episodeNumber} extrait avec succès`);
          this.episodeManager.cacheEpisode(newIndex, result.videoUrl, finalUrl);
          this.videoPlayer.loadVideo(result.videoUrl);
          episodeTitleEl.textContent = originalText; // Nettoyer l'indicateur

          // Mettre en cache les épisodes adjacents en arrière-plan
          setTimeout(() => {
            this.episodeManager.cacheAdjacentEpisodes(newIndex);
          }, 1000);
        } else {
          console.error(
            "❌ Erreur lors du chargement de l'épisode:",
            result.error
          );
          episodeTitleEl.textContent = originalText;
          // Optionnel : afficher un message d'erreur à l'utilisateur
        }
      } catch (error) {
        console.error("❌ Erreur lors de la navigation:", error);
        episodeTitleEl.textContent = originalText;
      }
    }, this.navigationDebounceDelay);
  }

  updateNavigationButtons() {
    const prevBtn = document.getElementById("prevEpisodeBtn");
    const nextBtn = document.getElementById("nextEpisodeBtn");

    prevBtn.disabled = this.episodeManager.currentEpisodeIndex === 0;
    nextBtn.disabled =
      this.episodeManager.currentEpisodeIndex ===
      this.episodeManager.currentEpisodeList.length - 1;
  }

  /**
   * Gère la fin de la vidéo (pour auto-play next)
   */
  handleVideoEnded() {
    console.log("🎬 Vidéo terminée - vérification du prochain épisode");

    // Vérifier s'il y a un épisode suivant
    const currentIndex = this.episodeManager.currentEpisodeIndex;
    const nextIndex = currentIndex + 1;

    if (nextIndex < this.episodeManager.currentEpisodeList.length) {
      const nextEpisode = {
        index: nextIndex,
        number: nextIndex + 1,
        title: `Épisode ${nextIndex + 1}`,
      };

      // Démarrer le countdown
      this.autoPlayNext.startCountdown(nextEpisode);
    } else {
      console.log("✅ C'était le dernier épisode de la saison");
    }
  }

  /**
   * Charge un épisode par son index
   */
  async loadEpisodeByIndex(index) {
    console.log(`🎯 Chargement de l'épisode à l'index ${index}`);

    // Utiliser la méthode de navigation existante
    const direction = index - this.episodeManager.currentEpisodeIndex;
    await this.navigateEpisode(direction);
  }

  /**
   * Ajoute le bouton favori dans l'interface
   */
  async addFavoriteButton() {
    const currentAnime = this.animeInfoManager.getCurrentAnime();
    if (!currentAnime) return;

    // Créer le bouton favori
    const favoriteBtn = this.favoritesManager.createFavoriteButton(currentAnime, {
      size: "medium",
      showLabel: true,
      className: "anime-page-favorite-btn",
    });

    // Ajouter le bouton dans le header
    const headerActions = document.querySelector(".header-actions");
    if (headerActions) {
      // Insérer avant le bouton settings
      const settingsBtn = headerActions.querySelector(".nav-btn.settings");
      if (settingsBtn) {
        headerActions.insertBefore(favoriteBtn, settingsBtn);
      } else {
        headerActions.appendChild(favoriteBtn);
      }
    }
  }

  displayError(message) {
    document.getElementById("animeContent").innerHTML = `
            <div class="error">
                <div class="error-icon">❌</div>
                <div>Erreur: ${message}</div>
            </div>
        `;
  }
}

// Fonctions globales pour les événements onclick dans le HTML
window.goHome = () => {
  window.location.href = "../frontend/index.html";
};

window.closeExtractionModal = () => {
  const modal = document.getElementById("extractionModal");
  if (modal) modal.remove();
};

window.copyVideoUrl = async (videoUrl) => {
  try {
    await navigator.clipboard.writeText(videoUrl);
    console.log("URL copiée dans le presse-papiers");

    const button = event.target;
    const originalText = button.textContent;
    button.textContent = "✅ Copié !";
    button.style.background = "#4ade80";

    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = "#6366f1";
    }, 2000);
  } catch (error) {
    console.error("Erreur lors de la copie:", error);
    alert("Erreur lors de la copie de l'URL");
  }
};

window.openVideoUrl = (videoUrl) => {
  window.open(videoUrl, "_blank");
};

// Instance globale de l'app
let animeApp;

window.closeVideoPlayer = () => {
  if (window.animeApp) window.animeApp.closeVideoPlayer();
};

window.navigateEpisode = (direction) => {
  if (window.animeApp) window.animeApp.navigateEpisode(direction);
};

// Fonction pour charger un épisode par son index
window.loadEpisodeByIndex = (index) => {
  if (window.animeApp) window.animeApp.loadEpisodeByIndex(index);
};

// Initialiser l'application au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  window.animeApp = new AnimeApp(); // Rendre accessible globalement
  window.animeApp.initialize();
});
