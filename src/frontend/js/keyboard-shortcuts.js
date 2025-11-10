/**
 * Gestionnaire de raccourcis clavier globaux
 */

export class KeyboardShortcuts {
  constructor(searchInput) {
    this.searchInput = searchInput;
    this.shortcuts = {
      // Navigation
      "ctrl+h": () => this.navigateTo("index.html"),
      "ctrl+f": () => this.navigateTo("favorites.html"),
      "ctrl+i": () => this.navigateTo("history.html"),
      "ctrl+s": () => this.navigateTo("settings.html"),

      // Recherche
      "ctrl+k": () => this.focusSearch(),
      "cmd+k": () => this.focusSearch(),

      // Échap pour fermer
      escape: () => this.handleEscape(),
    };
  }

  initialize() {
    document.addEventListener("keydown", (e) => {
      // Ignorer si on tape dans un input (sauf pour Escape)
      if (e.target.tagName === "INPUT" && e.key !== "Escape") {
        return;
      }

      // Construire la combinaison de touches
      const key = this.getKeyCombo(e);

      // Exécuter le raccourci si trouvé
      const action = this.shortcuts[key];
      if (action) {
        e.preventDefault();
        action();
      }
    });

    console.log("⌨️ Raccourcis clavier activés:", Object.keys(this.shortcuts));
  }

  getKeyCombo(e) {
    const parts = [];

    if (e.ctrlKey) parts.push("ctrl");
    if (e.metaKey) parts.push("cmd");
    if (e.altKey) parts.push("alt");
    if (e.shiftKey) parts.push("shift");

    parts.push(e.key.toLowerCase());

    return parts.join("+");
  }

  focusSearch() {
    if (this.searchInput) {
      this.searchInput.focus();
    }
  }

  navigateTo(page) {
    // Ne pas naviguer si on est déjà sur la page
    const currentPage = window.location.pathname.split("/").pop();
    if (currentPage !== page) {
      window.location.href = page;
    }
  }

  handleEscape() {
    // Fermer les modales ouvertes
    const videoModal = document.getElementById("videoPlayerModal");
    if (videoModal && videoModal.style.display === "flex") {
      if (window.closeVideoPlayer) {
        window.closeVideoPlayer();
      }
      return;
    }

    // Vider la recherche
    if (this.searchInput && this.searchInput.value) {
      this.searchInput.value = "";
      this.searchInput.dispatchEvent(new Event("input"));
      this.searchInput.blur();
    }
  }

  /**
   * Affiche une aide des raccourcis
   */
  showHelp() {
    const helpText = `
🎮 Raccourcis Clavier:

Navigation:
• Ctrl+H - Accueil
• Ctrl+F - Ma Liste (Favoris)
• Ctrl+S - Paramètres

Recherche:
• Ctrl+K ou Cmd+K - Focus recherche

Autres:
• Échap - Fermer / Vider recherche
        `;

    console.log(helpText);
    return helpText;
  }
}
