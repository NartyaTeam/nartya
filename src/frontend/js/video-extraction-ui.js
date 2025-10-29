/**
 * Gestionnaire UI pour l'extraction de vidéo - Version moderne
 */

export class VideoExtractionUI {
    showModal(episodeNumber, episodeUrl) {
        const modal = document.createElement('div');
        modal.className = 'video-extraction-modal';
        modal.id = 'extractionModal';
        modal.innerHTML = `
            <div class="video-extraction-content modern-loading">
                <div class="extraction-icon-wrapper">
                    <svg class="extraction-icon-circle" viewBox="0 0 100 100">
                        <circle class="extraction-circle-bg" cx="50" cy="50" r="45"/>
                        <circle class="extraction-circle-progress" cx="50" cy="50" r="45"/>
                    </svg>
                    <div class="extraction-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </div>
                </div>
                <h3 class="extraction-title modern">Extraction en cours</h3>
                <div class="extraction-episode">Épisode ${episodeNumber}</div>
                <div class="extraction-status modern">
                    <div class="extraction-dots">
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                    </div>
                    <div class="extraction-message">Recherche de la vidéo...</div>
                </div>
                <div class="extraction-progress-bar">
                    <div class="extraction-progress-fill"></div>
                </div>
                <button class="extraction-btn-cancel" onclick="closeExtractionModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                    Annuler
                </button>
            </div>
        `;
        document.body.appendChild(modal);

        // Animation de la barre de progression
        setTimeout(() => {
            const progressFill = modal.querySelector('.extraction-progress-fill');
            if (progressFill) {
                progressFill.style.width = '70%';
            }
        }, 100);
    }

    showSuccess(episodeNumber, videoUrl) {
        const modal = document.getElementById('extractionModal');
        if (!modal) return;

        modal.innerHTML = `
            <div class="video-extraction-content">
                <h3 class="extraction-title extraction-success">✅ Extraction réussie !</h3>
                <div class="extraction-status extraction-success">
                    L'URL de la vidéo a été extraite avec succès
                </div>
                <div class="extraction-url">
                    <strong>URL de la vidéo:</strong><br>
                    ${videoUrl}
                </div>
                <div class="extraction-buttons">
                    <button class="extraction-btn extraction-btn-primary" onclick="copyVideoUrl('${videoUrl}')">
                        📋 Copier l'URL
                    </button>
                    <button class="extraction-btn extraction-btn-primary" onclick="openVideoUrl('${videoUrl}')">
                        🎥 Ouvrir la vidéo
                    </button>
                    <button class="extraction-btn extraction-btn-secondary" onclick="closeExtractionModal()">
                        Fermer
                    </button>
                </div>
            </div>
        `;
    }

    showError(episodeNumber, errorResult) {
        const modal = document.getElementById('extractionModal');
        if (!modal) return;

        // Utiliser userMessage si disponible, sinon le message d'erreur standard
        const userMessage = errorResult.userMessage || errorResult.error || errorResult;
        const errorCode = errorResult.errorCode || 'UNKNOWN';

        // Icône selon le type d'erreur
        let iconSvg = '';
        let iconClass = 'error';
        let title = 'Source indisponible';
        let subtitle = 'Veuillez essayer une autre source';

        if (errorCode === 'SOURCE_UNAVAILABLE' || errorCode === 'PAGE_NOT_FOUND') {
            iconSvg = `
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 8v4M12 16h.01"></path>
                </svg>
            `;
            title = 'Source indisponible';
            subtitle = 'Cette source ne fonctionne plus';
        } else if (errorCode === 'NO_VIDEO_FOUND') {
            iconSvg = `
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <line x1="2" y1="7" x2="7" y2="7"></line>
                    <line x1="2" y1="17" x2="7" y2="17"></line>
                    <line x1="17" y1="17" x2="22" y2="17"></line>
                    <line x1="17" y1="7" x2="22" y2="7"></line>
                    <path d="M2 2L22 22" stroke="#ef4444" stroke-width="2"></path>
                </svg>
            `;
            title = 'Extraction impossible';
            subtitle = 'Vidéo protégée ou indisponible';
        } else {
            iconSvg = `
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
            `;
            title = 'Erreur d\'extraction';
        }

        modal.innerHTML = `
            <div class="video-extraction-content modern-error">
                <div class="extraction-icon-wrapper ${iconClass}">
                    ${iconSvg}
                </div>
                <h3 class="extraction-title modern error">${title}</h3>
                <div class="extraction-episode error">${subtitle}</div>
                <div class="extraction-error-message">
                    ${userMessage}
                </div>
                <div class="extraction-suggestion">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <span>Essayez de changer de source dans le sélecteur ci-dessus</span>
                </div>
                <div class="extraction-buttons modern">
                    <button class="extraction-btn-modern primary" onclick="closeExtractionModal()">
                        Choisir une autre source
                    </button>
                    <button class="extraction-btn-modern secondary" onclick="closeExtractionModal()">
                        Fermer
                    </button>
                </div>
            </div>
        `;
    }

    close() {
        const modal = document.getElementById('extractionModal');
        if (modal) {
            modal.remove();
        }
    }
}

