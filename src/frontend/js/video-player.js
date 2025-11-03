/**
 * Gestionnaire du lecteur vidéo avec support Plyr et HLS
 */

export class VideoPlayer {
  constructor() {
    this.videoPlayer = null;
    this.plyrInstance = null;
    this.hlsInstance = null;
    this.progressSaveInterval = null;
    this.currentAnimeId = null;
    this.currentEpisodeNumber = null;
  }

  initialize() {
    if (this.plyrInstance) return;

    this.videoPlayer = document.getElementById("videoPlayer");
    if (!this.videoPlayer) return;

    const options = {
      controls: [
        "play-large",
        "play",
        "progress",
        "current-time",
        "duration",
        "mute",
        "volume",
        "settings",
        "fullscreen",
      ],
      settings: ["speed"],
      speed: {
        selected: 1,
        options: [0.5, 0.75, 1, 1.25, 1.5, 2],
      },
      keyboard: {
        focused: true,
        global: false,
      },
      tooltips: {
        controls: true,
        seek: true,
      },
      captions: {
        active: false,
        language: "auto",
        update: false,
      },
      fullscreen: {
        enabled: true,
        fallback: true,
        iosNative: false,
      },
      ratio: null,
      aspectRatio: "16:9",
      clickToPlay: true,
      hideControls: true,
      resetOnEnd: false,
      disableContextMenu: false,
    };

    this.plyrInstance = new Plyr(this.videoPlayer, options);

    this.attachEventListeners();
  }

  attachEventListeners() {
    this.plyrInstance.on("ready", () => {
      console.log("Plyr player ready");
    });

    this.plyrInstance.on("play", () => {
      console.log("Video playing");
      this.startProgressTracking();
    });

    this.plyrInstance.on("pause", () => {
      console.log("Video paused");
      this.saveCurrentProgress();
    });

    this.plyrInstance.on("ended", () => {
      console.log("Video ended");
      this.markAsCompleted();
      this.stopProgressTracking();
    });

    this.plyrInstance.on("error", (event) => {
      console.error("❌ Erreur Plyr:", event);
      this.handleVideoError();
    });

    this.videoPlayer.addEventListener("error", (e) => {
      console.error("❌ Erreur élément video:", e);
      this.handleVideoError();
    });

    this.videoPlayer.addEventListener("loadstart", () => {
      console.log("📡 Début du chargement de la vidéo");
    });

    this.videoPlayer.addEventListener("loadedmetadata", () => {
      console.log("✅ Métadonnées chargées:", {
        duration: this.videoPlayer.duration,
        videoWidth: this.videoPlayer.videoWidth,
        videoHeight: this.videoPlayer.videoHeight,
        src: this.videoPlayer.currentSrc,
      });
    });

    this.videoPlayer.addEventListener("canplay", () => {
      console.log("✅ Vidéo prête à être lue");
    });

    this.videoPlayer.addEventListener("stalled", () => {
      console.warn("⚠️ Chargement ralenti ou bloqué");
    });

    this.videoPlayer.addEventListener("waiting", () => {
      console.warn("⏳ En attente de données...");
    });
  }

  handleVideoError() {
    const error = this.videoPlayer.error;
    if (error) {
      console.error("Code d'erreur vidéo:", error.code);
      console.error("Message d'erreur:", error.message);
      switch (error.code) {
        case 1:
          console.error("🚫 Lecture annulée par l'utilisateur");
          break;
        case 2:
          console.error("🌐 Erreur réseau lors du chargement");
          break;
        case 3:
          console.error("🔧 Erreur de décodage");
          break;
        case 4:
          console.error("❌ Format non supporté ou source invalide");
          break;
        default:
          console.error("❓ Erreur inconnue");
      }
    }
  }

  cleanupHLS() {
    this.stopProgressTracking();
    if (this.hlsInstance) {
      try {
        this.hlsInstance.destroy();
      } catch (e) {
        console.error("Erreur lors de la destruction de HLS:", e);
      }
      this.hlsInstance = null;
    }
  }

  // Suivi de la progression
  setEpisodeInfo(animeId, episodeNumber, seasonId = null, animeInfo = {}) {
    this.currentAnimeId = animeId;
    this.currentEpisodeNumber = episodeNumber;
    this.currentSeasonId = seasonId;
    this.currentAnimeInfo = animeInfo;
  }

