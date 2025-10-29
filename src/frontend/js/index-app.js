/**
 * Application principale pour index.html
 * Orchestre tous les modules
 */

import { UIManager } from './ui-manager.js';
import { SearchManager } from './search-manager.js';
import { ChibiAnimations } from './chibi-animations.js';
import { KeyboardShortcuts } from './keyboard-shortcuts.js';

class IndexApp {
    constructor() {
        this.uiManager = new UIManager();
        this.searchManager = null;
        this.chibiAnimations = new ChibiAnimations();
        this.keyboardShortcuts = null;
    }

    initialize() {
        // Récupérer les éléments DOM
        const searchInput = document.getElementById('searchInput');
        const clearIcon = document.getElementById('clearIcon');
        const resultsContainer = document.getElementById('resultsContainer');
        const resultsHeader = document.getElementById('resultsHeader');
        const resultsList = document.getElementById('resultsList');

        // Initialiser les managers
        this.uiManager.initialize(resultsContainer, resultsHeader, resultsList);
        this.searchManager = new SearchManager(window.electronAPI, this.uiManager);
        this.keyboardShortcuts = new KeyboardShortcuts(searchInput);

        // Initialiser les raccourcis clavier
        this.keyboardShortcuts.initialize();

        // Gérer la recherche
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearIcon.style.display = query ? 'block' : 'none';

            this.searchManager.handleInput(query, (results, query) => {
                this.uiManager.displayResults(results, query, (animeId) => {
                    console.log('Anime sélectionné:', animeId);
                    window.location.href = `anime.html?id=${animeId}`;
                });
            });
        });

        // Bouton clear
        clearIcon.addEventListener('click', () => {
            searchInput.value = '';
            clearIcon.style.display = 'none';
            this.uiManager.hideResults();
            searchInput.focus();
        });

        // Focus automatique
        searchInput.focus();

        // Initialiser les chibis
        this.chibiAnimations.initialize();

        // Bouton de test d'extraction vidéo
        this.addTestButton();
    }

    addTestButton() {
        const testButton = document.createElement('button');
        testButton.textContent = '🎬 Tester extraction vidéo';
        testButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #4ade80;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            z-index: 100;
        `;
        testButton.addEventListener('click', () => this.testVideoExtraction());
        document.body.appendChild(testButton);
    }

    async testVideoExtraction() {
        const embedUrl = 'https://sendvid.com/embed/d6ypq2pa';

        try {
            console.log('🎬 Test d\'extraction de vidéo...');
            const result = await window.electronAPI.extractVideoUrl(embedUrl);

            if (result.success && result.videoUrl) {
                console.log('✅ URL de la vidéo extraite:', result.videoUrl);

                const testResult = document.createElement('div');
                testResult.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    z-index: 1000;
                    max-width: 80%;
                    word-break: break-all;
                `;
                testResult.innerHTML = `
                    <h3>🎬 Extraction réussie !</h3>
                    <p><strong>URL de la vidéo:</strong></p>
                    <p style="color: #4ade80;">${result.videoUrl}</p>
                    <button onclick="this.parentElement.remove()" style="margin-top: 10px; padding: 5px 10px;">Fermer</button>
                `;
                document.body.appendChild(testResult);
            } else {
                console.log('❌ Échec de l\'extraction:', result.error);
                alert('Échec de l\'extraction: ' + (result.error || 'URL non trouvée'));
            }
        } catch (error) {
            console.error('❌ Erreur:', error);
            alert('Erreur lors de l\'extraction: ' + error.message);
        }
    }
}

// Initialiser l'application au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    const app = new IndexApp();
    app.initialize();
});

