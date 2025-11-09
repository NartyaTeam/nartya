/**
 * Gestionnaire de lecture automatique du prochain épisode
 * Affiche un countdown et lance automatiquement l'épisode suivant
 */

export class AutoPlayNext {
  constructor(videoPlayer, animeApp) {
    this.videoPlayer = videoPlayer;
    this.animeApp = animeApp;
    this.countdownOverlay = null;
    this.countdownInterval = null;
    this.timeRemaining = 0;
    this.isCountingDown = false;
  }

  /**
   * Vérifie si l'auto-play est activé dans les paramètres
   */
  isEnabled() {
    const settings = this.loadSettings();
    return settings.autoPlayNext !== false; // true par défaut
  }

  /**
   * Récupère le délai depuis les paramètres
   */
  getDelay() {
    const settings = this.loadSettings();
    return settings.autoPlayDelay || 10; // 10 secondes par défaut
  }

  /**
   * Charge les paramètres
   */
  loadSettings() {
    const saved = localStorage.getItem("nartya_settings");
    return saved ? JSON.parse(saved) : {};
  }

  /**
   * Démarre le countdown pour le prochain épisode
   */
  startCountdown(nextEpisode) {
    if (!this.isEnabled()) {
      console.log("Auto-play désactivé dans les paramètres");
      return;
    }

    if (!nextEpisode) {
      console.log("Pas d'épisode suivant disponible");
      return;
    }

    this.isCountingDown = true;
    this.timeRemaining = this.getDelay();

    // Créer l'overlay de countdown
    this.createCountdownOverlay(nextEpisode);

    // Démarrer le countdown
    this.countdownInterval = setInterval(() => {
      this.timeRemaining--;

      if (this.timeRemaining <= 0) {
        this.playNextEpisode(nextEpisode);
      } else {
        this.updateCountdownDisplay();
      }
    }, 1000);
  }

  /**
   * Crée l'overlay de countdown
   */
  createCountdownOverlay(nextEpisode) {
    // Supprimer l'ancien overlay s'il existe
    this.removeCountdownOverlay();

    const overlay = document.createElement("div");
    overlay.className = "autoplay-countdown-overlay";
    overlay.innerHTML = `
      <div class="autoplay-countdown-content">
        <div class="autoplay-countdown-header">
          <h3>Épisode suivant</h3>
          <button class="autoplay-cancel-btn" id="cancelAutoPlay">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div class="autoplay-episode-info">
          <div class="autoplay-episode-number">Épisode ${nextEpisode.number}</div>
          <div class="autoplay-episode-title">${nextEpisode.title || "Sans titre"}</div>
        </div>

        <div class="autoplay-countdown-timer">
          <div class="autoplay-countdown-circle">
            <svg class="autoplay-countdown-svg" viewBox="0 0 100 100">
              <circle class="autoplay-countdown-bg" cx="50" cy="50" r="45"></circle>
              <circle class="autoplay-countdown-progress" cx="50" cy="50" r="45" id="countdownCircle"></circle>
            </svg>
            <div class="autoplay-countdown-number" id="countdownNumber">${this.timeRemaining}</div>
          </div>
          <div class="autoplay-countdown-text">Lecture dans <span id="countdownText">${this.timeRemaining}</span> secondes</div>
        </div>

        <div class="autoplay-actions">
          <button class="autoplay-action-btn secondary" id="replayEpisode">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            Revoir cet épisode
          </button>
          <button class="autoplay-action-btn primary" id="playNowBtn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Lire maintenant
          </button>
        </div>
      </div>
    `;

    // Ajouter au DOM
    const playerWrapper = document.querySelector(".video-player-wrapper");
    if (playerWrapper) {
      playerWrapper.appendChild(overlay);

      // Event listeners
      document.getElementById("cancelAutoPlay").addEventListener("click", () => {
        this.cancelCountdown();
      });

      document.getElementById("playNowBtn").addEventListener("click", () => {
        this.playNextEpisode(nextEpisode);
      });

      document.getElementById("replayEpisode").addEventListener("click", () => {
        this.cancelCountdown();
        if (this.videoPlayer && this.videoPlayer.plyrInstance) {
          this.videoPlayer.plyrInstance.currentTime = 0;
          this.videoPlayer.plyrInstance.play();
        }
      });

      // Animation d'apparition
      setTimeout(() => overlay.classList.add("show"), 10);
    }

    this.countdownOverlay = overlay;
  }