  async restoreProgress() {
    if (
      !this.currentAnimeId ||
      !this.currentEpisodeNumber ||
      !this.currentSeasonId
    ) {
      return;
    }

    try {
      // Charger les paramètres utilisateur
      const settings = this.loadSettings();

      // Si le tracking est désactivé, ne rien faire
      if (!settings.trackProgress) {
        return;
      }

      // Récupérer la progression depuis le nouveau système
      const result = await window.electronAPI.getVideoProgress({
        animeId: this.currentAnimeId,
        seasonId: this.currentSeasonId,
        episodeIndex: this.currentEpisodeNumber - 1,
      });

      if (result.success && result.progress) {
        const progress = result.progress;

        // Vérifier si la progression est significative (> 5% et < 95%)
        if (progress.progressPercent > 5 && progress.progressPercent < 95) {
          if (settings.autoResume) {
            // Mode automatique : reprendre directement
            this.resumeAtTime(progress.currentTime);
            this.showResumeNotification(progress, true);
          } else {
            // Mode manuel : afficher le bouton de reprise
            this.showResumeButton(progress);
          }
        }
      }
    } catch (error) {
      console.error("Erreur lors de la restauration de la progression:", error);
    }
  }

  loadSettings() {
    const defaultSettings = {
      trackProgress: true,
      autoResume: false,
    };
    const saved = localStorage.getItem("nartya_settings");
    return saved
      ? { ...defaultSettings, ...JSON.parse(saved) }
      : defaultSettings;
  }

  resumeAtTime(time) {
    if (this.plyrInstance) {
      setTimeout(() => {
        this.plyrInstance.currentTime = time;
        console.log(`📍 Reprise à ${time}s`);
      }, 500);
    }
  }

  seekToTime(time) {
    if (this.plyrInstance) {
      // Attendre que la vidéo soit prête avant de seek
      const trySeek = () => {
        if (this.plyrInstance.duration > 0) {
          this.plyrInstance.currentTime = time;
          console.log(`⏩ Seek à ${time}s`);
        } else {
          setTimeout(trySeek, 100);
        }
      };
      setTimeout(trySeek, 500);
    }
  }

  showResumeButton(progress) {
    // Supprimer l'ancien bouton s'il existe
    const oldButton = document.querySelector(".resume-button");
    if (oldButton) oldButton.remove();

    // Créer le bouton de reprise
    const button = document.createElement("div");
    button.className = "resume-button";

    const minutes = Math.floor(progress.currentTime / 60);
    const seconds = Math.floor(progress.currentTime % 60);
    const timeString = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    button.innerHTML = `
      <div class="resume-button-content">
        <div class="resume-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 1 0 18 0 9 9 0 1 0 -18 0"></path>
            <path d="M12 7v5l3 3"></path>
          </svg>
        </div>
        <div class="resume-text">
          <div class="resume-title">Reprendre la lecture</div>
          <div class="resume-time">${timeString} • ${progress.progressPercent}%</div>
        </div>
        <button class="resume-action-btn" data-action="resume">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Reprendre
        </button>
        <button class="resume-action-btn secondary" data-action="restart">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          Recommencer
        </button>
      </div>
    `;

    // Ajouter au DOM
    const playerContainer = document.querySelector(".video-player-wrapper");
    if (playerContainer) {
      playerContainer.appendChild(button);

      // Event listeners
      button
        .querySelector('[data-action="resume"]')
        .addEventListener("click", () => {
          this.resumeAtTime(progress.currentTime);
          button.classList.add("hiding");
          setTimeout(() => button.remove(), 300);
        });

      button
        .querySelector('[data-action="restart"]')
        .addEventListener("click", () => {
          button.classList.add("hiding");
          setTimeout(() => button.remove(), 300);
        });

      // Animer l'apparition
      setTimeout(() => button.classList.add("show"), 100);

      // Auto-masquage après 15 secondes
      setTimeout(() => {
        if (button.parentElement) {
          button.classList.add("hiding");
          setTimeout(() => button.remove(), 300);
        }
      }, 15000);
    }
  }

  showResumeNotification(progress, isAuto = false) {
    // Créer l'élément de notification
    const notification = document.createElement("div");
    notification.className = "resume-notification";
    const minutes = Math.floor(progress.currentTime / 60);
    const seconds = Math.floor(progress.currentTime % 60);
    const timeString = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    notification.innerHTML = `
      <div class="resume-content">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 18 0 9 9 0 1 0 -18 0"></path>
          <path d="M12 7v5l3 3"></path>
        </svg>
        <span>${isAuto ? "Reprise automatique" : "Reprise"} à ${timeString} (${
      progress.progressPercent
    }%)</span>
      </div>
    `;

    // Ajouter au DOM
    const playerContainer = document.querySelector(".video-player-wrapper");
    if (playerContainer) {
      playerContainer.appendChild(notification);

      // Animer l'apparition
      setTimeout(() => notification.classList.add("show"), 100);

      // Retirer après 3 secondes
      setTimeout(() => {
        notification.classList.remove("show");
        setTimeout(() => notification.remove(), 300);
      }, 3000);
    }
  }

