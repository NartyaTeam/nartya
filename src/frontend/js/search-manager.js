/**
 * Gestionnaire de recherche
 * Gère la logique de recherche et le debouncing
 */

export class SearchManager {
    constructor(electronAPI, uiManager) {
        this.electronAPI = electronAPI;
        this.uiManager = uiManager;
        this.searchTimeout = null;
        this.searchDelay = 300;
    }

    async search(query) {
        if (!query || !query.trim()) {
            this.uiManager.hideResults();
            return;
        }

        this.uiManager.showLoading();

        try {
            const result = await this.electronAPI.searchLocalAnimes(query);
            if (result.success) {
                return result.results;
            } else {
                console.error('Erreur de recherche:', result.error);
                // Afficher le message utilisateur si disponible
                const errorMessage = result.userMessage || 'Une erreur est survenue lors de la recherche';
                this.uiManager.showError(errorMessage);
                return null;
            }
        } catch (error) {
            console.error('Erreur de recherche:', error);
            this.uiManager.showError('Une erreur inattendue s\'est produite');
            return null;
        }
    }

    handleInput(query, onResultsReady) {
        clearTimeout(this.searchTimeout);

        if (!query || !query.trim()) {
            this.uiManager.hideResults();
            return;
        }

        this.searchTimeout = setTimeout(async () => {
            const results = await this.search(query);
            if (results && onResultsReady) {
                onResultsReady(results, query);
            }
        }, this.searchDelay);
    }
}

