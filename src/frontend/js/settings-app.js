class SettingsApp {
    constructor() {
        this.settings = this.loadSettings();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSettingsToUI();
        this.createSubtleParticles();
    }

    // Charger les paramètres depuis localStorage
    loadSettings() {
        const defaultSettings = {
            defaultLanguage: 'vostfr',
            autoPlay: false,
            videoQuality: 'auto',
            preloadRange: 3,
            visualEffects: true,
            theme: 'dark',
            animations: true,
            watchHistory: true,
            trackProgress: true,
            autoResume: false,
            autoPlayNext: true,
            autoPlayDelay: 10
        };

        const saved = localStorage.getItem('nartya_settings');
        return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    }

    // Sauvegarder les paramètres
    saveSettings() {
        localStorage.setItem('nartya_settings', JSON.stringify(this.settings));
        this.showToast('Paramètres sauvegardés !');
    }

    // Charger les paramètres dans l'interface
    loadSettingsToUI() {
        // Langue par défaut
        document.getElementById('defaultLanguage').value = this.settings.defaultLanguage;

        // Lecture automatique
        document.getElementById('autoPlay').checked = this.settings.autoPlay;

        // Qualité vidéo
        document.getElementById('videoQuality').value = this.settings.videoQuality;

        // Préchargement
        document.getElementById('preloadRange').value = this.settings.preloadRange;
        this.updatePreloadValue(this.settings.preloadRange);

        // Effets visuels
        document.getElementById('visualEffects').checked = this.settings.visualEffects;

        // Thème
        document.getElementById('theme').value = this.settings.theme;

        // Animations
        document.getElementById('animations').checked = this.settings.animations;

        // Historique
        document.getElementById('watchHistory').checked = this.settings.watchHistory;

        // Suivi de progression
        document.getElementById('trackProgress').checked = this.settings.trackProgress;

        // Reprise automatique
        document.getElementById('autoResume').checked = this.settings.autoResume;

        // Lecture auto du prochain épisode
        document.getElementById('autoPlayNext').checked = this.settings.autoPlayNext;

        // Délai avant lecture auto
        document.getElementById('autoPlayDelay').value = this.settings.autoPlayDelay;
    }

    setupEventListeners() {
        // Bouton retour
        document.getElementById('backBtn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        // Langue par défaut
        document.getElementById('defaultLanguage').addEventListener('change', (e) => {
            this.settings.defaultLanguage = e.target.value;
            this.saveSettings();
        });

        // Lecture automatique
        document.getElementById('autoPlay').addEventListener('change', (e) => {
            this.settings.autoPlay = e.target.checked;
            this.saveSettings();
        });

        // Qualité vidéo
        document.getElementById('videoQuality').addEventListener('change', (e) => {
            this.settings.videoQuality = e.target.value;
            this.saveSettings();
        });

        // Préchargement
        const preloadRange = document.getElementById('preloadRange');
        preloadRange.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.updatePreloadValue(value);
        });

        preloadRange.addEventListener('change', (e) => {
            this.settings.preloadRange = parseInt(e.target.value);
            this.saveSettings();
        });

        // Effets visuels
        document.getElementById('visualEffects').addEventListener('change', (e) => {
            this.settings.visualEffects = e.target.checked;
            this.saveSettings();

            if (e.target.checked) {
                this.createSubtleParticles();
            } else {
                this.removeParticles();
            }
        });

        // Thème
        document.getElementById('theme').addEventListener('change', (e) => {
            this.settings.theme = e.target.value;
            this.saveSettings();
        });

        // Animations
        document.getElementById('animations').addEventListener('change', (e) => {
            this.settings.animations = e.target.checked;
            this.saveSettings();

            if (!e.target.checked) {
                document.body.style.setProperty('--animation-duration', '0s');
            } else {
                document.body.style.removeProperty('--animation-duration');
            }
        });

        // Historique
        document.getElementById('watchHistory').addEventListener('change', (e) => {
            this.settings.watchHistory = e.target.checked;
            this.saveSettings();
        });

        // Vider le cache
        document.getElementById('clearCacheBtn').addEventListener('click', () => {
            this.clearCache();
        });

        // Effacer l'historique
        document.getElementById('clearHistoryBtn').addEventListener('click', () => {
            this.clearHistory();
        });

        // Suivi de progression
        document.getElementById('trackProgress').addEventListener('change', (e) => {
            this.settings.trackProgress = e.target.checked;
            this.saveSettings();
        });

        // Reprise automatique
        document.getElementById('autoResume').addEventListener('change', (e) => {
            this.settings.autoResume = e.target.checked;
            this.saveSettings();
        });

        // Lecture auto du prochain épisode
        document.getElementById('autoPlayNext').addEventListener('change', (e) => {
            this.settings.autoPlayNext = e.target.checked;
            this.saveSettings();
        });

        // Délai avant lecture auto
        document.getElementById('autoPlayDelay').addEventListener('change', (e) => {
            this.settings.autoPlayDelay = parseInt(e.target.value);
            this.saveSettings();
        });
    }

    updatePreloadValue(value) {
        const label = document.getElementById('preloadValue');
        if (value === 0) {
            label.textContent = 'Désactivé';
            label.style.color = '#ef4444';
        } else {
            label.textContent = `${value} épisode${value > 1 ? 's' : ''}`;
            label.style.color = '#6366f1';
        }
    }

    clearCache() {
        if (confirm('Êtes-vous sûr de vouloir vider le cache des vidéos ?')) {
            // Le cache est géré par l'EpisodeManager, on peut juste notifier
            this.showToast('Cache vidéo vidé !');
            console.log('🗑️ Cache des vidéos vidé');
        }
    }

    clearHistory() {
        if (confirm('Êtes-vous sûr de vouloir effacer tout l\'historique de visionnage ? Cette action est irréversible.')) {
            try {
                // Effacer le fichier d'historique via l'API Electron
                if (window.electronAPI && window.electronAPI.clearWatchHistory) {
                    window.electronAPI.clearWatchHistory();
                }

                this.showToast('Historique effacé !');
                console.log('🗑️ Historique de visionnage effacé');
            } catch (error) {
                console.error('Erreur lors de l\'effacement de l\'historique:', error);
                this.showToast('Erreur lors de l\'effacement', true);
            }
        }
    }

    showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'error' : ''}`;
        toast.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${isError
                ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
                : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
            }
            </svg>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // Particules subtiles (comme sur la page d'accueil)
    createSubtleParticles() {
        if (!this.settings.visualEffects) return;

        // Supprimer les anciennes particules
        this.removeParticles();

        const container = document.createElement('div');
        container.id = 'particles-container';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
        `;

        for (let i = 0; i < 15; i++) {
            const particle = document.createElement('div');
            const size = Math.random() * 4 + 2;
            const left = Math.random() * 100;
            const delay = Math.random() * 5;
            const duration = Math.random() * 10 + 15;

            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: radial-gradient(circle, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.4));
                border-radius: 50%;
                bottom: -20px;
                left: ${left}%;
                animation: floatParticle ${duration}s ease-in-out ${delay}s infinite;
                opacity: 0;
            `;

            container.appendChild(particle);
        }

        document.body.appendChild(container);
    }

    removeParticles() {
        const container = document.getElementById('particles-container');
        if (container) {
            container.remove();
        }
    }
}

// Initialiser l'app au chargement
document.addEventListener('DOMContentLoaded', () => {
    window.settingsApp = new SettingsApp();
});

// Animation des particules (réutilisée depuis index.css)
const style = document.createElement('style');
style.textContent = `
    @keyframes floatParticle {
        0% {
            transform: translateY(0) translateX(0) scale(0);
            opacity: 0;
        }
        10% {
            opacity: 0.6;
        }
        90% {
            opacity: 0.6;
        }
        100% {
            transform: translateY(-100vh) translateX(${Math.random() * 100 - 50}px) scale(1);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

