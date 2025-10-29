/**
 * Gestionnaire de raccourcis clavier
 */

export class KeyboardShortcuts {
    constructor(searchInput) {
        this.searchInput = searchInput;
    }

    initialize() {
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (this.searchInput) {
                    this.searchInput.focus();
                }
            }
        });
    }
}

