/**
 * Gestionnaire de la page Historique
 * Affiche les 10 derniers épisodes regardés et les statistiques
 */

class HistoryApp {
  constructor() {
    this.history = [];
    this.stats = null;
    this.settings = this.loadSettings();
  }

  loadSettings() {
    const defaultSettings = {
      visualEffects: true,
      animations: true,
    };

    try {
      const saved = localStorage.getItem("nartya_settings");
      return saved
        ? { ...defaultSettings, ...JSON.parse(saved) }
        : defaultSettings;
    } catch (error) {
      console.error("Erreur lors du chargement des paramètres:", error);
      return defaultSettings;
    }
  }

  /**
   * Initialise l'application
   */
  async init() {
    console.log("🎬 Initialisation de la page Historique");

    await this.loadHistory();
    await this.loadStatistics();
    this.setupEventListeners();
    this.setupHeaderScroll();
  }

  /**
   * Charge l'historique depuis le backend
   */
  async loadHistory() {
    try {
      const result = await window.electronAPI.getWatchHistory();

      if (result.success) {
        // Limiter aux 10 derniers épisodes
        this.history = result.history.slice(0, 10);
        console.log(`📜 ${this.history.length} épisodes chargés`);
        this.displayHistory();
      } else {
        console.error(
          "Erreur lors du chargement de l'historique:",
          result.error
        );
        this.showEmptyState();
      }
    } catch (error) {
      console.error("Erreur lors du chargement de l'historique:", error);
      this.showEmptyState();
    }
  }

  /**
   * Charge les statistiques
   */
  async loadStatistics() {
    try {
      const result = await window.electronAPI.getWatchStatistics();

      if (result.success) {
        this.stats = result.stats;
        console.log("📊 Statistiques chargées:", this.stats);
        this.displayStatistics();
      }
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques:", error);
    }
  }

  /**
   * Affiche les statistiques
   */
  displayStatistics() {
    if (!this.stats) return;

    // Total épisodes
    document.getElementById("totalEpisodes").textContent =
      this.stats.totalEpisodes || 0;

    // Total animes
    document.getElementById("totalAnimes").textContent =
      this.stats.uniqueAnimes || 0;

    // Temps total
    const hours = this.stats.totalHours || 0;
    document.getElementById("totalHours").textContent = `${hours}h`;

    // Anime le plus regardé
    const mostWatched = this.stats.mostWatchedAnime;
    if (mostWatched) {
      const title =
        mostWatched.title?.romaji ||
        mostWatched.title?.english ||
        mostWatched.title?.native ||
        mostWatched.title ||
        "Inconnu";
      document.getElementById("mostWatchedAnime").textContent = title;
    } else {
      document.getElementById("mostWatchedAnime").textContent = "-";
    }
  }

  /**
   * Affiche l'historique
   */
  displayHistory() {
    const grid = document.getElementById("episodesGrid");
    const emptyState = document.getElementById("emptyState");

    if (this.history.length === 0) {
      this.showEmptyState();
      return;
    }

    grid.innerHTML = "";
    emptyState.style.display = "none";

    this.history.forEach((entry) => {
      const card = this.createEpisodeCard(entry);
      grid.appendChild(card);
    });
  }

