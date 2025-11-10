/**
 * Application principale pour index.html
 * Nouvelle version avec cards Masonry, scroll animation et lazy loading
 */

import { ChibiAnimations } from "./chibi-animations.js";
import { KeyboardShortcuts } from "./keyboard-shortcuts.js";
import { FavoritesUIManager } from "./favorites-manager.js";

class IndexApp {
  constructor() {
    this.chibiAnimations = new ChibiAnimations();
    this.keyboardShortcuts = null;
    this.favoritesManager = new FavoritesUIManager();

    // État de l'application
    this.allAnimes = [];
    this.displayedAnimes = [];
    this.animesPerLoad = 20;
    this.currentIndex = 0;
    this.isLoading = false;
    this.searchQuery = "";

    // Éléments DOM
    this.header = null;
    this.heroSection = null;
    this.searchInput = null;
    this.searchInputNav = null;
    this.clearIcon = null;
    this.clearIconNav = null;
    this.animesGrid = null;
    this.lazySentinel = null;
    this.scrollIndicator = null;

    // Intersection Observer pour lazy loading
    this.lazyObserver = null;

    // Charger les paramètres
    this.settings = this.loadSettings();
  }

  loadSettings() {
    const defaultSettings = {
      defaultLanguage: "vostfr",
      autoPlay: false,
      preloadRange: 3,
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
    // Récupérer les éléments DOM
    this.header = document.getElementById("header");
    this.heroSection = document.getElementById("heroSection");
    this.searchInput = document.getElementById("searchInput");
    this.searchInputNav = document.getElementById("searchInputNav");
    this.clearIcon = document.getElementById("clearIcon");
    this.clearIconNav = document.getElementById("clearIconNav");
    this.animesGrid = document.getElementById("animesGrid");
    this.lazySentinel = document.getElementById("lazySentinel");
    this.scrollIndicator = document.getElementById("scrollIndicator");

    // Charger tous les animes
    await this.loadAllAnimes();

    // Initialiser les raccourcis clavier
    this.keyboardShortcuts = new KeyboardShortcuts(this.searchInput);
    this.keyboardShortcuts.initialize();

    // Gérer le scroll pour l'animation
    this.setupScrollAnimation();

    // Synchroniser les deux barres de recherche
    this.setupSearchSync();

    // Setup lazy loading
    this.setupLazyLoading();

    // Setup scroll indicator
    this.setupScrollIndicator();

    // Setup typing placeholder effect
    this.setupTypingPlaceholder();

    // Setup refresh button
    this.setupRefreshButton();

    // Focus automatique
    this.searchInput.focus();

    // Initialiser les chibis seulement si les effets visuels sont activés
    if (this.settings.visualEffects) {
      this.chibiAnimations.initialize();
    }
  }

  async loadAllAnimes() {
    try {
      const result = await window.electronAPI.searchLocalAnimes("");

      if (result.success && result.results) {
        this.allAnimes = result.results;
        console.log(`✅ ${this.allAnimes.length} animes chargés`);

        // Afficher les premiers animes
        this.loadMoreAnimes();
      } else {
        console.error("Erreur lors du chargement des animes");
        this.animesGrid.innerHTML =
          '<div class="loading">Erreur lors du chargement des animes</div>';
      }
    } catch (error) {
      console.error("Erreur:", error);
      this.animesGrid.innerHTML =
        '<div class="loading">Erreur lors du chargement des animes</div>';
    }
  }

  loadMoreAnimes() {
    if (this.isLoading) return;

    this.isLoading = true;

    // Déterminer quels animes afficher
    const animesToShow = this.searchQuery
      ? this.filterAnimes(this.searchQuery)
      : this.allAnimes;

    // Calculer le slice
    const start = this.currentIndex;
    const end = Math.min(start + this.animesPerLoad, animesToShow.length);
    const newAnimes = animesToShow.slice(start, end);

    // Si c'est le premier chargement, vider le loading
    if (start === 0) {
      this.animesGrid.innerHTML = "";
    }

    // Ajouter les nouvelles cards
    newAnimes.forEach((anime, index) => {
      const card = this.createAnimeCard(anime);
      // Délai d'animation échelonné
      card.style.animationDelay = `${index * 0.05}s`;
      this.animesGrid.appendChild(card);
    });

    this.currentIndex = end;
    this.isLoading = false;

    console.log(`📺 Affichage ${start}-${end} sur ${animesToShow.length}`);
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
                : ""
            }
            <div class="anime-card-content">
                <div class="anime-card-title">${title}</div>
                ${
                  format ? `<div class="anime-card-format">${format}</div>` : ""
                }
            </div>
        `;

    // Ajouter le bouton favori
    const favoriteBtn = this.favoritesManager.createFavoriteButton(anime, {
      size: "small",
      showLabel: false,
      className: "anime-card-favorite-btn",
    });
    card.appendChild(favoriteBtn);

    // Événement de clic sur la card (sauf sur le bouton favori)
    card.addEventListener("click", (e) => {
      // Ne pas naviguer si on clique sur le bouton favori
      if (e.target.closest(".favorite-btn")) {
        return;
      }
      window.location.href = `anime.html?id=${anime.slug || anime.id}`;
    });

    return card;
  }

  filterAnimes(query) {
    const lowerQuery = query.toLowerCase();
    return this.allAnimes.filter((anime) => {
      const romaji = anime.title?.romaji?.toLowerCase() || "";
      const english = anime.title?.english?.toLowerCase() || "";
      const native = anime.title?.native?.toLowerCase() || "";

      return (
        romaji.includes(lowerQuery) ||
        english.includes(lowerQuery) ||
        native.includes(lowerQuery)
      );
    });
  }

  handleSearch(query) {
    this.searchQuery = query.trim();

    // Reset l'index
    this.currentIndex = 0;

    if (this.searchQuery) {
      // Mode compact : réduire la hero section pour afficher les résultats
      this.heroSection.classList.add("compact");

      // Filtrer et afficher
      const filtered = this.filterAnimes(this.searchQuery);
      console.log(`🔍 ${filtered.length} résultats pour "${this.searchQuery}"`);

      // Cacher toutes les cards
      const allCards = this.animesGrid.querySelectorAll(".anime-card");
      allCards.forEach((card) => card.classList.add("hidden"));

      // Si aucun résultat
      if (filtered.length === 0) {
        this.animesGrid.innerHTML = `
                    <div class="loading">
                        <div style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.4;">🔍</div>
                        <div>Aucun anime trouvé pour "${this.searchQuery}"</div>
                    </div>
                `;
        return;
      }

      // Vider et recharger
      this.animesGrid.innerHTML = "";
      this.loadMoreAnimes();
    } else {
      // Pas de recherche, remettre la hero section en mode normal
      this.heroSection.classList.remove("compact");

      // Pas de recherche, afficher tous les animes
      const allCards = this.animesGrid.querySelectorAll(".anime-card");

      if (allCards.length === 0) {
        // Si rien n'est affiché, charger depuis le début
        this.currentIndex = 0;
        this.animesGrid.innerHTML = "";
        this.loadMoreAnimes();
      } else {
        // Réafficher toutes les cards
        allCards.forEach((card) => card.classList.remove("hidden"));
      }
    }
  }

  setupScrollAnimation() {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScroll = () => {
      const scrollY = window.scrollY;

      // Animation du header (apparait après 100px)
      if (scrollY > 100) {
        this.header.classList.add("scrolled");
        document.getElementById("headerSearch").classList.add("visible");
        this.heroSection.classList.add("hidden");
      } else {
        this.header.classList.remove("scrolled");
        document.getElementById("headerSearch").classList.remove("visible");
        this.heroSection.classList.remove("hidden");
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

  setupSearchSync() {
    // Synchroniser les deux inputs
    this.searchInput.addEventListener("input", (e) => {
      const query = e.target.value;
      this.searchInputNav.value = query;
      this.clearIcon.style.display = query ? "block" : "none";
      this.clearIconNav.style.display = query ? "block" : "none";

      this.handleSearch(query);
    });

    this.searchInputNav.addEventListener("input", (e) => {
      const query = e.target.value;
      this.searchInput.value = query;
      this.clearIcon.style.display = query ? "block" : "none";
      this.clearIconNav.style.display = query ? "block" : "none";

      this.handleSearch(query);
    });

    // Boutons clear
    this.clearIcon.addEventListener("click", () => {
      this.searchInput.value = "";
      this.searchInputNav.value = "";
      this.clearIcon.style.display = "none";
      this.clearIconNav.style.display = "none";
      this.handleSearch("");
      this.searchInput.focus();
    });

    this.clearIconNav.addEventListener("click", () => {
      this.searchInput.value = "";
      this.searchInputNav.value = "";
      this.clearIcon.style.display = "none";
      this.clearIconNav.style.display = "none";
      this.handleSearch("");
      this.searchInputNav.focus();
    });
  }

  setupLazyLoading() {
    // Intersection Observer pour détecter quand on arrive en bas
    this.lazyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isLoading) {
            // On est arrivé au sentinel, charger plus d'animes
            const animesToShow = this.searchQuery
              ? this.filterAnimes(this.searchQuery)
              : this.allAnimes;

            if (this.currentIndex < animesToShow.length) {
              console.log("📜 Lazy loading...");
              this.loadMoreAnimes();
            }
          }
        });
      },
      {
        rootMargin: "200px", // Commencer à charger 200px avant d'atteindre le sentinel
      }
    );

    // Observer le sentinel
    if (this.lazySentinel) {
      this.lazyObserver.observe(this.lazySentinel);
    }
  }

  setupScrollIndicator() {
    // Cliquer sur l'indicateur pour scroller vers les résultats
    if (this.scrollIndicator) {
      this.scrollIndicator.addEventListener("click", () => {
        const gridTop =
          this.animesGrid.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({
          top: gridTop - 100,
          behavior: "smooth",
        });
      });
    }
  }

  setupTypingPlaceholder() {
    const placeholders = [
      "Rechercher un anime...",
      "Naruto, One Piece, Attack on Titan...",
      "Découvrez votre prochain anime...",
      "Des milliers d'animes vous attendent...",
      "Shonen, Seinen, Isekai...",
    ];

    let currentIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let isPaused = false;

    const typeEffect = () => {
      // Ne pas changer le placeholder si l'utilisateur a tapé quelque chose
      if (
        this.searchInput.value ||
        document.activeElement === this.searchInput
      ) {
        setTimeout(typeEffect, 100);
        return;
      }

      const currentText = placeholders[currentIndex];

      if (isPaused) {
        isPaused = false;
        setTimeout(typeEffect, 2000);
        return;
      }

      if (!isDeleting) {
        // Typing
        this.searchInput.placeholder = currentText.substring(0, charIndex + 1);
        charIndex++;

        if (charIndex === currentText.length) {
          isPaused = true;
          isDeleting = true;
        }

        setTimeout(typeEffect, 100);
      } else {
        // Deleting
        this.searchInput.placeholder = currentText.substring(0, charIndex - 1);
        charIndex--;

        if (charIndex === 0) {
          isDeleting = false;
          currentIndex = (currentIndex + 1) % placeholders.length;
          setTimeout(typeEffect, 500);
        } else {
          setTimeout(typeEffect, 50);
        }
      }
    };

    // Démarrer l'effet après 2 secondes
    setTimeout(typeEffect, 2000);
  }

  setupRefreshButton() {
    const refreshBtn = document.getElementById("refreshBtn");
    const refreshModal = document.getElementById("refreshModal");
    const refreshStatus = document.getElementById("refreshStatus");
    const refreshStats = document.getElementById("refreshStats");

    refreshBtn.addEventListener("click", async () => {
      try {
        // Vérifier si un refresh est déjà en cours
        const { isRefreshing } = await window.electronAPI.isRefreshing();
        if (isRefreshing) {
          alert("Un rafraîchissement est déjà en cours !");
          return;
        }

        // Confirmation
        const confirm = window.confirm(
          "⚠️ Le rafraîchissement peut prendre plusieurs minutes.\n\n" +
            "Cela va récupérer tous les nouveaux animes depuis Anime-Sama.\n\n" +
            "Voulez-vous continuer ?"
        );

        if (!confirm) return;

        // Afficher la modal
        refreshModal.style.display = "flex";
        refreshStatus.textContent = "Récupération de la liste des animes...";
        refreshStats.innerHTML = "";

        // Ajouter l'animation de rotation au bouton
        refreshBtn.classList.add("refreshing");
        refreshBtn.disabled = true;

        // Écouter les mises à jour de progression
        window.electronAPI.onRefreshProgress((progress) => {
          if (progress.status === "indexed") {
            refreshStatus.textContent = `Indexation: ${progress.anime}`;
          } else if (progress.status === "skipped") {
            refreshStatus.textContent = `Déjà indexé: ${progress.anime}`;
          } else if (progress.status === "error") {
            refreshStatus.textContent = `Erreur: ${progress.anime}`;
          }

          refreshStats.innerHTML = `
                        <div style="margin-top: 1rem; font-size: 0.9rem; opacity: 0.8;">
                            <div>📊 Progression: ${progress.current} / ${progress.total}</div>
                            <div>✨ Nouveaux: ${progress.newCount}</div>
                            <div>⏭️ Déjà indexés: ${progress.skippedCount}</div>
                        </div>
                    `;
        });

        // Lancer le rafraîchissement
        const result = await window.electronAPI.refreshAnimeDatabase();

        // Nettoyer les listeners
        window.electronAPI.removeRefreshProgressListener();

        // Cacher la modal
        refreshModal.style.display = "none";
        refreshBtn.classList.remove("refreshing");
        refreshBtn.disabled = false;

        if (result.success) {
          alert(
            `✅ Rafraîchissement terminé !\n\n` +
              `📊 Total traité: ${result.total}\n` +
              `✨ Nouveaux animes: ${result.new}\n` +
              `⏭️ Déjà indexés: ${result.skipped}\n` +
              `📚 Total en base: ${result.totalInDatabase}`
          );

          // Recharger les animes
          await this.loadAllAnimes();
          this.currentIndex = 0;
          this.animesGrid.innerHTML = "";
          this.loadMoreAnimes();
        } else {
          alert(`❌ Erreur lors du rafraîchissement:\n\n${result.error}`);
        }
      } catch (error) {
        console.error("Erreur lors du rafraîchissement:", error);
        refreshModal.style.display = "none";
        refreshBtn.classList.remove("refreshing");
        refreshBtn.disabled = false;
        alert(`❌ Erreur inattendue:\n\n${error.message}`);
      }
    });
  }
}

// Initialiser l'application au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  const app = new IndexApp();
  app.initialize();
});