  startProgressTracking() {
    this.stopProgressTracking();

    // Sauvegarder toutes les 5 secondes
    this.progressSaveInterval = setInterval(() => {
      this.saveCurrentProgress();
    }, 5000);
  }

  stopProgressTracking() {
    if (this.progressSaveInterval) {
      clearInterval(this.progressSaveInterval);
      this.progressSaveInterval = null;
    }
  }

  async saveCurrentProgress() {
    if (
      !this.currentAnimeId ||
      !this.currentEpisodeNumber ||
      !this.plyrInstance
    )
      return;

    // Vérifier si le tracking est activé
    const settings = this.loadSettings();
    if (!settings.trackProgress) return;

    try {
      const currentTime = this.plyrInstance.currentTime;
      const duration = this.plyrInstance.duration;

      if (currentTime > 0 && duration > 0) {
        // Sauvegarder avec l'ancien système (watch history)
        await window.electronAPI.saveWatchProgress({
          animeId: this.currentAnimeId,
          episodeNumber: this.currentEpisodeNumber,
          currentTime,
          duration,
        });

        // Sauvegarder avec le nouveau système (video progress) si on a les infos
        if (this.currentSeasonId) {
          await window.electronAPI.saveVideoProgress({
            animeId: this.currentAnimeId,
            seasonId: this.currentSeasonId,
            episodeIndex: this.currentEpisodeNumber - 1,
            currentTime,
            duration,
            animeInfo: this.currentAnimeInfo,
          });
        }
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de la progression:", error);
    }
  }

  async markAsCompleted() {
    if (!this.currentAnimeId || !this.currentEpisodeNumber) return;

    try {
      await window.electronAPI.markEpisodeCompleted({
        animeId: this.currentAnimeId,
        episodeNumber: this.currentEpisodeNumber,
      });
      console.log("✅ Épisode marqué comme terminé");
    } catch (error) {
      console.error("Erreur lors du marquage comme terminé:", error);
    }
  }

  isHLS(videoUrl) {
    return (
      videoUrl &&
      (videoUrl.includes(".m3u8") || videoUrl.includes("application/x-mpegURL"))
    );
  }

  loadVideo(videoUrl) {
    if (!videoUrl) {
      console.error("❌ URL vidéo vide");
      return;
    }

    this.cleanupHLS();

    if (!this.videoPlayer) {
      this.videoPlayer = document.getElementById("videoPlayer");
    }

    if (!this.videoPlayer) {
      console.error("❌ Élément video introuvable");
      return;
    }

    let videoSource = document.getElementById("videoSource");
    if (!videoSource) {
      console.warn("⚠️ Élément source introuvable, création...");
      videoSource = document.createElement("source");
      videoSource.id = "videoSource";
      this.videoPlayer.appendChild(videoSource);
    }

    if (this.isHLS(videoUrl)) {
      console.log(
        "🚀 Détection d'un flux HLS (m3u8), initialisation de HLS.js..."
      );

      if (Hls.isSupported()) {
        this.hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
        });

        this.hlsInstance.loadSource(videoUrl);
        this.hlsInstance.attachMedia(this.videoPlayer);

        this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log("✅ Manifeste HLS parsé avec succès");
          if (this.hlsInstance.levels && this.hlsInstance.levels.length > 0) {
            console.log(
              `${this.hlsInstance.levels.length} niveaux de qualité disponibles`
            );

            // Mettre à jour les options de qualité dans Plyr
            this.updatePlyrQualityOptions();
          }
        });

