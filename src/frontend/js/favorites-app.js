/**
 * Application pour la page favorites.html
 * Gère l'affichage et la gestion des favoris
 */

import { ChibiAnimations } from "./chibi-animations.js";
import { FavoritesUIManager } from "./favorites-manager.js";

class FavoritesApp {
  constructor() {
    this.chibiAnimations = new ChibiAnimations();
    this.favoritesManager = new FavoritesUIManager();

    // État
    this.favorites = [];
    this.sortBy = "recent";

    // Éléments DOM
    this.animesGrid = null;
    this.emptyState = null;
    this.favoritesCount = null;
    this.sortSelect = null;
    this.clearAllBtn = null;

    // Charger les paramètres
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

  async initialize() {
    console.log("🎬 Initialisation de la page Favoris");

    // Récupérer les éléments DOM
    this.animesGrid = document.getElementById("animesGrid");
    this.emptyState = document.getElementById("emptyState");

    // Initialiser l'effet de scroll sur le header
    this.setupHeaderScroll();
    this.favoritesCount = document.getElementById("favoritesCount");
    this.sortSelect = document.getElementById("sortSelect");
    this.clearAllBtn = document.getElementById("clearAllBtn");

    // Initialiser les chibis si activés
    if (this.settings.visualEffects) {
      this.chibiAnimations.initialize();
    }

    // Charger les favoris
    await this.loadFavorites();

    // Setup event listeners
    this.setupEventListeners();
  }

  async loadFavorites() {
    try {
      const result = await window.electronAPI.getFavorites();

      if (result.success) {
        this.favorites = result.favorites;
        console.log("✅ Favoris chargés:", this.favorites.length);
        console.log("Premier favori:", this.favorites[0]);
        this.updateUI();
      } else {
        console.error("Erreur lors du chargement des favoris:", result.error);
        this.showError("Impossible de charger les favoris");
      }
    } catch (error) {
      console.error("Erreur:", error);
      this.showError("Une erreur est survenue");
    }
  }

  updateUI() {
    // Mettre à jour le compteur
    this.favoritesCount.textContent = this.favorites.length;

    // Afficher empty state ou grid
    if (this.favorites.length === 0) {
      this.animesGrid.style.display = "none";
      this.emptyState.style.display = "block";
      return;
    }

    this.animesGrid.style.display = "grid";
    this.emptyState.style.display = "none";

    // Trier les favoris
    const sortedFavorites = this.sortFavorites(this.favorites);

    // Afficher les cards
    this.displayFavorites(sortedFavorites);
  }

  sortFavorites(favorites) {
    const sorted = [...favorites];

    switch (this.sortBy) {
      case "recent":
        // Les plus récents en premier (ordre inverse)
        return sorted.reverse();

      case "title":
        return sorted.sort((a, b) => {
          const titleA = a.title?.romaji || a.title?.english || "";
          const titleB = b.title?.romaji || b.title?.english || "";
          return titleA.localeCompare(titleB);
        });

      case "title-desc":
        return sorted.sort((a, b) => {
          const titleA = a.title?.romaji || a.title?.english || "";
          const titleB = b.title?.romaji || b.title?.english || "";
          return titleB.localeCompare(titleA);
        });

      default:
        return sorted;
    }
  }

  displayFavorites(favorites) {
    this.animesGrid.innerHTML = "";

    favorites.forEach((anime) => {
      const card = this.createAnimeCard(anime);
      this.animesGrid.appendChild(card);
    });
  }

  createAnimeCard(anime) {
    const card = document.createElement("div");
    card.className = "anime-card";
    card.dataset.animeId = anime.slug || anime.id;

    const title =
      anime.title?.romaji ||
      anime.title?.english ||
      anime.title?.native ||
      "Titre inconnu";
    const image = anime.coverImage?.large || anime.coverImage?.medium || "";
    const format = anime.format || "";

    card.innerHTML = `
            ${
              image
                ? `<img src="${image}" alt="${title}" class="anime-card-image" loading="lazy" decoding="async" />`
                : `<div class="anime-card-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <span>Pas d'image</span>
                  </div>`
            }
            <div class="anime-card-content">
                <div class="anime-card-title">${title}</div>
                ${
                  format ? `<div class="anime-card-format">${format}</div>` : ""
                }
            </div>
        `;

    // Ajouter le bouton favori (déjà en favoris)
    const favoriteBtn = this.favoritesManager.createFavoriteButton(anime, {
      size: "small",
      showLabel: false,
      className: "anime-card-favorite-btn",
    });
    card.appendChild(favoriteBtn);

    // Événement de clic sur la card
    card.addEventListener("click", (e) => {
      // Ne pas naviguer si on clique sur le bouton favori
      if (e.target.closest(".favorite-btn")) {
        return;
      }
      window.location.href = `anime.html?id=${anime.slug || anime.id}`;
    });

    return card;
  }

  setupEventListeners() {
    // Tri
    this.sortSelect.addEventListener("change", (e) => {
      this.sortBy = e.target.value;
      this.updateUI();
    });

    // Tout supprimer
    this.clearAllBtn.addEventListener("click", async () => {
      if (
        confirm(
          `Êtes-vous sûr de vouloir supprimer tous vos favoris (${this.favorites.length}) ?`
        )
      ) {
        await this.clearAllFavorites();
      }
    });

    // Écouter les changements de favoris (quand on retire un favori)
    window.addEventListener("favorite-removed", () => {
      this.loadFavorites();
    });
  }

  async clearAllFavorites() {
    try {
      const result = await window.electronAPI.clearFavorites();

      if (result.success) {
        this.favorites = [];
        this.updateUI();
        this.showToast("✅ Tous les favoris ont été supprimés", "success");
      } else {
        this.showToast("❌ Erreur lors de la suppression", "error");
      }
    } catch (error) {
      console.error("Erreur:", error);
      this.showToast("❌ Une erreur est survenue", "error");
    }
  }

  showError(message) {
    this.animesGrid.innerHTML = `
            <div class="error">
                <div class="error-icon">❌</div>
                <div>${message}</div>
            </div>
        `;
  }

  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            background: ${type === "success" ? "#10b981" : "#ef4444"};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "slideOut 0.3s ease";
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

// Initialiser l'application
document.addEventListener("DOMContentLoaded", () => {
  const app = new FavoritesApp();
  app.initialize();
});