  /**
   * Crée une card d'épisode
   */
  createEpisodeCard(entry) {
    const card = document.createElement("div");
    card.className = "episode-history-card";

    const animeTitle =
      entry.animeTitle?.romaji ||
      entry.animeTitle?.english ||
      entry.animeTitle?.native ||
      entry.animeTitle ||
      "Titre inconnu";

    const image = entry.coverImage?.large || entry.coverImage?.medium || "";

    // Calculer le temps écoulé
    const timeAgo = this.getTimeAgo(entry.lastWatchedAt);

    // Progression
    const progressPercent = entry.progressPercent || 0;
    const completed = entry.completed || progressPercent >= 95;
    const inProgress = progressPercent > 5 && progressPercent < 95;

    // Badge de statut
    let statusBadge = "";
    if (completed) {
      statusBadge = `<div class="episode-status-badge completed">
        <svg viewBo²="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Terminé
      </div>`;
    } else if (inProgress) {
      statusBadge = `<div class="episode-status-badge in-progress">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        En cours
      </div>`;
    }

    card.innerHTML = `
      <div class="episode-card-image-container">
        ${
          image
            ? `<img src="${image}" alt="${animeTitle}" class="episode-card-image" loading="lazy" />`
            : `<div class="episode-card-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </div>`
        }
        ${statusBadge}
        ${
          progressPercent > 0 && !completed
            ? `<div class="episode-progress-bar">
                <div class="episode-progress-fill" style="width: ${progressPercent}%"></div>
              </div>`
            : ""
        }
        <div class="episode-overlay">
          <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          ${
            inProgress
              ? `<div class="resume-text">Reprendre à ${Math.floor(
                  progressPercent
                )}%</div>`
              : ""
          }
        </div>
      </div>
      <div class="episode-card-content">
        <div class="episode-card-anime-title">${animeTitle}</div>
        <div class="episode-card-info">
          <span class="episode-number">Ép. ${entry.episodeNumber}</span>
          ${
            entry.language
              ? `<span class="episode-language">${entry.language.toUpperCase()}</span>`
              : ""
          }
        </div>
        <div class="episode-card-meta">
          <span class="episode-time-ago">${timeAgo}</span>
          ${
            entry.watchCount > 1
              ? `<span class="episode-watch-count">×${entry.watchCount}</span>`
              : ""
          }
        </div>
      </div>
    `;

    // Stocker les données de l'épisode sur la card pour la reprise
    card.dataset.animeId = entry.animeId || entry.slug;
    card.dataset.seasonId = entry.seasonId;
    card.dataset.episodeNumber = entry.episodeNumber;
    card.dataset.currentTime = entry.currentTime || 0;
    card.dataset.hasProgress = inProgress ? "true" : "false";

    // Événement de clic - Naviguer vers l'anime avec reprise automatique
    card.addEventListener("click", () => {
      this.playEpisode(entry);
    });

    return card;
  }

  /**
   * Calcule le temps écoulé depuis le visionnage
   */
  getTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return "À l'instant";
    if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `Il y a ${Math.floor(seconds / 86400)}j`;
    if (seconds < 2592000) return `Il y a ${Math.floor(seconds / 604800)} sem`;

    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  }

  /**
   * Lance la lecture de l'épisode avec reprise automatique
   */
  playEpisode(entry) {
    const animeId = entry.animeId || entry.slug;
    if (!animeId) return;

    // Construire l'URL avec les paramètres de reprise
    const params = new URLSearchParams({
      id: animeId,
      episode: entry.episodeNumber,
      season: entry.seasonId || animeId,
    });

    // Ajouter le temps de reprise si l'épisode est en cours
    const inProgress = entry.progressPercent > 5 && entry.progressPercent < 95;
    if (inProgress && entry.currentTime) {
      params.append("resume", entry.currentTime);
    }

    window.location.href = `anime.html?${params.toString()}`;
  }

  /**
   * Navigue vers la page de l'anime
   */
  navigateToAnime(entry) {
    const animeId = entry.animeId || entry.slug;
    if (animeId) {
      window.location.href = `anime.html?id=${animeId}`;
    }
  }

  /**
   * Affiche l'état vide
   */
  showEmptyState() {
    document.getElementById("episodesGrid").innerHTML = "";
    document.getElementById("emptyState").style.display = "flex";
  }

  /**
   * Configure les écouteurs d'événements
   */
  setupEventListeners() {
    // Bouton effacer l'historique
    const clearBtn = document.getElementById("clearHistoryBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => this.clearHistory());
    }
  }

  /**
   * Efface tout l'historique
   */
  async clearHistory() {
    const confirmed = confirm(
      "Êtes-vous sûr de vouloir effacer tout votre historique ? Cette action est irréversible."
    );

    if (!confirmed) return;

    try {
      const result = await window.electronAPI.clearAllWatchHistory();

      if (result.success) {
        this.history = [];
        this.stats = {
          totalEpisodes: 0,
          uniqueAnimes: 0,
          totalHours: 0,
          mostWatchedAnime: null,
        };
        this.displayHistory();
        this.displayStatistics();
        this.showToast("Historique effacé avec succès", "success");
      } else {
        this.showToast("Erreur lors de l'effacement", "error");
      }
    } catch (error) {
      console.error("Erreur lors de l'effacement:", error);
      this.showToast("Erreur lors de l'effacement", "error");
    }
  }

  /**
   * Affiche une notification toast
   */
  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `favorite-notification ${type}`;

    const icon =
      type === "success"
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>`;

    toast.innerHTML = `
      ${icon}
      <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Animation d'apparition
    setTimeout(() => toast.classList.add("show"), 10);

    // Retrait après 3 secondes
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Configure l'effet de scroll sur le header
   */
  setupHeaderScroll() {
    const header = document.getElementById("header");
    if (!header) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScroll = () => {
      if (lastScrollY > 50) {
        header.classList.add("scrolled");
      } else {
        header.classList.remove("scrolled");
      }

      ticking = false;
    };

    window.addEventListener("scroll", () => {
      lastScrollY = window.scrollY;

      if (!ticking) {
        window.requestAnimationFrame(updateScroll);
        ticking = true;
      }
    });
  }
}

// Initialisation au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  const app = new HistoryApp();
  app.init();
});