  /**
   * Met à jour l'affichage du countdown
   */
  updateCountdownDisplay() {
    const numberEl = document.getElementById("countdownNumber");
    const textEl = document.getElementById("countdownText");
    const circleEl = document.getElementById("countdownCircle");

    if (numberEl) numberEl.textContent = this.timeRemaining;
    if (textEl) textEl.textContent = this.timeRemaining;

    // Mettre à jour le cercle de progression
    if (circleEl) {
      const totalDelay = this.getDelay();
      const progress = (this.timeRemaining / totalDelay) * 283; // 283 = circonférence du cercle
      circleEl.style.strokeDashoffset = progress;
    }
  }

  /**
   * Lance le prochain épisode
   */
  playNextEpisode(nextEpisode) {
    this.cancelCountdown();

    console.log("🎬 Lecture automatique du prochain épisode:", nextEpisode);

    // Utiliser la méthode de l'app pour charger l'épisode
    if (this.animeApp && this.animeApp.loadEpisodeByIndex) {
      this.animeApp.loadEpisodeByIndex(nextEpisode.index);
    }
  }

  /**
   * Annule le countdown
   */
  cancelCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    this.isCountingDown = false;
    this.removeCountdownOverlay();
  }

  /**
   * Supprime l'overlay de countdown
   */
  removeCountdownOverlay() {
    if (this.countdownOverlay) {
      this.countdownOverlay.classList.remove("show");
      setTimeout(() => {
        if (this.countdownOverlay && this.countdownOverlay.parentElement) {
          this.countdownOverlay.remove();
        }
        this.countdownOverlay = null;
      }, 300);
    }
  }

  /**
   * Nettoie les ressources
   */
  cleanup() {
    this.cancelCountdown();
  }
}

// Styles CSS pour l'overlay de countdown
const styles = document.createElement("style");
styles.textContent = `
  /* === OVERLAY AUTOPLAY === */
  .autoplay-countdown-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .autoplay-countdown-overlay.show {
    opacity: 1;
  }

  .autoplay-countdown-content {
    max-width: 500px;
    width: 90%;
    padding: 2rem;
    text-align: center;
  }

  .autoplay-countdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .autoplay-countdown-header h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #fafafa;
    margin: 0;
  }

  .autoplay-cancel-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #a1a1aa;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .autoplay-cancel-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fafafa;
  }

  .autoplay-episode-info {
    margin-bottom: 2rem;
  }

  .autoplay-episode-number {
    font-size: 0.875rem;
    font-weight: 600;
    color: #a78bfa;
    margin-bottom: 0.5rem;
  }

  .autoplay-episode-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #fafafa;
  }

  .autoplay-countdown-timer {
    margin-bottom: 2rem;
  }

  .autoplay-countdown-circle {
    position: relative;
    width: 120px;
    height: 120px;
    margin: 0 auto 1rem;
  }

  .autoplay-countdown-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .autoplay-countdown-bg {
    fill: none;
    stroke: rgba(255, 255, 255, 0.1);
    stroke-width: 4;
  }

  .autoplay-countdown-progress {
    fill: none;
    stroke: #8b5cf6;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-dasharray: 283;
    stroke-dashoffset: 283;
    transition: stroke-dashoffset 1s linear;
  }

  .autoplay-countdown-number {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 2.5rem;
    font-weight: 700;
    color: #fafafa;
  }

  .autoplay-countdown-text {
    font-size: 1rem;
    color: #a1a1aa;
  }

  .autoplay-countdown-text span {
    color: #fafafa;
    font-weight: 600;
  }

  .autoplay-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .autoplay-action-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 10px;
    border: none;
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .autoplay-action-btn.primary {
    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    color: white;
  }

  .autoplay-action-btn.primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 25px -5px rgba(139, 92, 246, 0.4);
  }

  .autoplay-action-btn.secondary {
    background: rgba(255, 255, 255, 0.05);
    color: #e4e4e7;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .autoplay-action-btn.secondary:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 768px) {
    .autoplay-countdown-content {
      padding: 1.5rem;
    }

    .autoplay-actions {
      flex-direction: column;
    }

    .autoplay-action-btn {
      width: 100%;
      justify-content: center;
    }
  }
`;
document.head.appendChild(styles);