        this.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
          console.error("❌ Erreur HLS:", data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log("Tentative de récupération après erreur réseau...");
                this.hlsInstance.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log("Tentative de récupération après erreur média...");
                this.hlsInstance.recoverMediaError();
                break;
              default:
                console.log("Erreur fatale, impossible de récupérer");
                this.hlsInstance.destroy();
                break;
            }
          }
        });
      } else if (
        this.videoPlayer.canPlayType("application/vnd.apple.mpegurl")
      ) {
        console.log("✅ Utilisation du support HLS natif (Safari)");
        this.videoPlayer.src = videoUrl;
        this.videoPlayer.load();
      } else {
        console.error("❌ HLS non supporté par ce navigateur");
        alert(
          "Votre navigateur ne supporte pas la lecture des flux HLS. Veuillez utiliser Chrome, Firefox ou Safari."
        );
      }
    } else {
      console.log("📹 Chargement d'une vidéo classique:", videoUrl);

      let mimeType = "video/mp4";
      if (videoUrl.includes(".webm")) {
        mimeType = "video/webm";
      } else if (videoUrl.includes(".ogg")) {
        mimeType = "video/ogg";
      }

      if (this.plyrInstance) {
        try {
          this.plyrInstance.source = {
            type: "video",
            sources: [
              {
                src: videoUrl,
                type: mimeType,
              },
            ],
          };
          console.log("✅ Source Plyr mise à jour via API");
        } catch (e) {
          console.warn(
            "⚠️ Erreur lors de la mise à jour de Plyr, utilisation directe de l'élément video",
            e
          );
          if (videoSource) {
            videoSource.src = videoUrl;
            videoSource.type = mimeType;
          } else {
            this.videoPlayer.src = videoUrl;
          }
          this.videoPlayer.load();
        }
      } else {
        if (videoSource) {
          videoSource.src = videoUrl;
          videoSource.type = mimeType;
        } else {
          this.videoPlayer.src = videoUrl;
        }
        this.videoPlayer.load();
      }

      // Restaurer la progression et lancer la vidéo après le chargement
      this.videoPlayer.addEventListener(
        "loadedmetadata",
        () => {
          this.restoreProgress();
          // Lancer automatiquement la vidéo
          if (this.plyrInstance) {
            this.plyrInstance.play();
          }
        },
        { once: true }
      );
    }
  }

  pause() {
    if (this.plyrInstance) {
      this.plyrInstance.pause();
    }
  }

  play() {
    if (this.plyrInstance) {
      this.plyrInstance.play();
    }
  }

  /**
   * Met à jour les options de qualité dans Plyr depuis les niveaux HLS disponibles
   */
  updatePlyrQualityOptions() {
    if (!this.hlsInstance || !this.plyrInstance) return;

    const levels = this.hlsInstance.levels;
    if (!levels || levels.length === 0) return;

    // Créer la liste des qualités disponibles (format Plyr)
    const qualityOptions = [];

    // Ajouter "Auto" en premier
    qualityOptions.push({ label: "Auto", value: -1 });

    // Ajouter chaque niveau de qualité disponible
    levels.forEach((level, index) => {
      const height =
        level.height ||
        (level.attrs?.RESOLUTION ? level.attrs.RESOLUTION.split("x")[1] : null);
      const bitrate = level.bitrate
        ? ` (${Math.round(level.bitrate / 1000)}k)`
        : "";
      const label = height
        ? `${height}p${bitrate}`
        : `Niveau ${index + 1}${bitrate}`;
      qualityOptions.push({ label, value: index });
    });

    // Mettre à jour Plyr avec les nouvelles options de qualité
    try {
      // Plyr utilise un format spécifique pour les qualités
      // On doit accéder directement aux contrôles de qualité
      const qualityMenu =
        this.plyrInstance.elements?.buttons?.settings?.querySelector(
          '[data-plyr="quality"]'
        );

      if (qualityMenu) {
        // Supprimer les anciennes options
        const menuItems = qualityMenu.querySelectorAll(
          '[role="menuitemradio"]'
        );
        menuItems.forEach((item) => item.remove());

        // Ajouter les nouvelles options
        qualityOptions.forEach((option, index) => {
          const menuItem = document.createElement("button");
          menuItem.setAttribute("role", "menuitemradio");
          menuItem.setAttribute("aria-checked", index === 0 ? "true" : "false");
          menuItem.setAttribute("data-plyr-quality", option.value);
          menuItem.textContent = option.label;
          menuItem.addEventListener("click", () => {
            if (option.value >= 0 && option.value < levels.length) {
              console.log(`🎬 Changement de qualité vers: ${option.label}`);
              this.hlsInstance.currentLevel = option.value;
            } else {
              console.log("🎬 Qualité automatique activée");
              this.hlsInstance.currentLevel = -1; // Auto
            }
          });
          qualityMenu.appendChild(menuItem);
        });
      }

      // Écouter les changements de niveau HLS pour mettre à jour l'affichage
      this.hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        const currentLevel = data.level;
        console.log(`✅ Qualité changée vers niveau ${currentLevel}`);
      });

      console.log(
        "✅ Options de qualité HLS disponibles:",
        qualityOptions.map((q) => q.label).join(", ")
      );
    } catch (e) {
      console.warn("⚠️ Impossible de mettre à jour les options de qualité:", e);
      // Fallback : afficher les niveaux dans la console pour debug
      console.log(
        "Niveaux HLS disponibles:",
        levels.map((l, i) => ({
          index: i,
          height: l.height,
          bitrate: l.bitrate,
          resolution: l.attrs?.RESOLUTION,
        }))
      );
    }
  }
}
