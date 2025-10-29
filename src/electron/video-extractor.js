/**
 * Module d'extraction vidéo - Version optimisée
 * Gère l'extraction des URLs vidéo depuis les pages embed
 * 
 * Optimisations :
 * - Timeouts réduits (8s → 3s)
 * - Approche parallèle (race condition)
 * - Pre-injection des hooks
 * - Filtrage intelligent des requêtes
 * - Early return optimisé
 */

const { BrowserWindow, session } = require('electron');

class VideoExtractor {
    constructor() {
        this.networkTimeout = 3000;  // Réduit de 8000ms
        this.hookTimeout = 2000;     // Réduit de 8000ms
        this.loadWaitTime = 500;     // Réduit de 1200ms

        // Liste d'exclusions pour filtrage rapide
        this.excludedDomains = [
            'google-analytics', 'googletagmanager', 'doubleclick',
            'facebook.com/tr', 'analytics', 'trackers', 'ads',
            'pixel', 'beacon', 'metrics'
        ];
    }

    /**
     * Correction d'URL embed
     */
    correctEmbedUrl(embedUrl) {
        return embedUrl.replace('vidmoly.to', 'vidmoly.net');
    }

    /**
     * Configure la session avec les headers requis (pour extraction ET lecture)
     */
    configureSession(ses, includeVideoPlayback = false) {
        ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
            // Headers pour Vidmoly
            if (details.url.includes('vidmoly')) {
                details.requestHeaders['Referer'] = 'https://anime-sama.fr/';
                details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            }

            // Headers pour Sibnet (important pour éviter 403 Forbidden)
            if (details.url.includes('sibnet')) {
                details.requestHeaders['Referer'] = 'https://video.sibnet.ru/';
                details.requestHeaders['Origin'] = 'https://video.sibnet.ru';
                details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            }

            // Headers pour SendVid
            if (details.url.includes('sendvid')) {
                details.requestHeaders['Referer'] = 'https://sendvid.com/';
                details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            }

            // Si mode lecture vidéo, ajouter headers pour TOUTES les requêtes de fichiers vidéo
            if (includeVideoPlayback) {
                const urlLower = details.url.toLowerCase();
                if (/\.(mp4|m3u8|ts|webm|mkv)(\?|$)/i.test(urlLower)) {
                    // Déterminer le referer approprié selon le domaine
                    if (!details.requestHeaders['Referer']) {
                        if (details.url.includes('sibnet')) {
                            details.requestHeaders['Referer'] = 'https://video.sibnet.ru/';
                            details.requestHeaders['Origin'] = 'https://video.sibnet.ru';
                        } else if (details.url.includes('vidmoly')) {
                            details.requestHeaders['Referer'] = 'https://anime-sama.fr/';
                        } else if (details.url.includes('sendvid')) {
                            details.requestHeaders['Referer'] = 'https://sendvid.com/';
                        }
                    }
                }
            }

            callback({ requestHeaders: details.requestHeaders });
        });
    }

    /**
     * Vérifie si une URL doit être exclue (filtrage rapide)
     */
    shouldExclude(url = '') {
        try {
            const urlLower = url.toLowerCase();

            // Exclusion des domaines analytics/ads
            if (this.excludedDomains.some(domain => urlLower.includes(domain))) {
                return true;
            }

            // Exclusion des extensions non-vidéo (IMPORTANT !)
            const urlWithoutQuery = urlLower.split('?')[0];
            const nonVideoExtensions = [
                '.js', '.css', '.json', '.xml', '.html', '.htm',
                '.woff', '.woff2', '.ttf', '.otf', '.eot',  // Fonts
                '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',  // Images
                '.map', '.txt', '.pdf', '.zip', '.gz'
            ];

            if (nonVideoExtensions.some(ext => urlWithoutQuery.endsWith(ext))) {
                return true;
            }

            // Exclusion des patterns JavaScript courants
            if (urlLower.includes('jwplayer') ||
                urlLower.includes('player.js') ||
                urlLower.includes('video.js') ||
                urlLower.includes('hls.js') ||
                urlLower.includes('plyr.js') ||
                urlLower.includes('/js/') ||
                urlLower.includes('/javascript/') ||
                urlLower.includes('/scripts/')) {
                return true;
            }

            return false;
        } catch { return false; }
    }

    /**
     * Vérifie si une URL est candidate pour être une vidéo (optimisé avec filtrage strict)
     */
    isVideoCandidate(url = '') {
        try {
            // Exclusion rapide des fichiers non-vidéo
            if (this.shouldExclude(url)) return false;

            const urlLower = url.toLowerCase();
            const urlWithoutQuery = urlLower.split('?')[0];

            if (!urlWithoutQuery) return false;

            // ✅ VÉRIFICATION POSITIVE : Extensions vidéo courantes
            const videoExtensions = /\.(mp4|m3u8|ts|webm|mkv|avi|mov|flv|mpd)$/i;
            if (videoExtensions.test(urlWithoutQuery)) {
                console.log('✅ Extension vidéo détectée:', urlWithoutQuery.match(videoExtensions)[0]);
                return true;
            }

            // ⚠️ VÉRIFICATION CONTEXTUELLE : Patterns de chemins vidéo
            // Mais SEULEMENT si l'URL contient aussi des indices de vidéo
            const hasVideoPath = /\/(video|videos|media|stream|embed)\//i.test(urlLower);
            const hasVideoIndicator = /\b(mp4|m3u8|ts|webm|playlist|manifest|chunk|segment)\b/i.test(urlLower);

            if (hasVideoPath && hasVideoIndicator) {
                console.log('✅ Pattern vidéo + indicateur détecté');
                return true;
            }

            // 🎯 PATTERNS SPÉCIFIQUES AUX PROVIDERS (avec vérification stricte)
            if (urlLower.includes('vidmoly')) {
                if (/\.(mp4|m3u8)/i.test(urlLower)) {
                    console.log('✅ Vidmoly vidéo détectée');
                    return true;
                }
            }

            if (urlLower.includes('sendvid')) {
                if (/\.(mp4|m3u8)/i.test(urlLower)) {
                    console.log('✅ SendVid vidéo détectée');
                    return true;
                }
            }

            if (urlLower.includes('sibnet')) {
                // Sibnet : vérifier que c'est bien un fichier vidéo, pas juste le mot "video" dans l'URL
                if (/video.*\.(mp4|m3u8)/i.test(urlLower) || /\/(video|vid)\d+/i.test(urlLower)) {
                    console.log('✅ Sibnet vidéo détectée');
                    return true;
                }
            }

            return false;
        } catch { return false; }
    }

    /**
     * Intercepte les requêtes réseau pour trouver l'URL vidéo (optimisé)
     */
    interceptNetwork(ses, timeoutMs) {
        return new Promise((resolve) => {
            let done = false;
            let handlers = [];

            const cleanup = () => {
                handlers.forEach(({ event, handler }) => {
                    try {
                        if (event === 'onBeforeRequest') {
                            ses.webRequest.onBeforeRequest(null);
                        } else if (event === 'onCompleted') {
                            ses.webRequest.onCompleted(null);
                        }
                    } catch (e) { /* ignore */ }
                });
                handlers = [];
            };

            const timer = setTimeout(() => {
                if (!done) {
                    done = true;
                    cleanup();
                    resolve(null);
                }
            }, timeoutMs);

            const filter = { urls: ['*://*/*'] };

            const beforeHandler = (details, callback) => {
                try {
                    if (done) { callback({}); return; }

                    // Filtrage rapide
                    if (!this.isVideoCandidate(details.url)) {
                        callback({});
                        return;
                    }

                    console.log('🎯 Vidéo candidate trouvée (beforeRequest):', details.url.substring(0, 100));
                    done = true;
                    clearTimeout(timer);
                    cleanup();
                    resolve(details.url);
                } catch (e) { /* ignore */ }
                callback({});
            };

            const completedHandler = (details) => {
                try {
                    if (done) return;

                    // Filtrage rapide
                    if (!this.isVideoCandidate(details.url)) return;

                    console.log('🎯 Vidéo candidate trouvée (completed):', details.url.substring(0, 100));
                    done = true;
                    clearTimeout(timer);
                    cleanup();
                    resolve(details.url);
                } catch (e) { }
            };

            handlers.push(
                { event: 'onBeforeRequest', handler: beforeHandler },
                { event: 'onCompleted', handler: completedHandler }
            );

            ses.webRequest.onBeforeRequest(filter, beforeHandler);
            ses.webRequest.onCompleted(filter, completedHandler);
        });
    }

    /**
     * Cherche l'URL vidéo dans le DOM
     */
    async checkDomForDirectUrl(win) {
        try {
            return await win.webContents.executeJavaScript(`
                (function() {
                    const videos = Array.from(document.querySelectorAll('video, source'));
                    for (const el of videos) {
                        const src = el.src || el.currentSrc || (el.getAttribute && el.getAttribute('src'));
                        if (src && !src.startsWith('blob:')) return src;
                    }
                    const scriptsText = Array.from(document.scripts).map(s => s.textContent).join('\\n');
                    const match = scriptsText.match(/https?:\\/\\/[^\\s'"]+\\.(mp4|m3u8)(\\?[^'"]*)?/i);
                    return match ? match[0] : null;
                })();
            `, true);
        } catch (e) { return null; }
    }

    /**
     * Injecte des hooks pour capturer les appels fetch/XHR (optimisé avec timeout réduit)
     */
    async injectHooks(win, timeoutMs) {
        try {
            const res = await win.webContents.executeJavaScript(`
                (function() {
                    return new Promise((resolve) => {
                        let resolved = false;
                        
                        const safeResolve = (result) => {
                            if (!resolved) {
                                resolved = true;
                                resolve(result);
                            }
                        };
                        
                        // Hook fetch
                        const origFetch = window.fetch;
                        window.fetch = function(resource) {
                            try {
                                const url = (typeof resource === 'string') ? resource : (resource && resource.url);
                                if (url && /\\.(m3u8|mp4|ts|webm)(\\?|$)/i.test(url)) {
                                    safeResolve({ type: 'fetch', url: url.toString() });
                                }
                            } catch(e){}
                            return origFetch.apply(this, arguments);
                        };
        
                        // Hook XMLHttpRequest
                        const origOpen = XMLHttpRequest.prototype.open;
                        XMLHttpRequest.prototype.open = function(method, url) {
                            try {
                                if (url && /\\.(m3u8|mp4|ts|webm)(\\?|$)/i.test(url)) {
                                    safeResolve({ type: 'xhr', url: url.toString() });
                                }
                            } catch(e){}
                            return origOpen.apply(this, arguments);
                        };
        
                        // MutationObserver pour détecter l'ajout de <video>
                        const obs = new MutationObserver(() => {
                            const v = document.querySelector('video, source');
                            if (v) {
                                const src = v.src || v.currentSrc || (v.getAttribute && v.getAttribute('src'));
                                if (src && !src.startsWith('blob:')) {
                                    obs.disconnect();
                                    safeResolve({ type: 'dom', url: src });
                                }
                            }
                        });
                        
                        if (document.body) {
                            obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
                        } else {
                            document.addEventListener('DOMContentLoaded', () => {
                                obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
                            });
                        }
        
                        setTimeout(() => safeResolve(null), ${timeoutMs});
                    });
                })();
            `, true);
            return res;
        } catch (e) {
            return null;
        }
    }

    /**
     * Extrait l'URL vidéo depuis une page embed (VERSION OPTIMISÉE - Approche parallèle)
     */
    async extractVideoUrl(embedUrl) {
        const startTime = Date.now();
        console.log('🎬 [OPTIMISÉ] Extraction vidéo:', embedUrl);

        const correctedUrl = this.correctEmbedUrl(embedUrl);
        const partition = `videoplayer-temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const ses = session.fromPartition(partition);

        this.configureSession(ses);

        const win = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                session: ses,
                enablePreferredSizeMode: false  // Optimisation mémoire
            }
        });

        try {
            // Démarrer l'interception réseau AVANT le chargement
            const networkPromise = this.interceptNetwork(ses, this.networkTimeout);

            // Charger la page avec gestion d'erreur
            let loadError = null;
            try {
                await win.loadURL(correctedUrl);
            } catch (loadErr) {
                loadError = loadErr;
                console.error('❌ Erreur de chargement de la page:', loadErr.message);

                // Vérifier si c'est une erreur réseau (source indisponible)
                if (loadErr.message.includes('ERR_NAME_NOT_RESOLVED') ||
                    loadErr.message.includes('ERR_CONNECTION_REFUSED') ||
                    loadErr.message.includes('ERR_CONNECTION_TIMED_OUT') ||
                    loadErr.message.includes('ERR_INTERNET_DISCONNECTED')) {
                    try { win.close(); } catch (e) { }
                    return {
                        success: false,
                        error: 'Source indisponible',
                        userMessage: 'Cette source n\'est pas disponible. Veuillez essayer une autre source.',
                        errorCode: 'SOURCE_UNAVAILABLE'
                    };
                }

                // Vérifier si c'est une erreur 404 ou 500
                if (loadErr.message.includes('404') || loadErr.message.includes('500') ||
                    loadErr.message.includes('503') || loadErr.message.includes('ERR_ABORTED')) {
                    try { win.close(); } catch (e) { }
                    return {
                        success: false,
                        error: 'Page non trouvée',
                        userMessage: 'Cette vidéo n\'existe plus ou a été supprimée. Veuillez essayer une autre source.',
                        errorCode: 'PAGE_NOT_FOUND'
                    };
                }

                // Si erreur mais on peut continuer, on tente quand même
                if (!loadErr.message.includes('ERR_ABORTED')) {
                    throw loadErr;
                }
            }

            // Attente réduite pour laisser la page s'initialiser
            await new Promise(r => setTimeout(r, this.loadWaitTime));

            // **APPROCHE PARALLÈLE** : Lancer toutes les méthodes en même temps
            const parallelPromises = [
                // 1. Réseau (déjà en cours)
                networkPromise,

                // 2. Check DOM direct
                this.checkDomForDirectUrl(win).catch(() => null),

                // 3. Injection de hooks
                this.injectHooks(win, this.hookTimeout).catch(() => null)
            ];

            // Race : la première méthode qui trouve quelque chose gagne !
            const results = await Promise.all(parallelPromises);

            // Analyser les résultats
            for (let i = 0; i < results.length; i++) {
                const result = results[i];

                if (!result) continue;

                // Résultat du réseau (simple URL string)
                if (typeof result === 'string' && this.isVideoCandidate(result)) {
                    const elapsed = Date.now() - startTime;
                    console.log(`✅ Trouvé via réseau en ${elapsed}ms:`, result.substring(0, 100));
                    try { win.close(); } catch (e) { }
                    return { success: true, videoUrl: result };
                }

                // Résultat des hooks (objet avec type et url)
                if (result && result.url && this.isVideoCandidate(result.url)) {
                    const elapsed = Date.now() - startTime;
                    console.log(`✅ Trouvé via ${result.type} en ${elapsed}ms:`, result.url.substring(0, 100));
                    try { win.close(); } catch (e) { }
                    return { success: true, videoUrl: result.url };
                }
            }

            // Dernier recours : check DOM final pour blob URLs
            const domFinal = await win.webContents.executeJavaScript(`
                (function() {
                    const v = document.querySelector('video');
                    if (!v) return null;
                    return { src: v.src || null, currentSrc: v.currentSrc || null };
                })();
            `, true);

            try { win.close(); } catch (e) { }

            if (domFinal) {
                const candidate = domFinal.src || domFinal.currentSrc;
                if (candidate) {
                    const elapsed = Date.now() - startTime;
                    console.log(`ℹ️ Blob URL trouvée en ${elapsed}ms:`, candidate.substring(0, 100));
                    return {
                        success: true,
                        videoUrl: candidate,
                        note: 'Blob URL - Peut ne pas être téléchargeable directement'
                    };
                }
            }

            const elapsed = Date.now() - startTime;
            console.log(`❌ Aucune URL trouvée après ${elapsed}ms`);
            return {
                success: false,
                error: 'Aucune URL vidéo trouvée',
                userMessage: 'Impossible d\'extraire la vidéo depuis cette source. Le lecteur utilise peut-être un système de protection (DRM) ou cette source n\'est plus valide. Veuillez essayer une autre source.',
                errorCode: 'NO_VIDEO_FOUND'
            };

        } catch (err) {
            try { win.close(); } catch (e) { }
            const elapsed = Date.now() - startTime;
            console.error(`❌ Erreur après ${elapsed}ms:`, err.message);

            // Messages d'erreur utilisateur-friendly
            let userMessage = 'Une erreur s\'est produite lors de l\'extraction. Veuillez réessayer avec une autre source.';
            let errorCode = 'UNKNOWN_ERROR';

            if (err.message.includes('timeout')) {
                userMessage = 'L\'extraction a pris trop de temps. Cette source est peut-être trop lente. Veuillez essayer une autre source.';
                errorCode = 'TIMEOUT';
            } else if (err.message.includes('net::')) {
                userMessage = 'Erreur de connexion réseau. Vérifiez votre connexion internet ou essayez une autre source.';
                errorCode = 'NETWORK_ERROR';
            }

            return {
                success: false,
                error: err && err.message ? err.message : String(err),
                userMessage,
                errorCode
            };
        }
    }

    /**
     * Extrait plusieurs URLs vidéo (optimisé avec délai réduit)
     */
    async extractMultipleVideoUrls(embedUrls) {
        const results = {};
        const totalStart = Date.now();

        console.log(`📦 Extraction multiple: ${embedUrls.length} URLs`);

        for (let i = 0; i < embedUrls.length; i++) {
            const embedUrl = embedUrls[i];
            try {
                console.log(`[${i + 1}/${embedUrls.length}] Extraction...`);
                const result = await this.extractVideoUrl(embedUrl);
                results[embedUrl] = result.success ? result.videoUrl : null;

                // Délai réduit entre extractions (500ms au lieu de 1000ms)
                if (i < embedUrls.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                console.error(`Erreur extraction [${i + 1}/${embedUrls.length}]:`, error.message);
                results[embedUrl] = null;
            }
        }

        const totalElapsed = Date.now() - totalStart;
        const avgTime = totalElapsed / embedUrls.length;
        console.log(`✅ Extraction multiple terminée: ${totalElapsed}ms total (${avgTime.toFixed(0)}ms/vidéo en moyenne)`);

        return results;
    }
}

module.exports = VideoExtractor;

