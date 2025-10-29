/**
 * Gestionnaire du lecteur vidéo avec support Plyr et HLS
 */

export class VideoPlayer {
    constructor() {
        this.videoPlayer = null;
        this.plyrInstance = null;
        this.hlsInstance = null;
    }

    initialize() {
        if (this.plyrInstance) return;

        this.videoPlayer = document.getElementById('videoPlayer');
        if (!this.videoPlayer) return;

        const options = {
            controls: [
                'play-large',
                'play',
                'progress',
                'current-time',
                'duration',
                'mute',
                'volume',
                'settings',
                'fullscreen'
            ],
            settings: ['quality', 'speed'],
            quality: {
                default: 720,
                options: [1080, 720, 480, 360]
            },
            speed: {
                selected: 1,
                options: [0.5, 0.75, 1, 1.25, 1.5, 2]
            },
            keyboard: {
                focused: true,
                global: false
            },
            tooltips: {
                controls: true,
                seek: true
            },
            captions: {
                active: false,
                language: 'auto',
                update: false
            },
            fullscreen: {
                enabled: true,
                fallback: true,
                iosNative: false
            },
            ratio: null,
            aspectRatio: '16:9',
            clickToPlay: true,
            hideControls: true,
            resetOnEnd: false,
            disableContextMenu: false
        };

        this.plyrInstance = new Plyr(this.videoPlayer, options);

        this.attachEventListeners();
    }

    attachEventListeners() {
        this.plyrInstance.on('ready', () => {
            console.log('Plyr player ready');
        });

        this.plyrInstance.on('play', () => {
            console.log('Video playing');
        });

        this.plyrInstance.on('pause', () => {
            console.log('Video paused');
        });

        this.plyrInstance.on('ended', () => {
            console.log('Video ended');
        });

        this.plyrInstance.on('error', (event) => {
            console.error('❌ Erreur Plyr:', event);
            this.handleVideoError();
        });

        this.videoPlayer.addEventListener('error', (e) => {
            console.error('❌ Erreur élément video:', e);
            this.handleVideoError();
        });

        this.videoPlayer.addEventListener('loadstart', () => {
            console.log('📡 Début du chargement de la vidéo');
        });

        this.videoPlayer.addEventListener('loadedmetadata', () => {
            console.log('✅ Métadonnées chargées:', {
                duration: this.videoPlayer.duration,
                videoWidth: this.videoPlayer.videoWidth,
                videoHeight: this.videoPlayer.videoHeight,
                src: this.videoPlayer.currentSrc
            });
        });

        this.videoPlayer.addEventListener('canplay', () => {
            console.log('✅ Vidéo prête à être lue');
        });

        this.videoPlayer.addEventListener('stalled', () => {
            console.warn('⚠️ Chargement ralenti ou bloqué');
        });

        this.videoPlayer.addEventListener('waiting', () => {
            console.warn('⏳ En attente de données...');
        });
    }

    handleVideoError() {
        const error = this.videoPlayer.error;
        if (error) {
            console.error('Code d\'erreur vidéo:', error.code);
            console.error('Message d\'erreur:', error.message);
            switch (error.code) {
                case 1:
                    console.error('🚫 Lecture annulée par l\'utilisateur');
                    break;
                case 2:
                    console.error('🌐 Erreur réseau lors du chargement');
                    break;
                case 3:
                    console.error('🔧 Erreur de décodage');
                    break;
                case 4:
                    console.error('❌ Format non supporté ou source invalide');
                    break;
                default:
                    console.error('❓ Erreur inconnue');
            }
        }
    }

    cleanupHLS() {
        if (this.hlsInstance) {
            try {
                this.hlsInstance.destroy();
            } catch (e) {
                console.error('Erreur lors de la destruction de HLS:', e);
            }
            this.hlsInstance = null;
        }
    }

    isHLS(videoUrl) {
        return videoUrl && (videoUrl.includes('.m3u8') || videoUrl.includes('application/x-mpegURL'));
    }

    loadVideo(videoUrl) {
        if (!videoUrl) {
            console.error('❌ URL vidéo vide');
            return;
        }

        this.cleanupHLS();

        if (!this.videoPlayer) {
            this.videoPlayer = document.getElementById('videoPlayer');
        }

        if (!this.videoPlayer) {
            console.error('❌ Élément video introuvable');
            return;
        }

        let videoSource = document.getElementById('videoSource');
        if (!videoSource) {
            console.warn('⚠️ Élément source introuvable, création...');
            videoSource = document.createElement('source');
            videoSource.id = 'videoSource';
            this.videoPlayer.appendChild(videoSource);
        }

        if (this.isHLS(videoUrl)) {
            console.log('🚀 Détection d\'un flux HLS (m3u8), initialisation de HLS.js...');

            if (Hls.isSupported()) {
                this.hlsInstance = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                    backBufferLength: 90
                });

                this.hlsInstance.loadSource(videoUrl);
                this.hlsInstance.attachMedia(this.videoPlayer);

                this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log('✅ Manifeste HLS parsé avec succès');
                    if (this.hlsInstance.levels && this.hlsInstance.levels.length > 0) {
                        console.log(`${this.hlsInstance.levels.length} niveaux de qualité disponibles`);
                    }
                });

                this.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                    console.error('❌ Erreur HLS:', data);
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                console.log('Tentative de récupération après erreur réseau...');
                                this.hlsInstance.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.log('Tentative de récupération après erreur média...');
                                this.hlsInstance.recoverMediaError();
                                break;
                            default:
                                console.log('Erreur fatale, impossible de récupérer');
                                this.hlsInstance.destroy();
                                break;
                        }
                    }
                });
            } else if (this.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                console.log('✅ Utilisation du support HLS natif (Safari)');
                this.videoPlayer.src = videoUrl;
                this.videoPlayer.load();
            } else {
                console.error('❌ HLS non supporté par ce navigateur');
                alert('Votre navigateur ne supporte pas la lecture des flux HLS. Veuillez utiliser Chrome, Firefox ou Safari.');
            }
        } else {
            console.log('📹 Chargement d\'une vidéo classique:', videoUrl);

            let mimeType = 'video/mp4';
            if (videoUrl.includes('.webm')) {
                mimeType = 'video/webm';
            } else if (videoUrl.includes('.ogg')) {
                mimeType = 'video/ogg';
            }

            if (this.plyrInstance) {
                try {
                    this.plyrInstance.source = {
                        type: 'video',
                        sources: [{
                            src: videoUrl,
                            type: mimeType
                        }]
                    };
                    console.log('✅ Source Plyr mise à jour via API');
                } catch (e) {
                    console.warn('⚠️ Erreur lors de la mise à jour de Plyr, utilisation directe de l\'élément video', e);
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
}

