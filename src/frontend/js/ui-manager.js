/**
 * Gestionnaire d'interface utilisateur
 * Gère l'affichage des résultats, messages de chargement, erreurs, etc.
 */

export class UIManager {
    constructor() {
        this.resultsContainer = null;
        this.resultsHeader = null;
        this.resultsList = null;
    }

    initialize(resultsContainer, resultsHeader, resultsList) {
        this.resultsContainer = resultsContainer;
        this.resultsHeader = resultsHeader;
        this.resultsList = resultsList;
    }

    showLoading() {
        if (!this.resultsContainer || !this.resultsHeader || !this.resultsList) return;

        this.resultsContainer.style.display = 'block';
        this.resultsHeader.textContent = 'Recherche...';
        this.resultsList.innerHTML = `
            <div class="loading">
                Recherche en cours
                <span class="loading-dots">
                    <span class="loading-dot"></span>
                    <span class="loading-dot"></span>
                    <span class="loading-dot"></span>
                </span>
            </div>
        `;
    }

    hideResults() {
        if (this.resultsContainer) {
            this.resultsContainer.style.display = 'none';
        }
    }

    showError(message = 'Une erreur est survenue') {
        if (!this.resultsList) return;

        this.resultsList.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">⚠</div>
                <div class="no-results-text">${message}</div>
            </div>
        `;
    }

    displayResults(results, query, onItemClick) {
        if (!this.resultsHeader || !this.resultsList) return;

        if (results.length === 0) {
            this.resultsHeader.textContent = `Aucun résultat pour "${query}"`;
            this.resultsList.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">🔍</div>
                    <div class="no-results-text">Essayez avec un autre titre</div>
                </div>
            `;
            return;
        }

        this.resultsHeader.textContent = `${results.length} résultat${results.length > 1 ? 's' : ''}`;
        this.resultsList.innerHTML = results.map(anime => {
            const title = anime.title?.romaji || anime.title?.english || anime.title?.native || 'Titre inconnu';
            const englishTitle = anime.title?.title?.english || '';
            const nativeTitle = anime.title?.title?.native || '';
            const image = anime.coverImage?.large || anime.coverImage?.medium || '';
            const format = anime.format || '';

            return `
                <div class="result-item" data-id="${anime.slug || anime.id}">
                    <div class="result-content">
                        ${image ? `<img src="${image}" alt="${title}" class="result-image" />` : ''}
                        <div class="result-info">
                            <div class="result-title">${title}</div>
                            ${englishTitle && englishTitle !== title ? `<div class="result-subtitle">${englishTitle}</div>` : ''}
                            ${nativeTitle && nativeTitle !== title && nativeTitle !== englishTitle ? `<div class="result-native">${nativeTitle}</div>` : ''}
                            ${format ? `<div class="result-format">${format}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Attacher les événements de clic
        document.querySelectorAll('.result-item').forEach(item => {
            item.addEventListener('click', () => {
                const animeId = item.dataset.id;
                if (onItemClick) {
                    onItemClick(animeId);
                }
            });
        });
    }
}

