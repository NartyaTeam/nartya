/**
 * Gestionnaire de favoris côté frontend
 * Gère l'affichage et l'interaction avec les boutons favoris
 */

export class FavoritesUIManager {
  constructor() {
    this.favoritesCache = new Set();
    this.init();
  }

  async init() {
    await this.loadFavoritesCache();
  }

  /**
   * Charge le cache des favoris
   */
  async loadFavoritesCache() {
    try {
      const result = await window.electronAPI.getFavorites();
      if (result.success) {
        this.favoritesCache = new Set(
          result.favorites.map((fav) => fav.id || fav.slug)
        );
      }
    } catch (error) {
      console.error("Erreur lors du chargement du cache des favoris:", error);
    }
  }

  /**
   * Vérifie si un anime est en favoris (depuis le cache)
   */
  isFavorite(animeId) {
    return this.favoritesCache.has(animeId);
  }

  /**
   * Toggle le statut favori d'un anime
   */
  async toggleFavorite(anime, button = null) {
    try {
      const result = await window.electronAPI.toggleFavorite(anime);

      if (result.success) {
        // Mettre à jour le cache
        const animeId = anime.id || anime.slug;
        if (this.favoritesCache.has(animeId)) {
          this.favoritesCache.delete(animeId);
        } else {
          this.favoritesCache.add(animeId);
        }

        // Mettre à jour le bouton si fourni
        if (button) {
          this.updateFavoriteButton(button, this.isFavorite(animeId));
        }

        // Afficher une notification
        this.showNotification(result.message, "success");

        // Émettre un événement personnalisé
        window.dispatchEvent(
          new CustomEvent("favorite-changed", {
            detail: { anime, isFavorite: this.isFavorite(animeId) },
          })
        );

        return result;
      } else {
        this.showNotification(result.message, "error");
        return result;
      }
    } catch (error) {
      console.error("Erreur lors du toggle favori:", error);
      this.showNotification("Erreur lors de la mise à jour", "error");
      return { success: false, error: error.message };
    }
  }

  /**
   * Crée un bouton favori
   */
  createFavoriteButton(anime, options = {}) {
    const {
      size = "medium", // small, medium, large
      showLabel = false,
      className = "",
    } = options;

    const animeId = anime.id || anime.slug;
    const isFav = this.isFavorite(animeId);

    const button = document.createElement("button");
    button.className = `favorite-btn favorite-btn-${size} ${className} ${
      isFav ? "is-favorite" : ""
    }`;
    button.setAttribute("data-anime-id", animeId);
    button.setAttribute("title", isFav ? "Retirer des favoris" : "Ajouter aux favoris");

    button.innerHTML = `
      <svg class="favorite-icon" width="20" height="20" viewBox="0 0 24 24" fill="${
        isFav ? "currentColor" : "none"
      }" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
      ${showLabel ? `<span class="favorite-label">${isFav ? "En favoris" : "Ajouter"}</span>` : ""}
    `;

    button.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Animation de clic
      button.classList.add("animating");
      setTimeout(() => button.classList.remove("animating"), 600);

      await this.toggleFavorite(anime, button);
    });

    return button;
  }

  /**
   * Met à jour l'apparence d'un bouton favori
   */
  updateFavoriteButton(button, isFavorite) {
    const icon = button.querySelector(".favorite-icon");
    const label = button.querySelector(".favorite-label");

    if (isFavorite) {
      button.classList.add("is-favorite");
      button.setAttribute("title", "Retirer des favoris");
      if (icon) icon.setAttribute("fill", "currentColor");
      if (label) label.textContent = "En favoris";
    } else {
      button.classList.remove("is-favorite");
      button.setAttribute("title", "Ajouter aux favoris");
      if (icon) icon.setAttribute("fill", "none");
      if (label) label.textContent = "Ajouter";
    }
  }

  /**
   * Affiche une notification
   */
  showNotification(message, type = "success") {
    const notification = document.createElement("div");
    notification.className = `favorite-notification ${type}`;
    notification.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${
          type === "success"
            ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
            : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
        }
      </svg>
      <span>${message}</span>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add("show");
    }, 10);

    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Obtient le nombre de favoris
   */
  async getFavoritesCount() {
    try {
      const result = await window.electronAPI.getFavoritesCount();
      return result.success ? result.count : 0;
    } catch (error) {
      console.error("Erreur lors du comptage des favoris:", error);
      return 0;
    }
  }

  /**
   * Récupère tous les favoris
   */
  async getFavorites() {
    try {
      const result = await window.electronAPI.getFavorites();
      return result.success ? result.favorites : [];
    } catch (error) {
      console.error("Erreur lors de la récupération des favoris:", error);
      return [];
    }
  }
}

// Styles CSS pour les boutons favoris et notifications
const styles = document.createElement("style");
styles.textContent = `
  /* === BOUTON FAVORI === */
  .favorite-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #a1a1aa;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .favorite-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(239, 68, 68, 0.3);
    color: #ef4444;
    transform: translateY(-2px);
  }

  .favorite-btn.is-favorite {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }

  .favorite-btn.is-favorite:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
  }

  .favorite-btn.animating {
    animation: favoriteClick 0.6s ease;
  }

  @keyframes favoriteClick {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); }
  }

  .favorite-btn-small {
    padding: 0.5rem;
  }

  .favorite-btn-small svg {
    width: 16px;
    height: 16px;
  }

  .favorite-btn-large {
    padding: 0.75rem 1.25rem;
  }

  .favorite-btn-large svg {
    width: 24px;
    height: 24px;
  }

  .favorite-icon {
    flex-shrink: 0;
    transition: all 0.3s ease;
  }

  .favorite-label {
    white-space: nowrap;
  }

  /* === NOTIFICATION FAVORI === */
  .favorite-notification {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: #fafafa;
    font-size: 0.9375rem;
    font-weight: 500;
    box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5);
    z-index: 10000;
    opacity: 0;
    transform: translateX(100px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .favorite-notification.show {
    opacity: 1;
    transform: translateX(0);
  }

  .favorite-notification.success {
    border-left: 3px solid #22c55e;
  }

  .favorite-notification.success svg {
    color: #22c55e;
  }

  .favorite-notification.error {
    border-left: 3px solid #ef4444;
  }

  .favorite-notification.error svg {
    color: #ef4444;
  }

  .favorite-notification svg {
    flex-shrink: 0;
  }
`;
document.head.appendChild(styles);

