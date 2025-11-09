/**
 * Gestionnaire des mises à jour automatiques
 * Affiche des notifications et gère le téléchargement/installation
 */

class UpdateManager {
    constructor() {
        this.updateInfo = null;
        this.isDownloading = false;
        this.setupListeners();
        this.createUpdateUI();
    }

    /**
     * Crée l'interface utilisateur pour les mises à jour
     */
    createUpdateUI() {
        // Créer le conteneur de notification
        const container = document.createElement('div');
        container.id = 'updateNotification';
        container.className = 'update-notification';
        container.style.display = 'none';
        
        container.innerHTML = `
            <div class="update-notification-content">
                <div class="update-icon">🎉</div>
                <div class="update-text">
                    <h3 id="updateTitle">Mise à jour disponible</h3>
                    <p id="updateMessage">Une nouvelle version est disponible</p>
                </div>
                <div class="update-actions">
                    <button id="updateDownloadBtn" class="update-btn primary">
                        Télécharger
                    </button>
                    <button id="updateLaterBtn" class="update-btn secondary">
                        Plus tard
                    </button>
                </div>
            </div>
            <div class="update-progress" id="updateProgress" style="display: none;">
                <div class="update-progress-bar">
                    <div class="update-progress-fill" id="updateProgressFill"></div>
                </div>
                <div class="update-progress-text" id="updateProgressText">0%</div>
            </div>
        `;

        document.body.appendChild(container);

        // Événements des boutons
        document.getElementById('updateDownloadBtn').addEventListener('click', () => {
            this.downloadUpdate();
        });

        document.getElementById('updateLaterBtn').addEventListener('click', () => {
            this.hideNotification();
        });
    }

    /**
     * Configure les listeners pour les événements de mise à jour
     */
    setupListeners() {
        // Vérification en cours
        window.electronAPI.onUpdateChecking(() => {
            console.log('🔍 Vérification des mises à jour...');
        });

        // Mise à jour disponible
        window.electronAPI.onUpdateAvailable((info) => {
            console.log('✨ Mise à jour disponible:', info.version);
            this.updateInfo = info;
            this.showUpdateAvailable(info);
        });

        // Pas de mise à jour
        window.electronAPI.onUpdateNotAvailable((info) => {
            console.log('✅ Application à jour');
        });

        // Erreur
        window.electronAPI.onUpdateError((error) => {
            console.error('❌ Erreur de mise à jour:', error);
            this.showError(error);
        });

        // Progression du téléchargement
        window.electronAPI.onUpdateDownloadProgress((progress) => {
            this.updateDownloadProgress(progress);
        });

        // Mise à jour téléchargée
        window.electronAPI.onUpdateDownloaded((info) => {
            console.log('✅ Mise à jour téléchargée');
            this.showUpdateReady(info);
        });
    }

    /**
     * Affiche la notification de mise à jour disponible
     */
    showUpdateAvailable(info) {
        const notification = document.getElementById('updateNotification');
        const title = document.getElementById('updateTitle');
        const message = document.getElementById('updateMessage');

        title.textContent = `Nouvelle version ${info.version} disponible`;
        message.textContent = `Taille: ${this.formatBytes(info.files[0]?.size || 0)}`;

        notification.style.display = 'block';
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
    }

    /**
     * Télécharge la mise à jour
     */
    async downloadUpdate() {
        if (this.isDownloading) return;

        this.isDownloading = true;
        const downloadBtn = document.getElementById('updateDownloadBtn');
        const laterBtn = document.getElementById('updateLaterBtn');
        const progress = document.getElementById('updateProgress');

        downloadBtn.disabled = true;
        laterBtn.disabled = true;
        downloadBtn.textContent = 'Téléchargement...';

        progress.style.display = 'block';

        try {
            await window.electronAPI.downloadUpdate();
        } catch (error) {
            console.error('Erreur lors du téléchargement:', error);
            this.showError(error.message);
            this.isDownloading = false;
            downloadBtn.disabled = false;
            laterBtn.disabled = false;
            downloadBtn.textContent = 'Télécharger';
            progress.style.display = 'none';
        }
    }

    /**
     * Met à jour la progression du téléchargement
     */
    updateDownloadProgress(progress) {
        const fill = document.getElementById('updateProgressFill');
        const text = document.getElementById('updateProgressText');

        const percent = Math.round(progress.percent);
        fill.style.width = `${percent}%`;
        text.textContent = `${percent}% - ${this.formatBytes(progress.transferred)} / ${this.formatBytes(progress.total)}`;
    }

    /**
     * Affiche la notification de mise à jour prête
     */
    showUpdateReady(info) {
        const notification = document.getElementById('updateNotification');
        const title = document.getElementById('updateTitle');
        const message = document.getElementById('updateMessage');
        const downloadBtn = document.getElementById('updateDownloadBtn');
        const laterBtn = document.getElementById('updateLaterBtn');
        const progress = document.getElementById('updateProgress');

        title.textContent = '✅ Mise à jour prête !';
        message.textContent = `Version ${info.version} téléchargée et prête à être installée`;

        downloadBtn.textContent = 'Installer et redémarrer';
        downloadBtn.disabled = false;
        laterBtn.disabled = false;
        laterBtn.textContent = 'Installer au prochain démarrage';

        progress.style.display = 'none';

        // Changer les événements des boutons
        downloadBtn.onclick = () => {
            this.installUpdate();
        };

        laterBtn.onclick = () => {
            this.hideNotification();
            alert('✅ La mise à jour sera installée au prochain démarrage de l\'application');
        };

        this.isDownloading = false;
    }

    /**
     * Installe la mise à jour et redémarre
     */
    async installUpdate() {
        try {
            await window.electronAPI.installUpdate();
        } catch (error) {
            console.error('Erreur lors de l\'installation:', error);
            this.showError(error.message);
        }
    }

    /**
     * Affiche une erreur
     */
    showError(error) {
        const notification = document.getElementById('updateNotification');
        const title = document.getElementById('updateTitle');
        const message = document.getElementById('updateMessage');

        title.textContent = '❌ Erreur de mise à jour';
        message.textContent = error;

        notification.style.display = 'block';
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            this.hideNotification();
        }, 5000);
    }

    /**
     * Cache la notification
     */
    hideNotification() {
        const notification = document.getElementById('updateNotification');
        notification.classList.remove('show');
        setTimeout(() => {
            notification.style.display = 'none';
        }, 300);
    }

    /**
     * Formate les octets en format lisible
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Nettoie les listeners
     */
    cleanup() {
        window.electronAPI.removeUpdateListeners();
    }
}

// Initialiser le gestionnaire de mises à jour
document.addEventListener('DOMContentLoaded', () => {
    new UpdateManager();
});

export default UpdateManager;

